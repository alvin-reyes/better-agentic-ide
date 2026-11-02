//! Credentials: the guarded CLIs' credential files and folders, the
//! commands that copy, archive or recursively read a folder, and the
//! keychain CLIs. Each read asks.
//!
//! gh keeps its token in the system keyring (service `gh:github.com`), or in
//! plain text in `hosts.yml` under its config folder.

use super::resolve::W;
use super::resolve::{Scope, Q_PH, U_PH};
use super::unwrap::abs;
use super::{Ctx, Guard};
use std::path::{Path, PathBuf};

/// gh's credential files: `hosts.yml` in `$GH_CONFIG_DIR`,
/// `$XDG_CONFIG_HOME/gh` and `~/.config/gh`.
pub fn cred_files(ctx: &Ctx) -> Vec<PathBuf> {
    cred_dirs(ctx).into_iter().map(|d| d.join("hosts.yml")).collect()
}

pub fn cred_dirs(ctx: &Ctx) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(d) = (ctx.env)("GH_CONFIG_DIR").filter(|d| d.starts_with('/')) {
        v.push(PathBuf::from(d));
    }
    if let Some(d) = (ctx.env)("XDG_CONFIG_HOME").filter(|d| d.starts_with('/')) {
        v.push(PathBuf::from(d).join("gh"));
    }
    if let Some(h) = &ctx.home {
        v.push(h.join(".config/gh"));
    }
    v
}

/// Shell glob matching: `*` and `?` don't cross `/`; `[…]` is a class.
pub fn glob_match(pat: &str, s: &str) -> bool {
    let p: Vec<char> = pat.chars().collect();
    let t: Vec<char> = s.chars().collect();
    fn go(p: &[char], t: &[char]) -> bool {
        match p.first() {
            None => t.is_empty(),
            Some('*') => (0..=t.len()).take_while(|&k| k == 0 || t[k - 1] != '/').any(|k| go(&p[1..], &t[k..])),
            Some('?') => !t.is_empty() && t[0] != '/' && go(&p[1..], &t[1..]),
            Some('[') => {
                let Some(end) = p.iter().skip(1).position(|&c| c == ']').map(|e| e + 1) else { return t.first() == Some(&'[') && go(&p[1..], &t[1..]) };
                let Some(&c) = t.first() else { return false };
                let class = &p[1..end];
                let (neg, class) = match class.first() {
                    Some('!' | '^') => (true, &class[1..]),
                    _ => (false, class),
                };
                let mut hit = false;
                let mut k = 0;
                while k < class.len() {
                    if k + 2 < class.len() && class[k + 1] == '-' {
                        hit |= class[k] <= c && c <= class[k + 2];
                        k += 3;
                    } else {
                        hit |= class[k] == c;
                        k += 1;
                    }
                }
                hit != neg && go(&p[end + 1..], &t[1..])
            }
            Some(&c) => t.first() == Some(&c) && go(&p[1..], &t[1..]),
        }
    }
    go(&p, &t)
}

/// The path a word names: after `--opt=`, `~` expanded, made absolute.
fn word_path(ctx: &Ctx, cwd: &Path, w: &W) -> Option<(PathBuf, bool)> {
    let mut text = w.text.as_str();
    let mut glob = w.glob();
    if text.starts_with('-') {
        text = text.split_once('=')?.1;
        glob = text.contains(['*', '?', '[']);
    }
    if text.is_empty() || text.contains([Q_PH, U_PH]) {
        return None;
    }
    let text = match (text.strip_prefix("~/"), &ctx.home) {
        (Some(rest), Some(h)) => h.join(rest).to_string_lossy().into_owned(),
        _ => text.to_string(),
    };
    Some((abs(cwd, &text), glob))
}

/// Commands whose arguments are text to print or search: a credential
/// path inside them is not read.
const TEXT_ONLY: &[&str] = &["echo", "printf", "grep", "egrep", "fgrep", "rg", "ag", "ls", "which", "type", "whereis"];

impl<'c, 'a> Guard<'c, 'a> {
    /// gh's credential folders, plus `$GH_CONFIG_DIR` and
    /// `$XDG_CONFIG_HOME/gh` when this line assigns them (strictly resolved).
    fn line_cred_dirs(&self, sc: &Scope) -> Vec<PathBuf> {
        let mut v = cred_dirs(self.ctx);
        if let Some(d) = self.resolve(sc, "GH_CONFIG_DIR", usize::MAX, 1).filter(|d| d.starts_with('/')) {
            v.push(PathBuf::from(d));
        }
        if let Some(d) = self.resolve(sc, "XDG_CONFIG_HOME", usize::MAX, 1).filter(|d| d.starts_with('/')) {
            v.push(PathBuf::from(d).join("gh"));
        }
        v
    }

    /// Words and redirect targets that name a credential file exactly or as
    /// a glob, or that start inside a credential folder and go on with a
    /// glob or a computed part (`~/.config/gh/*`, `~/.config/gh/$F`).
    pub fn cred_words(&mut self, sc: &Scope, words: &[W], targets: &[W]) {
        let dirs = self.line_cred_dirs(sc);
        let files: Vec<PathBuf> = dirs.iter().map(|d| d.join("hosts.yml")).collect();
        for w in words.iter().chain(targets) {
            // The literal text before the first glob or computed part.
            let cut = w.text.find([Q_PH, U_PH]).into_iter().chain(w.glob_at.first().copied()).min();
            if let Some(cut) = cut {
                let tail = w.text.rsplit([Q_PH, U_PH]).next().unwrap_or("");
                if w.computed() && tail.ends_with("gh/hosts.yml") {
                    return self.ask(format!("ADE: this reads gh's stored credential ({})", w.show()));
                }
                let head = &w.text[..cut];
                if let Some(slash) = head.rfind('/') {
                    let dir = W::lit(&head[..slash.max(1)]);
                    if let Some((p, _)) = word_path(self.ctx, &sc.cwd, &dir) {
                        if let Some(d) = dirs.iter().find(|d| p.starts_with(d)) {
                            return self.ask(format!("ADE: this reads files in gh's credential folder ({})", d.display()));
                        }
                    }
                }
                if w.computed() {
                    continue;
                }
            }
            let Some((p, glob)) = word_path(self.ctx, &sc.cwd, w) else { continue };
            let ps = p.to_string_lossy();
            for f in &files {
                if p == *f || (glob && glob_match(&ps, &f.to_string_lossy())) {
                    return self.ask(format!("ADE: this reads gh's stored credential ({})", f.display()));
                }
            }
        }
    }

    /// Commands that copy, archive or recursively read a folder holding a
    /// credential file; the keychain CLIs and git's credential helpers; and
    /// a credential path inside any argument of a command that isn't
    /// text-only (`python3 -c "open('…/gh/hosts.yml')"`).
    pub fn reader_check(&mut self, sc: &Scope, base: &str, args: &[W]) {
        let first = args.first().map(|a| a.text.as_str()).unwrap_or("");
        match base {
            "security" if matches!(first, "find-generic-password" | "find-internet-password" | "dump-keychain" | "export") => {
                return self.ask(format!("ADE: security {first} reads the keychain, where gh keeps its token"));
            }
            "secret-tool" if matches!(first, "lookup" | "search") => {
                return self.ask(format!("ADE: secret-tool {first} reads the keyring, where gh keeps its token"));
            }
            b if b.starts_with("git-credential-") && args.iter().any(|a| a.is("get")) => {
                return self.ask(format!("ADE: {b} get prints a stored git credential, gh's token after gh auth setup-git"));
            }
            _ => {}
        }
        let dirs = self.line_cred_dirs(sc);
        if !TEXT_ONLY.contains(&base) && !(base == "git" && matches!(first, "commit" | "log" | "tag")) {
            let names: Vec<String> = dirs.iter().map(|d| d.join("hosts.yml").to_string_lossy().into_owned()).collect();
            if let Some(a) = args.iter().find(|a| a.text.contains("gh/hosts.yml") || names.iter().any(|n| a.text.contains(n.as_str()))) {
                return self.ask(format!("ADE: {base} is given gh's credential file ({})", a.show()));
            }
        }
        let short_has = |a: &W, cs: &str| !a.computed() && a.text.starts_with('-') && !a.text.starts_with("--") && a.text[1..].chars().any(|c| cs.contains(c));
        let reader = match base {
            "cp" => args.iter().any(|a| short_has(a, "rRa") || a.is("--recursive") || a.is("--archive")),
            "grep" | "egrep" | "fgrep" => args.iter().any(|a| short_has(a, "rR") || a.is("--recursive") || a.text.starts_with("--directories=recurse")),
            // rg skips hidden folders, `.config` included, unless told not to.
            "rg" => args.iter().any(|a| a.is("--hidden") || a.is("-.") || a.is("--unrestricted") || (short_has(a, "u") && a.text.matches('u').count() >= 2)),
            // Plain find only lists names (owner ruling, 2026-11-02).
            "find" => args.iter().any(|a| ["-exec", "-execdir", "-ok", "-okdir"].iter().any(|x| a.is(x))),
            "rsync" | "scp" | "tar" | "zip" | "7z" | "7za" | "ditto" => true,
            _ => false,
        };
        if !reader {
            return;
        }
        if let Some(d) = dirs.iter().find(|d| sc.cwd.starts_with(d)) {
            return self.ask(format!("ADE: {base} reads recursively inside gh's credential folder ({})", d.display()));
        }
        for a in args.iter().filter(|a| !a.text.starts_with('-') || a.text.contains('=')) {
            let Some((p, glob)) = word_path(self.ctx, &sc.cwd, a) else { continue };
            let ps = p.to_string_lossy();
            for d in &dirs {
                let hit = d.starts_with(&p) || (glob && d.ancestors().any(|anc| glob_match(&ps, &anc.to_string_lossy())));
                if hit {
                    return self.ask(format!("ADE: {base} copies or reads a folder that holds gh's credential ({})", d.display()));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::testfs::*;
    use super::super::{classify, Verdict};

    /// Code review 1, major 2: a path built on the session's own
    /// `GH_CONFIG_DIR` / `XDG_CONFIG_HOME` (the hook's environment).
    #[test]
    fn credential_paths_from_the_environment() {
        let fs = FakeFs::new().file("/x/cfg/hosts.yml", "t\n").file("/y/gh/hosts.yml", "t\n");
        let env = |k: &str| match k {
            "GH_CONFIG_DIR" => Some("/x/cfg".to_string()),
            "XDG_CONFIG_HOME" => Some("/y".to_string()),
            _ => None,
        };
        for (cmd, want) in [
            ("cat $GH_CONFIG_DIR/hosts.yml", true),
            ("cat \"$XDG_CONFIG_HOME/gh/hosts.yml\"", true),
            ("cp -r $GH_CONFIG_DIR /tmp/x", true),
            ("cat /x/cfg/hosts.yml", true),
            ("cat $GH_CONFIG_DIR/config.yml", false),
            ("GH_CONFIG_DIR=/z; cat $GH_CONFIG_DIR/hosts.yml", true),
            ("GH_CONFIG_DIR=/z; cat /x/cfg/config.yml", false),
        ] {
            let v = classify(cmd, &ctx(&fs, &env));
            assert_eq!(matches!(v, Verdict::Ask(_)), want, "{cmd}: {v:?}");
        }
    }

    #[test]
    fn credential_reads_ask() {
        let fs = FakeFs::new()
            .file("/home/u/.config/gh/hosts.yml", "github.com:\n    oauth_token: gho_x\n")
            .file("/home/u/.config/gh/config.yml", "version: \"1\"\n");
        check(
            &fs,
            &[
                // AC6 as amended by the owner's ruling (plan 3b21b71).
                ("cat ~/.config/gh/hosts.yml", true),
                ("cat $HOME/.config/gh/h*", true),
                ("cd ~/.config/gh && cat hosts.yml", true),
                ("cp -r ~/.config/gh /tmp/x", true),
                ("tar czf x.tgz ~/.config", true),
                ("zip -r x ~/.config/gh", true),
                ("find ~/.config/gh -exec cat {} \\;", true),
                ("find ~ -name hosts.yml -execdir cat {} +", true),
                ("find / -ok cat {} \\;", true),
                ("base64 < ~/.config/gh/hosts.yml", true),
                ("security find-generic-password -s gh:github.com -w", true),
                ("secret-tool lookup service gh:github.com", true),
                ("cat ~/.config/gh/config.yml", false),
                ("ls ~/.config", false),
                ("find / -name '*.pem'", false),
                ("find ~ -type f -newer x", false),
                ("find ~/.config/gh -name hosts.yml", false),
                // A plain find's names feeding a reader still read the folder.
                ("find ~/.config/gh -type f | xargs cat", true),
                ("find ~ -name hosts.yml | xargs -I{} cat {}", true),
                ("find ~/.config/gh -type f | parallel cat", true),
                ("find ~/.config/gh -type f | while read f; do cat \"$f\"; done", true),
                ("cat $(find ~/.config/gh -type f)", true),
                ("find src -type f | xargs cat", false),
                ("find ~/.config/gh -type f | wc -l", false),
                // rg skips hidden folders unless told not to.
                ("rg token ~", false),
                ("rg --hidden token ~", true),
                ("rg -uu token ~/.config", true),
                // More spellings of the same reads.
                ("cat \"$HOME/.config/gh/hosts.yml\"", true),
                ("cat /home/u/.config/gh/hosts.yml", true),
                ("cd ~/.config && cat gh/hosts.yml", true),
                ("sudo cp -a ~/.config/gh /tmp/x", true),
                ("rsync -a ~/.config/ backup/", true),
                ("grep -r token ~/.config/gh", true),
                ("cat ~/.config/g?/hosts.yml", true),
                ("head -c 100 \"$XDG_CONFIG_HOME/gh/hosts.yml\"", true),
                ("grep token \"$D/gh/hosts.yml\"", true),
                ("bash -c 'cat ~/.config/gh/hosts.yml'", true),
                ("security dump-keychain", true),
                // Code review 1, major 2: reads word matching missed.
                ("python3 -c \"print(open('/root/.config/gh/hosts.yml').read())\"", true),
                ("node -e \"console.log(require('fs').readFileSync(require('os').homedir()+'/.config/gh/hosts.yml','utf8'))\"", true),
                ("for f in ~/.config/gh/*; do cat \"$f\"; done", true),
                ("ls ~/.config/gh | xargs -I{} cat ~/.config/gh/{}", true),
                ("cat ~/.config/gh/$F", true),
                ("GH_CONFIG_DIR=/x/cfg; cat $GH_CONFIG_DIR/hosts.yml", true),
                ("export XDG_CONFIG_HOME=/x; cat $XDG_CONFIG_HOME/gh/hosts.yml", true),
                ("XDG_CONFIG_HOME=/x; cat $XDG_CONFIG_HOME/gh/h*", true),
                ("git credential fill", true),
                ("printf 'protocol=https\\nhost=github.com\\n' | git credential fill", true),
                ("git credential-osxkeychain get", true),
                ("git credential-store get", true),
                ("git-credential-manager get", true),
                ("git credential approve", false),
                // Code review 1, minor 10: a recursive reader inside the folder.
                ("cd ~/.config/gh && grep -r token", true),
                ("cd ~/.config/gh && rg --hidden token", true),
                ("cd ~/.config/gh && ls", false),
                // not credentials
                ("ls ~/.config/gh", false),
                ("cp -r src /tmp/x", false),
                ("tar czf x.tgz src", false),
                ("grep -r token src", false),
                ("security find-certificate -a", false),
                ("git commit -m \"read gh/hosts.yml in tests\"", false),
                ("grep -n hosts.yml docs/gh/hosts.yml.md", false),
            ],
        );
    }
}

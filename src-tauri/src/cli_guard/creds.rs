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

impl<'c, 'a> Guard<'c, 'a> {
    /// Words and redirect targets that name a credential file, exactly or
    /// as a glob.
    pub fn cred_words(&mut self, sc: &Scope, words: &[W], targets: &[W]) {
        let files = cred_files(self.ctx);
        for w in words.iter().chain(targets) {
            if w.computed() {
                let tail = w.text.rsplit([Q_PH, U_PH]).next().unwrap_or("");
                if tail.ends_with("gh/hosts.yml") {
                    return self.ask(format!("ADE: this reads gh's stored credential ({})", w.show()));
                }
                continue;
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
    /// credential file, and the keychain CLIs.
    pub fn reader_check(&mut self, sc: &Scope, base: &str, args: &[W]) {
        let first = args.first().map(|a| a.text.as_str()).unwrap_or("");
        match base {
            "security" if matches!(first, "find-generic-password" | "find-internet-password" | "dump-keychain" | "export") => {
                return self.ask(format!("ADE: security {first} reads the keychain, where gh keeps its token"));
            }
            "secret-tool" if matches!(first, "lookup" | "search") => {
                return self.ask(format!("ADE: secret-tool {first} reads the keyring, where gh keeps its token"));
            }
            _ => {}
        }
        let short_has = |a: &W, cs: &str| !a.computed() && a.text.starts_with('-') && !a.text.starts_with("--") && a.text[1..].chars().any(|c| cs.contains(c));
        let reader = match base {
            "cp" => args.iter().any(|a| short_has(a, "rRa") || a.is("--recursive") || a.is("--archive")),
            "grep" | "egrep" | "fgrep" => args.iter().any(|a| short_has(a, "rR") || a.is("--recursive") || a.text.starts_with("--directories=recurse")),
            "rsync" | "scp" | "tar" | "zip" | "7z" | "7za" | "rg" | "find" | "ditto" => true,
            _ => false,
        };
        if !reader {
            return;
        }
        let dirs = cred_dirs(self.ctx);
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

    #[test]
    fn credential_reads_ask() {
        let fs = FakeFs::new()
            .file("/home/u/.config/gh/hosts.yml", "github.com:\n    oauth_token: gho_x\n")
            .file("/home/u/.config/gh/config.yml", "version: \"1\"\n");
        check(
            &fs,
            &[
                ("cat ~/.config/gh/hosts.yml", true),
                ("cat $HOME/.config/gh/h*", true),
                ("cd ~/.config/gh && cat hosts.yml", true),
                ("cp -r ~/.config/gh /tmp/x", true),
                ("tar czf x.tgz ~/.config", true),
                ("zip -r x ~/.config/gh", true),
                ("find ~/.config/gh -exec cat {} \\;", true),
                ("base64 < ~/.config/gh/hosts.yml", true),
                ("security find-generic-password -s gh:github.com -w", true),
                ("secret-tool lookup service gh:github.com", true),
                // more spellings of the same reads
                ("cat \"$HOME/.config/gh/hosts.yml\"", true),
                ("cat /home/u/.config/gh/hosts.yml", true),
                ("cd ~/.config && cat gh/hosts.yml", true),
                ("sudo cp -a ~/.config/gh /tmp/x", true),
                ("rsync -a ~/.config/ backup/", true),
                ("grep -r token ~/.config/gh", true),
                ("cat ~/.config/g?/hosts.yml", true),
                ("head -c 100 \"$XDG_CONFIG_HOME/gh/hosts.yml\"", true),
                ("bash -c 'cat ~/.config/gh/hosts.yml'", true),
                ("security dump-keychain", true),
                // not credentials
                ("cat ~/.config/gh/config.yml", false),
                ("ls ~/.config", false),
                ("ls ~/.config/gh", false),
                ("cp -r src /tmp/x", false),
                ("tar czf x.tgz src", false),
                ("grep -r token src", false),
                ("security find-certificate -a", false),
            ],
        );
    }
}

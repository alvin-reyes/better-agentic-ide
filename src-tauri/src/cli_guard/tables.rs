//! The guarded CLIs' tables. v1 guards gh. Its command tree, aliases and
//! flags come from the recorded fixture `testdata/gh-2.89.0-reference.md`
//! (version, capture date and command in its header); each leaf's class is
//! written here by hand, and the coverage test fails on a leaf without one.

use super::resolve::W;
use std::collections::{BTreeMap, HashMap};
use std::sync::OnceLock;

/// The guarded CLIs: their bins, and npm packages that install a bin.
pub struct Cli {
    pub id: &'static str,
    pub bins: &'static [&'static str],
    /// `(npm package, bin)` pairs, for runners and `node …/node_modules/<pkg>`.
    pub packages: &'static [(&'static str, &'static str)],
}

pub const CLIS: &[Cli] = &[Cli { id: "gh", bins: &["gh"], packages: &[] }];

/// The verbs of ADE's own helper (`"$ADE_HOOK_BIN"`, or `ade` on `PATH`)
/// whose words after `--` are a command, classified as a runner's are
/// (ADR 0011, amended by story 9). The guard's tests enumerate it.
pub const ADE_VERBS: &[&str] = &["open"];

/// The guarded CLI a command name (a basename) runs, if any.
pub fn guarded_bin(name: &str) -> Option<&'static str> {
    CLIS.iter().find(|c| c.bins.contains(&name)).map(|c| c.id)
}

/// The bin an npm package spec (`pkg`, `pkg@1.2`, `@scope/pkg@x`) runs.
pub fn package_bin(spec: &str) -> String {
    let name = match spec.strip_prefix('@') {
        Some(rest) => match rest.find('@') {
            Some(k) => &spec[..k + 1],
            None => spec,
        },
        None => spec.split('@').next().unwrap_or(spec),
    };
    for c in CLIS {
        if let Some((_, bin)) = c.packages.iter().find(|(p, _)| *p == name) {
            return bin.to_string();
        }
    }
    name.rsplit('/').next().unwrap_or(name).to_string()
}

/// Whether `text` names a guarded bin as a word (also inside a credential
/// path such as `~/.config/gh/hosts.yml` or `gh:github.com`). Word
/// characters are letters, digits, `_` and `-`.
pub fn names_guarded(text: &[u8]) -> bool {
    let word = |b: u8| b.is_ascii_alphanumeric() || b == b'_' || b == b'-';
    for c in CLIS {
        for bin in c.bins {
            let b = bin.as_bytes();
            let mut k = 0;
            while k + b.len() <= text.len() {
                if text[k] == b[0] && &text[k..k + b.len()] == b && (k == 0 || !word(text[k - 1])) && text.get(k + b.len()).map_or(true, |&n| !word(n)) {
                    return true;
                }
                k += 1;
            }
        }
    }
    false
}

/// How a leaf is classed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Class {
    Read,
    /// A write that is not risky.
    Known,
    /// Risky: asks, with this reason.
    Risk(&'static str),
    /// Risky only with some flags or arguments.
    Special(Special),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Special {
    /// `-d`/`--delete-branch` deletes the branch.
    PrClose,
    /// `-t`/`--show-token` prints the token.
    AuthStatus,
    /// Asks unless the key is on [`GH_CONFIG_SAFE_KEYS`].
    ConfigGet,
    /// Always asks: it prints every key.
    ConfigList,
    /// Asks unless it is a provable read.
    Api,
    /// `-f`/`--force` overwrites the destination's labels.
    LabelClone,
    /// `--rebase` rewrites the PR branch.
    UpdateBranch,
}

use Class::{Known, Read, Risk, Special as Sp};

const DELETES: &str = "deletes";
const CODESPACE: &str = "starts, changes or reaches a billable codespace";

/// Every gh 2.89.0 leaf, and the runnable group `codespace ports`.
pub const GH_CLASSES: &[(&str, Class)] = &[
    ("agent-task create", Risk("creates an agent task, which works on a repository")),
    ("agent-task list", Read),
    ("agent-task view", Read),
    ("alias delete", Risk("deletes a gh alias")),
    ("alias import", Risk("imports gh aliases, which can run shell commands")),
    ("alias list", Read),
    ("alias set", Risk("sets a gh alias, which can run shell commands")),
    ("api", Sp(Special::Api)),
    ("attestation download", Known),
    ("attestation trusted-root", Read),
    ("attestation verify", Read),
    ("auth login", Risk("signs in and stores a token")),
    ("auth logout", Risk("signs out and removes a token")),
    ("auth refresh", Risk("changes the token's scopes")),
    ("auth setup-git", Risk("sets git up to use gh's token")),
    ("auth status", Sp(Special::AuthStatus)),
    ("auth switch", Risk("switches the active account")),
    ("auth token", Risk("prints the auth token")),
    ("browse", Known),
    ("cache delete", Risk("deletes Actions caches")),
    ("cache list", Read),
    ("co", Known),
    ("codespace code", Risk(CODESPACE)),
    ("codespace cp", Risk(CODESPACE)),
    ("codespace create", Risk("creates a billable codespace")),
    ("codespace delete", Risk("deletes a codespace")),
    ("codespace edit", Risk(CODESPACE)),
    ("codespace jupyter", Risk(CODESPACE)),
    ("codespace list", Read),
    ("codespace logs", Risk(CODESPACE)),
    ("codespace ports", Risk(CODESPACE)),
    ("codespace ports forward", Risk(CODESPACE)),
    ("codespace ports visibility", Risk("changes who can reach a codespace's ports")),
    ("codespace rebuild", Risk(CODESPACE)),
    ("codespace ssh", Risk(CODESPACE)),
    ("codespace stop", Risk(CODESPACE)),
    ("codespace view", Read),
    ("completion", Read),
    ("config clear-cache", Known),
    ("config get", Sp(Special::ConfigGet)),
    ("config list", Sp(Special::ConfigList)),
    ("config set", Risk("changes gh's configuration")),
    ("copilot", Risk("downloads and runs the Copilot CLI")),
    ("extension browse", Risk("can install and run extensions")),
    ("extension create", Risk("creates an extension")),
    ("extension exec", Risk("runs an extension, which ADE can't see into")),
    ("extension install", Risk("installs code from a repository that gh then runs")),
    ("extension list", Read),
    ("extension remove", Risk("removes an extension")),
    ("extension search", Read),
    ("extension upgrade", Risk("installs new extension code")),
    ("gist clone", Known),
    ("gist create", Risk("publishes files as a gist")),
    ("gist delete", Risk("deletes a gist")),
    ("gist edit", Risk("changes a gist")),
    ("gist list", Read),
    ("gist rename", Risk("changes a gist")),
    ("gist view", Read),
    ("gpg-key add", Risk("adds a GPG key to the account")),
    ("gpg-key delete", Risk("deletes a GPG key")),
    ("gpg-key list", Risk("lists the account's GPG keys")),
    ("issue close", Known),
    ("issue comment", Known),
    ("issue create", Known),
    ("issue delete", Risk("deletes an issue")),
    ("issue develop", Known),
    ("issue edit", Known),
    ("issue list", Read),
    ("issue lock", Known),
    ("issue pin", Known),
    ("issue reopen", Known),
    ("issue status", Read),
    ("issue transfer", Risk("moves an issue to another repository")),
    ("issue unlock", Known),
    ("issue unpin", Known),
    ("issue view", Read),
    ("label clone", Sp(Special::LabelClone)),
    ("label create", Known),
    ("label delete", Risk("deletes a label")),
    ("label edit", Known),
    ("label list", Read),
    ("licenses", Read),
    ("org list", Read),
    ("pr checkout", Known),
    ("pr checks", Read),
    ("pr close", Sp(Special::PrClose)),
    ("pr comment", Known),
    ("pr create", Known),
    ("pr diff", Read),
    ("pr edit", Known),
    ("pr list", Read),
    ("pr lock", Known),
    ("pr merge", Risk("merges a pull request")),
    ("pr ready", Known),
    ("pr reopen", Known),
    ("pr revert", Known),
    ("pr review", Known),
    ("pr status", Read),
    ("pr unlock", Known),
    ("pr update-branch", Sp(Special::UpdateBranch)),
    ("pr view", Read),
    ("preview prompter", Known),
    ("project close", Risk("closes a project")),
    ("project copy", Known),
    ("project create", Known),
    ("project delete", Risk("deletes a project")),
    ("project edit", Known),
    ("project field-create", Known),
    ("project field-delete", Risk("deletes a project field and its values")),
    ("project field-list", Read),
    ("project item-add", Known),
    ("project item-archive", Known),
    ("project item-create", Known),
    ("project item-delete", Risk("deletes a project item")),
    ("project item-edit", Known),
    ("project item-list", Read),
    ("project link", Known),
    ("project list", Read),
    ("project mark-template", Known),
    ("project unlink", Known),
    ("project view", Read),
    ("release create", Risk("publishes a release")),
    ("release delete", Risk("deletes a release")),
    ("release delete-asset", Risk("deletes a release asset")),
    ("release download", Known),
    ("release edit", Risk("changes a published release")),
    ("release list", Read),
    ("release upload", Risk("uploads assets to a release")),
    ("release verify", Read),
    ("release verify-asset", Read),
    ("release view", Read),
    ("repo archive", Risk("archives a repository")),
    ("repo autolink create", Risk("creates a repository autolink")),
    ("repo autolink delete", Risk("deletes a repository autolink")),
    ("repo autolink list", Read),
    ("repo autolink view", Read),
    ("repo clone", Known),
    ("repo create", Risk("creates a repository")),
    ("repo delete", Risk("deletes a repository")),
    ("repo deploy-key add", Risk("adds a deploy key")),
    ("repo deploy-key delete", Risk("deletes a deploy key")),
    ("repo deploy-key list", Risk("lists deploy keys")),
    ("repo edit", Risk("changes a repository's settings")),
    ("repo fork", Risk("creates a repository (a fork)")),
    ("repo gitignore list", Read),
    ("repo gitignore view", Read),
    ("repo license list", Read),
    ("repo license view", Read),
    ("repo list", Read),
    ("repo rename", Risk("renames a repository")),
    ("repo set-default", Known),
    ("repo sync", Risk("overwrites a branch from another repository")),
    ("repo unarchive", Known),
    ("repo view", Read),
    ("ruleset check", Read),
    ("ruleset list", Read),
    ("ruleset view", Read),
    ("run cancel", Risk("cancels a workflow run")),
    ("run delete", Risk("deletes a workflow run")),
    ("run download", Known),
    ("run list", Read),
    ("run rerun", Risk("reruns a workflow, which can deploy")),
    ("run view", Read),
    ("run watch", Read),
    ("search code", Read),
    ("search commits", Read),
    ("search issues", Read),
    ("search prs", Read),
    ("search repos", Read),
    ("secret delete", Risk("deletes a secret")),
    ("secret list", Read),
    ("secret set", Risk("sets a secret")),
    ("ssh-key add", Risk("adds an SSH key to the account")),
    ("ssh-key delete", Risk("deletes an SSH key")),
    ("ssh-key list", Risk("lists the account's SSH keys")),
    ("status", Read),
    ("variable delete", Risk("deletes a variable")),
    ("variable get", Read),
    ("variable list", Read),
    ("variable set", Risk("sets a variable")),
    ("workflow disable", Risk("disables a workflow")),
    ("workflow enable", Risk("enables a workflow, which can deploy")),
    ("workflow list", Read),
    ("workflow run", Risk("runs a workflow, which can deploy")),
    ("workflow view", Read),
];

/// The words that make a leaf risky unless the table says why not (review M1).
pub const LEXICON: &[&str] = &[
    "rm", "delete", "remove", "set", "add", "insert", "upsert", "put", "terminate", "send", "run", "ssh", "curl", "unlock", "deploy", "create", "token", "secret",
];

/// Leaves whose words are in the lexicon but that are not risk, with why.
pub const GH_LEXICON_EXCEPTIONS: &[(&str, &str)] = &[
    ("issue create", "opens an issue, which anyone can close; the plan classes it known"),
    ("issue unlock", "re-allows comments on one issue; reversible with issue lock"),
    ("label create", "adds a label to the repository's list; reversible, deletes nothing"),
    ("pr create", "opens a pull request for review, which merges nothing; the plan classes it known"),
    ("pr unlock", "re-allows comments on one pull request; reversible with pr lock"),
    ("project create", "makes an empty project board; deletes nothing and spends nothing"),
    ("project field-create", "adds a field to a project board; reversible, deletes nothing"),
    ("project item-add", "adds an existing issue or PR to a project board; reversible"),
    ("project item-create", "adds a draft item to a project board; reversible"),
    ("repo set-default", "sets which remote gh uses, in the local git config only"),
    ("run download", "`run` names a workflow run; this downloads its artifacts locally"),
    ("run list", "`run` names a workflow run; this lists runs"),
    ("run view", "`run` names a workflow run; this shows one"),
    ("run watch", "`run` names a workflow run; this follows one until it ends"),
    ("secret list", "lists secret names and dates; gh never prints a secret's value"),
];

/// `gh config get` keys that hold no secret.
pub const GH_CONFIG_SAFE_KEYS: &[&str] =
    &["git_protocol", "editor", "prompt", "prefer_editor_prompt", "pager", "http_unix_socket", "browser", "color_labels", "accessible_colors", "accessible_prompter", "spinner"];

#[derive(Debug, Default)]
struct Flag {
    short: Option<char>,
    long: String,
    value: bool,
}

#[derive(Debug, Default)]
struct Node {
    children: BTreeMap<String, Node>,
    /// alias → child name
    aliases: HashMap<String, String>,
    flags: Vec<Flag>,
    /// `gh co`: "Alias for "pr checkout"".
    expansion: Option<Vec<String>>,
}

impl Node {
    fn child(&self, w: &str) -> Option<(&str, &Node)> {
        if let Some((k, n)) = self.children.get_key_value(w) {
            return Some((k, n));
        }
        let name = self.aliases.get(w)?;
        self.children.get_key_value(name.as_str()).map(|(k, n)| (k.as_str(), n))
    }
    fn flag(&self, short: Option<char>, long: Option<&str>) -> Option<&Flag> {
        self.flags.iter().chain(INHERITED.get_or_init(inherited).iter()).find(|f| match (short, long) {
            (Some(c), _) => f.short == Some(c),
            (_, Some(l)) => f.long == l,
            _ => false,
        })
    }
}

static INHERITED: OnceLock<Vec<Flag>> = OnceLock::new();

/// Flags every gh command takes that the reference doesn't list per command.
fn inherited() -> Vec<Flag> {
    vec![Flag { short: Some('R'), long: "repo".into(), value: true }, Flag { short: None, long: "help".into(), value: false }]
}

/// The gh table: the fixture's tree, and [`GH_CLASSES`].
pub struct Table {
    pub heading_count: usize,
    root: Node,
}

/// What the table says about one gh invocation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GhOut {
    None,
    /// A risky leaf or form.
    Risk(String),
    /// A leaf the table doesn't know, or an extension.
    Unknown(String),
    /// A computed subcommand, or a computed word in a leaf with risky flags or arguments.
    Computed(String),
    /// The leaf or flags come from input at run time (xargs, parallel, find -exec).
    Runtime(String),
}

pub fn gh() -> &'static Table {
    static T: OnceLock<Table> = OnceLock::new();
    T.get_or_init(|| Table::parse(include_str!("testdata/gh-2.89.0-reference.md")))
}

fn ident(w: &str) -> bool {
    w.chars().next().is_some_and(|c| c.is_ascii_alphanumeric()) && w.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

impl Table {
    fn parse(text: &str) -> Table {
        let mut root = Node::default();
        let mut count = 0;
        let mut current: Vec<String> = Vec::new();
        let mut lines = text.lines().peekable();
        while let Some(line) = lines.next() {
            if let Some(rest) = line.strip_prefix("## gh ").or_else(|| line.strip_prefix("### gh ")).or_else(|| line.strip_prefix("#### gh ")) {
                current = rest.split_whitespace().take_while(|w| ident(w)).map(String::from).collect();
                let mut n = &mut root;
                for w in &current {
                    n = n.children.entry(w.clone()).or_default();
                }
                count += 1;
                continue;
            }
            if current.is_empty() {
                continue;
            }
            if line == "Aliases" {
                while lines.peek().is_some_and(|l| l.trim().is_empty()) {
                    lines.next();
                }
                let Some(list) = lines.next() else { break };
                let (parent, last) = current.split_at(current.len() - 1);
                let mut n = &mut root;
                for w in parent {
                    n = n.children.get_mut(w).unwrap();
                }
                for entry in list.split(", ") {
                    if let Some(alias) = entry.split_whitespace().last() {
                        if alias != last[0] {
                            n.aliases.insert(alias.to_string(), last[0].clone());
                        }
                    }
                }
                continue;
            }
            if let Some(target) = line.strip_prefix("Alias for \"").and_then(|r| r.strip_suffix('"')) {
                let n = node_mut(&mut root, &current);
                n.expansion = Some(target.split_whitespace().map(String::from).collect());
                continue;
            }
            let t = line.trim_start();
            if t.len() < line.len() && t.starts_with('-') {
                if let Some(f) = parse_flag(t) {
                    node_mut(&mut root, &current).flags.push(f);
                }
            }
        }
        Table { heading_count: count, root }
    }

    /// Every leaf's path, e.g. `repo delete`.
    pub fn leaves(&self) -> Vec<String> {
        fn walk(n: &Node, path: &mut Vec<String>, out: &mut Vec<String>) {
            for (k, c) in &n.children {
                path.push(k.clone());
                if c.children.is_empty() {
                    out.push(path.join(" "));
                } else {
                    walk(c, path, out);
                }
                path.pop();
            }
        }
        let mut out = Vec::new();
        walk(&self.root, &mut Vec::new(), &mut out);
        out
    }

    pub fn class(&self, path: &str) -> Option<Class> {
        GH_CLASSES.iter().find(|(p, _)| *p == path).map(|(_, c)| *c)
    }

    /// Classify `gh ARGS`. `config` is the user's gh `config.yml` text, for
    /// their aliases. Returns the decision and the path reached.
    pub fn classify(&self, args: &[W], config: Option<&str>, runtime: bool) -> (GhOut, Option<String>) {
        self.classify_at(args, config, runtime, true)
    }

    fn classify_at(&self, args: &[W], config: Option<&str>, runtime: bool, expand_alias: bool) -> (GhOut, Option<String>) {
        let mut node = &self.root;
        let mut path: Vec<&str> = Vec::new();
        let mut i = 0;
        let mut flags: Vec<(String, Option<W>)> = Vec::new();
        while i < args.len() {
            let w = &args[i];
            if node.children.is_empty() && !path.is_empty() {
                break;
            }
            if w.computed() {
                return (GhOut::Computed(format!("ADE: gh's subcommand is computed here ({}), so the guard can't tell what runs", w.show())), None);
            }
            let t = w.text.as_str();
            if t == "--" {
                i += 1;
                break;
            }
            if t.len() > 1 && t.starts_with('-') {
                i += take_flag(node, args, i, &mut flags);
                continue;
            }
            if path.is_empty() {
                if t == "help" || t == "version" {
                    return (GhOut::None, Some(t.to_string()));
                }
                if let Some((_, c)) = node.child(t) {
                    if let Some(exp) = &c.expansion {
                        // gh's built-in alias `co`: classify as written, it is `pr checkout`.
                        let _ = exp;
                    }
                }
            }
            match node.child(t) {
                Some((name, c)) => {
                    path.push(name);
                    node = c;
                    i += 1;
                }
                None if path.is_empty() => return self.user_alias(t, &args[i + 1..], config, runtime, expand_alias),
                None => {
                    // A group's own positional (e.g. `gh codespace ports`) or an unknown leaf.
                    if self.class(&path.join(" ")).is_some() {
                        break;
                    }
                    let p = path.join(" ");
                    return (GhOut::Unknown(format!("ADE: gh {p} {t} is not a gh command the guard knows; check it before it runs")), Some(format!("{p} {t}")));
                }
            }
        }
        let p = path.join(" ");
        if path.is_empty() {
            // Bare `gh`, `gh --version`, `gh --help`.
            if runtime {
                return (GhOut::Runtime("ADE: gh gets its subcommand from input at run time (xargs, parallel or find -exec)".into()), None);
            }
            return (GhOut::None, None);
        }
        let class = match self.class(&p) {
            Some(c) => c,
            None if !node.children.is_empty() => Read, // a group shows its help
            None => return (GhOut::Unknown(format!("ADE: gh {p} is not classified in the guard's table")), Some(p)),
        };
        // The leaf's own arguments.
        let mut pos: Vec<&W> = Vec::new();
        while i < args.len() {
            let w = &args[i];
            let t = w.text.as_str();
            if w.computed() {
                pos.push(w);
                i += 1;
            } else if t == "--" {
                pos.extend(&args[i + 1..]);
                break;
            } else if t.len() > 1 && t.starts_with('-') {
                i += take_flag(node, args, i, &mut flags);
            } else {
                pos.push(w);
                i += 1;
            }
        }
        // `--help` (or `-h` where the leaf doesn't define it) only prints help.
        // gh runs the command for `--help=false`: only a bare or true help flag is help.
        let truthy = |v: &Option<W>| v.as_ref().map_or(true, |v| matches!(v.text.as_str(), "true" | "TRUE" | "True" | "t" | "T" | "1"));
        if flags.iter().any(|(f, v)| (f == "help" || f == "h") && truthy(v)) {
            return (GhOut::None, Some(p));
        }
        // A computed positional could be a flag; a computed value matters only
        // for a flag that decides the risk (`gh api -X`). `gh api`'s endpoint
        // is judged by its literal parts.
        let skip_endpoint = usize::from(class == Sp(Special::Api));
        let computed = pos.iter().skip(skip_endpoint).any(|w| w.computed()) || flags.iter().any(|(f, v)| f == "method" && v.as_ref().is_some_and(W::computed));
        let out = match class {
            Risk(r) => GhOut::Risk(format!("ADE: gh {p} {r}")),
            Read | Known => GhOut::None,
            Sp(s) if computed => GhOut::Computed(format!("ADE: gh {p} has a computed argument here, and its arguments decide whether it {}", special_risk(s))),
            Sp(s) => special(s, &p, &flags, &pos),
        };
        if out != GhOut::None {
            return (out, Some(p));
        }
        let complete_read = class == Read && node.children.is_empty();
        if runtime && !complete_read {
            return (GhOut::Runtime(format!("ADE: gh {p} gets more of its arguments from input at run time (xargs, parallel or find -exec), and they can make it risky")), Some(p));
        }
        (GhOut::None, Some(p))
    }

    fn user_alias(&self, name: &str, rest: &[W], config: Option<&str>, runtime: bool, expand: bool) -> (GhOut, Option<String>) {
        let found = if expand { config.and_then(|c| gh_aliases(c).into_iter().find(|(k, _)| k == name)) } else { None };
        let Some((_, exp)) = found else {
            return (GhOut::Unknown(format!("ADE: gh {name} runs a gh extension or alias the guard can't see into")), Some(name.to_string()));
        };
        if exp.starts_with('!') {
            return (GhOut::Risk(format!("ADE: gh {name} is a shell alias ({exp}), which the guard can't see into")), Some(name.to_string()));
        }
        // `$1`… take the arguments; the rest are appended.
        let mut used = vec![false; rest.len()];
        let mut words: Vec<W> = Vec::new();
        for t in super::resolve::split_words(&exp) {
            if let Some(n) = t.text.strip_prefix('$').and_then(|d| d.parse::<usize>().ok()) {
                if n >= 1 && n <= rest.len() {
                    words.push(rest[n - 1].clone());
                    used[n - 1] = true;
                    continue;
                }
            }
            words.push(t);
        }
        words.extend(rest.iter().zip(&used).filter(|(_, u)| !**u).map(|(w, _)| w.clone()));
        self.classify_at(&words, config, runtime, false)
    }
}

fn node_mut<'a>(root: &'a mut Node, path: &[String]) -> &'a mut Node {
    let mut n = root;
    for w in path {
        n = n.children.get_mut(w).unwrap();
    }
    n
}

/// `-a, --active   Display…` or `--json fields   Output…`.
fn parse_flag(t: &str) -> Option<Flag> {
    let (short, rest) = if let Some(r) = t.strip_prefix("--") {
        (None, r)
    } else {
        let c = t[1..].chars().next()?;
        if !c.is_ascii_alphanumeric() {
            return None;
        }
        let r = t[1 + c.len_utf8()..].strip_prefix(", --")?;
        (Some(c), r)
    };
    let end = rest.find(' ').unwrap_or(rest.len());
    let long = rest[..end].to_string();
    if long.is_empty() || !long.chars().next()?.is_ascii_alphanumeric() {
        return None;
    }
    let after = &rest[end..];
    let value = after.starts_with(' ') && !after.starts_with("  ") && after.len() > 1;
    Some(Flag { short, long, value })
}

/// Consume the flag at `args[i]` the way pflag does (`--x=v`, `--x v`,
/// `-abc`, `-hVALUE`); record each as `(long name, value)`. Returns how many
/// words it took.
fn take_flag(node: &Node, args: &[W], i: usize, out: &mut Vec<(String, Option<W>)>) -> usize {
    let t = args[i].text.as_str();
    if let Some(l) = t.strip_prefix("--") {
        let (name, val) = match l.split_once('=') {
            Some((n, v)) => (n, Some(v)),
            None => (l, None),
        };
        let f = node.flag(None, Some(name));
        let long = f.map_or(name.to_string(), |f| f.long.clone());
        if let Some(v) = val {
            out.push((long, Some(W { text: v.to_string(), ..args[i].clone() })));
            return 1;
        }
        if f.is_some_and(|f| f.value) {
            out.push((long, args.get(i + 1).cloned()));
            return if i + 1 < args.len() { 2 } else { 1 };
        }
        out.push((long, None));
        return 1;
    }
    let chars: Vec<char> = t[1..].chars().collect();
    for (k, &c) in chars.iter().enumerate() {
        let f = node.flag(Some(c), None);
        let long = f.map_or(c.to_string(), |f| f.long.clone());
        if f.is_some_and(|f| f.value) {
            let rest: String = chars[k + 1..].iter().collect();
            if !rest.is_empty() {
                out.push((long, Some(W { text: rest, ..args[i].clone() })));
                return 1;
            }
            out.push((long, args.get(i + 1).cloned()));
            return if i + 1 < args.len() { 2 } else { 1 };
        }
        // pflag's `-x=value` for a flag without a value (`-h=false`).
        if chars.get(k + 1) == Some(&'=') {
            out.push((long, Some(W { text: chars[k + 2..].iter().collect(), ..args[i].clone() })));
            return 1;
        }
        out.push((long, None));
    }
    1
}

fn special_risk(s: Special) -> &'static str {
    match s {
        Special::PrClose => "deletes the branch",
        Special::AuthStatus => "prints the auth token",
        Special::ConfigGet | Special::ConfigList => "prints a token",
        Special::Api => "writes, deletes or reads secret-scanning alerts",
        Special::LabelClone => "overwrites labels",
        Special::UpdateBranch => "rewrites the branch",
    }
}

fn special(s: Special, p: &str, flags: &[(String, Option<W>)], pos: &[&W]) -> GhOut {
    let has = |n: &str| flags.iter().any(|(f, _)| f == n);
    let risk = |why: &str| GhOut::Risk(format!("ADE: gh {p} {why}"));
    match s {
        Special::PrClose if has("delete-branch") => risk("with --delete-branch deletes the branch"),
        Special::AuthStatus if has("show-token") => risk("with --show-token prints the auth token"),
        Special::ConfigGet => match pos.first() {
            Some(k) if GH_CONFIG_SAFE_KEYS.contains(&k.text.as_str()) => GhOut::None,
            Some(k) => risk(&format!("{} prints a configuration value that can be a token", k.text)),
            None => GhOut::None,
        },
        Special::ConfigList => risk("prints gh's configuration, which can hold a token"),
        Special::Api => api(p, flags, pos),
        Special::LabelClone if has("force") => risk("with --force overwrites the destination's labels"),
        Special::UpdateBranch if has("rebase") => risk("with --rebase rewrites the pull request's branch"),
        _ => GhOut::None,
    }
}

/// `gh api` is a read only when it is provably one.
fn api(p: &str, flags: &[(String, Option<W>)], pos: &[&W]) -> GhOut {
    let risk = |why: &str| GhOut::Risk(format!("ADE: gh {p} {why}"));
    let endpoint = pos.first().map(|w| w.text.as_str()).unwrap_or("");
    let method = flags.iter().rev().find(|(f, _)| f == "method").and_then(|(_, v)| v.as_ref()).map(|v| v.text.to_ascii_uppercase());
    if flags.iter().any(|(f, _)| f == "input") {
        return risk("sends a request body from a file");
    }
    let fields: Vec<&str> = flags.iter().filter(|(f, _)| f == "field" || f == "raw-field").map(|(_, v)| v.as_ref().map_or("", |v| v.text.as_str())).collect();
    if endpoint == "graphql" {
        if method.as_deref().is_some_and(|m| m != "POST" && m != "GET") {
            return risk("sends a graphql request with an unusual method");
        }
        let query = fields.iter().find_map(|f| f.strip_prefix("query="));
        return match query {
            None => risk("sends a graphql request whose query the guard can't see"),
            Some(q) if q.contains([super::resolve::Q_PH, super::resolve::U_PH]) => risk("sends a graphql query that is computed here, so the guard can't see whether it is a mutation"),
            Some(q) if q.starts_with('@') => risk("sends a graphql query from a file"),
            Some(q) if q.contains("mutation") => risk("sends a graphql mutation"),
            Some(q) if q.contains("secretScanning") => risk("reads secret-scanning alerts"),
            Some(_) if fields.iter().any(|f| f.split_once('=').is_some_and(|(_, v)| v.starts_with('@'))) => risk("sends graphql variables from a file"),
            Some(_) => GhOut::None,
        };
    }
    if method.as_deref().is_some_and(|m| m != "GET") {
        return risk(&format!("sends a {} request", method.unwrap()));
    }
    if !fields.is_empty() {
        return risk("sends fields, which makes it a write");
    }
    if maybe_secret_scanning(endpoint) {
        return risk("reads secret-scanning alerts, or its endpoint is computed where they would be");
    }
    GhOut::None
}

/// Whether a REST endpoint is, or with its computed parts could be, a
/// secret-scanning one. A computed part stands for one path segment (agents
/// write `repos/$OWNER/$REPO`); `secret-scanning` follows `repos/{o}/{r}/`,
/// `orgs/{o}/` or `enterprises/{e}/`.
fn maybe_secret_scanning(endpoint: &str) -> bool {
    use super::resolve::{Q_PH, U_PH};
    if endpoint.contains("secret-scanning") {
        return true;
    }
    let segs: Vec<&str> = endpoint.trim_start_matches('/').split(['/', '?']).collect();
    let computed = |s: &str| s.contains([Q_PH, U_PH]);
    match segs[0] {
        s if computed(s) => true,
        "repos" => segs.get(3).is_some_and(|s| computed(s)),
        "orgs" | "enterprises" => segs.get(2).is_some_and(|s| computed(s)),
        _ => false,
    }
}

/// The user's gh aliases from `config.yml`: `aliases:` then `    name: expansion`.
pub fn gh_aliases(config: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut inside = false;
    for line in config.lines() {
        if !line.starts_with(' ') && !line.starts_with('\t') {
            inside = line.trim_end() == "aliases:";
            continue;
        }
        if !inside {
            continue;
        }
        let Some((k, v)) = line.trim().split_once(':') else { continue };
        let v = v.trim();
        let v = if v.len() >= 2 && v.starts_with('\'') && v.ends_with('\'') {
            v[1..v.len() - 1].replace("''", "'")
        } else if v.len() >= 2 && v.starts_with('"') && v.ends_with('"') {
            v[1..v.len() - 1].replace("\\\"", "\"").replace("\\\\", "\\")
        } else {
            v.to_string()
        };
        out.push((k.trim().to_string(), v));
    }
    out
}

/// One canonical command per leaf (and per form of a conditional leaf), for
/// the corpora and the rules.
pub struct Canon {
    /// What follows `gh `.
    pub rest: String,
    pub risky: bool,
    pub complete_read: bool,
}

pub fn gh_canonical_forms() -> Vec<Canon> {
    let t = gh();
    let mut out = Vec::new();
    let c = |rest: &str, risky: bool, complete_read: bool| Canon { rest: rest.into(), risky, complete_read };
    for (path, class) in GH_CLASSES {
        let leaf = t.leaves().iter().any(|l| l == path);
        match class {
            Risk(_) => out.push(c(path, true, false)),
            Read => out.push(c(path, false, leaf)),
            Known => out.push(c(path, false, false)),
            Sp(Special::PrClose) => out.extend([c("pr close 3", false, false), c("pr close 3 -d", true, false), c("pr close 3 --delete-branch", true, false)]),
            Sp(Special::AuthStatus) => out.extend([c("auth status", false, false), c("auth status -t", true, false), c("auth status --show-token", true, false)]),
            Sp(Special::ConfigGet) => out.extend([c("config get editor", false, false), c("config get oauth_token", true, false)]),
            Sp(Special::ConfigList) => out.push(c("config list", true, false)),
            Sp(Special::LabelClone) => out.extend([c("label clone o/src", false, false), c("label clone o/src --force", true, false)]),
            Sp(Special::UpdateBranch) => out.extend([c("pr update-branch 3", false, false), c("pr update-branch 3 --rebase", true, false)]),
            Sp(Special::Api) => out.extend([
                c("api repos/o/r", false, false),
                c("api -X DELETE repos/o/r", true, false),
                c("api repos/o/r/issues --method POST", true, false),
                c("api repos/o/r/issues --input body.json", true, false),
                c("api repos/o/r/secret-scanning/alerts", true, false),
            ]),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    // The plan's gh lists ("The four CLIs" › gh), checked against the table.
    const PLAN_RISK: &[&str] = &[
        "repo create", "repo delete", "repo edit", "repo rename", "repo archive", "repo sync", "repo deploy-key add", "repo deploy-key delete",
        "repo deploy-key list", "repo autolink create", "repo autolink delete", "pr merge", "release create", "release edit", "release upload",
        "release delete", "release delete-asset", "secret delete", "secret set", "variable set", "variable delete", "cache delete", "workflow run",
        "workflow enable", "workflow disable", "run cancel", "run delete", "run rerun", "issue delete", "issue transfer", "label delete", "gist create",
        "gist edit", "gist delete", "project delete", "project close", "project item-delete", "project field-delete", "codespace code", "codespace cp",
        "codespace create", "codespace delete", "codespace edit", "codespace jupyter", "codespace logs", "codespace ports", "codespace ports forward",
        "codespace ports visibility", "codespace rebuild", "codespace ssh", "codespace stop", "extension install", "extension upgrade",
        "extension remove", "extension exec", "extension create", "agent-task create", "auth token", "auth login", "auth logout", "auth refresh",
        "auth switch", "auth setup-git", "config set", "alias set", "alias import", "alias delete", "ssh-key add", "ssh-key delete", "ssh-key list",
        "gpg-key add", "gpg-key delete", "gpg-key list",
    ];
    const PLAN_READ: &[&str] = &[
        "pr view", "pr list", "pr diff", "pr checks", "pr status", "issue view", "issue list", "issue status", "run view", "run list", "run watch",
        "workflow list", "workflow view", "repo view", "release list", "release view", "search code", "search commits", "search issues", "search prs",
        "search repos", "status", "label list", "cache list", "variable list", "variable get", "secret list", "project list", "project view",
        "project item-list", "project field-list", "ruleset list", "ruleset view", "alias list",
    ];
    const PLAN_KNOWN: &[&str] = &[
        "pr create", "pr comment", "pr edit", "pr checkout", "pr review", "issue create", "issue comment", "issue edit", "repo clone", "browse",
    ];
    const PLAN_SPECIAL: &[(&str, Special)] = &[
        ("pr close", Special::PrClose),
        ("auth status", Special::AuthStatus),
        ("config get", Special::ConfigGet),
        ("config list", Special::ConfigList),
        ("api", Special::Api),
    ];

    #[test]
    fn gh_table_covers_the_reference() {
        let t = gh();
        assert_eq!(t.heading_count, 214, "the fixture's command headings");
        let leaves = t.leaves();
        assert!(leaves.len() > 180, "{} leaves", leaves.len());
        let unclassed: Vec<&String> = leaves.iter().filter(|l| t.class(l).is_none()).collect();
        assert!(unclassed.is_empty(), "leaves with no class: {unclassed:?}");
        // The plan's lists hold, word for word.
        for l in PLAN_RISK {
            assert!(matches!(t.class(l), Some(Class::Risk(_))), "{l}: {:?}", t.class(l));
        }
        for l in PLAN_READ {
            assert_eq!(t.class(l), Some(Class::Read), "{l}");
        }
        for l in PLAN_KNOWN {
            assert_eq!(t.class(l), Some(Class::Known), "{l}");
        }
        for (l, s) in PLAN_SPECIAL {
            assert_eq!(t.class(l), Some(Class::Special(*s)), "{l}");
        }
        // Every codespace leaf but list and view is risk.
        for l in leaves.iter().filter(|l| l.starts_with("codespace ")) {
            let read = *l == "codespace list" || *l == "codespace view";
            assert_eq!(t.class(l) == Some(Class::Read), read, "{l}");
        }
        // Code review 1, minor 8.
        assert!(matches!(t.class("repo fork"), Some(Class::Risk(_))));
        assert_eq!(t.class("label clone"), Some(Class::Special(Special::LabelClone)));
        assert_eq!(t.class("pr update-branch"), Some(Class::Special(Special::UpdateBranch)));
        // Aliases from the fixture resolve.
        assert_eq!(t.class("co"), Some(Class::Known));
    }

    #[test]
    fn gh_lexicon() {
        let t = gh();
        let mut needed = Vec::new();
        let mut missing = Vec::new();
        for l in t.leaves() {
            let lexical = l.split([' ', '-']).any(|w| LEXICON.contains(&w));
            if !lexical || matches!(t.class(&l), Some(Class::Risk(_))) {
                continue;
            }
            needed.push(l.clone());
            match GH_LEXICON_EXCEPTIONS.iter().find(|(e, _)| *e == l) {
                Some((_, why)) if why.len() > 20 => {}
                _ => missing.push(l),
            }
        }
        assert!(needed.len() >= 10, "only {} leaves need an exception: {needed:?}", needed.len());
        assert!(missing.is_empty(), "lexicon leaves that are not risk and have no written exception: {missing:?}");
        let stale: Vec<&str> = GH_LEXICON_EXCEPTIONS.iter().map(|(e, _)| *e).filter(|e| !needed.iter().any(|n| n == e)).collect();
        assert!(stale.is_empty(), "exceptions that no leaf needs: {stale:?}");
    }
}

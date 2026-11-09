//! Text read from disk: scripts run by path, through a shell or sourced,
//! scripts written earlier on the line, and `package.json` scripts. The
//! caps and the read budget are in `bounds.rs`.
//!
//! **The disk-text rule** (review round 5, A): literal guarded commands in
//! a file always classify, but the fail-closed triggers (computed names,
//! computed evaluator code, parse failures, oversize) count only when the
//! file's text names a guarded bin as a word. So a stock `gradlew`,
//! `nvm.sh` or `~/.cargo/env` gives no decision.

use super::bounds::{MAX_DEPTH, PARSE_CAP, SCAN_CAP};
use super::lexer::{parse_at, ParseError};
use super::resolve::{Scope, W};
use super::tables::names_guarded;
use super::unwrap::{abs, In, Out, Run};
use super::Guard;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// How a script is run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Exec {
    /// `bash x.sh`: parsed whatever its first line says.
    Shell,
    /// `./x.sh`: parsed when it has a shell shebang or none (text).
    Path,
    /// `source x.sh` / `. x.sh`.
    Source,
}

/// What an earlier command on the line wrote to a path.
#[derive(Debug, Clone)]
pub enum Written {
    /// Literal text from the line (a template when it holds expansions).
    Text { text: String, strict: bool },
    /// Literal text appended to the file on disk.
    Append { text: String },
    /// A copy of another file.
    Copy(PathBuf),
    /// Anything else: a command's output, a computed source, a download.
    Opaque,
}

/// Whether a file starting with `head` is run as a shell script by path:
/// an `sh`, `bash`, `zsh` or `dash` shebang (`env` included), or no
/// shebang and text.
pub fn is_shell_script(head: &[u8]) -> bool {
    if let Some(rest) = head.strip_prefix(b"#!") {
        let line = rest.split(|&b| b == b'\n').next().unwrap_or(b"");
        let line = String::from_utf8_lossy(line);
        let mut words = line.split_whitespace();
        let mut prog = words.next().map(super::unwrap::basename).unwrap_or("");
        if prog == "env" {
            prog = words.find(|w| !w.starts_with('-') && !w.contains('=')).map(super::unwrap::basename).unwrap_or("");
        }
        return matches!(prog, "sh" | "bash" | "zsh" | "dash");
    }
    !head.contains(&0)
}

impl<'c, 'a> Guard<'c, 'a> {
    /// Parse and classify `text`. `strict`: fail-closed triggers ask.
    /// `args`: `$1`… when bound.
    pub fn run_text(&mut self, text: &str, strict: bool, cwd: PathBuf, args: Option<Vec<W>>) {
        if self.done() {
            return;
        }
        let names = names_guarded(text.as_bytes());
        match parse_at(text, self.depth) {
            Err(ParseError::TooDeep) => {
                if strict {
                    self.ask(format!("ADE: the command nests deeper than {MAX_DEPTH} levels, which the guard doesn't follow"));
                }
            }
            Err(e) => {
                if names {
                    self.ask(format!("ADE: the guard can't parse this ({}), and it names a guarded CLI", describe(&e)));
                }
            }
            Ok(script) => {
                let mut sc = Scope::new(&script, strict, names, cwd, args);
                // IFS set anywhere stays set for every text walked after it.
                sc.ifs_open |= self.ifs_open;
                self.settle(&mut sc);
                self.ifs_open = sc.ifs_open;
                self.depth += 1;
                self.list(&mut sc, &script.list);
                self.depth -= 1;
            }
        }
    }

    /// Read a script under the caps and the read budget, then classify it
    /// under the disk-text rule.
    pub fn read_script(&mut self, sc: &mut Scope, path: &Path, args: Vec<W>, how: Exec) -> Out {
        if self.done() || self.unknown_dir(path) {
            return Out::Unknown;
        }
        let fs = self.ctx.fs;
        if how == Exec::Path {
            match fs.read(path, 1024) {
                Some(head) if is_shell_script(&head.bytes) => {}
                _ => return Out::Unknown,
            }
        }
        let Some(fd) = fs.read(path, self.budget.min(SCAN_CAP)) else {
            // A virtualenv made earlier on the line (`python -m venv .venv && . .venv/bin/activate`).
            if self.generated.iter().any(|g| path.starts_with(g)) {
                return Out::Unknown;
            }
            self.trigger(sc, format!("ADE: this runs {}, which is missing or unreadable, so the guard can't see what it runs", path.display()));
            return Out::Unknown;
        };
        let len = fd.len as usize;
        if len > SCAN_CAP {
            if self.line_names {
                self.ask(format!("ADE: {} is over 4 MB, too large to check, and this command runs a guarded CLI", path.display()));
            }
            return Out::Unknown;
        }
        if len > self.budget {
            let found = names_guarded(&fd.bytes);
            self.budget = 0;
            if found {
                self.ask(format!("ADE: {} names a guarded CLI", path.display()));
            } else if self.line_names {
                self.ask(format!("ADE: {} is past the guard's 4 MB read budget, and this command runs a guarded CLI", path.display()));
            }
            return Out::Unknown;
        }
        self.budget -= len;
        if len > PARSE_CAP {
            if names_guarded(&fd.bytes) {
                self.ask(format!("ADE: {} names a guarded CLI and is too large to parse", path.display()));
            }
            return Out::Unknown;
        }
        let text = String::from_utf8_lossy(&fd.bytes).into_owned();
        let strict = names_guarded(text.as_bytes());
        self.run_text(&text, strict, sc.cwd.clone(), Some(args));
        Out::Unknown
    }

    /// Run a path an earlier command on the line wrote.
    pub fn run_written(&mut self, sc: &mut Scope, path: &Path, w: Written, args: Vec<W>, how: Exec) -> Out {
        match w {
            Written::Text { text, strict } => self.run_text(&text, strict, sc.cwd.clone(), Some(args)),
            Written::Append { text } => {
                let base = self.ctx.fs.read(path, PARSE_CAP.min(self.budget)).map(|f| {
                    self.budget -= f.bytes.len();
                    String::from_utf8_lossy(&f.bytes).into_owned()
                });
                let all = format!("{}{text}", base.unwrap_or_default());
                let strict = names_guarded(all.as_bytes());
                self.run_text(&all, strict, sc.cwd.clone(), Some(args));
            }
            Written::Copy(src) => return self.read_script(sc, &src, args, how),
            Written::Opaque => {
                self.trigger(sc, format!("ADE: this runs {}, written on this line from content the guard can't see", path.display()));
            }
        }
        Out::Unknown
    }

    /// A command named by path: a guarded bin through a symlink, a script,
    /// a program, or (missing) a binary built earlier on the line.
    pub fn path_command(&mut self, sc: &mut Scope, p: &str, args: &[W], stdin: In, run: Run) -> Out {
        let _ = stdin;
        let path = abs(&sc.cwd, p);
        if self.unknown_dir(&path) {
            return Out::Unknown;
        }
        if let Some(w) = self.writes.get(&path).cloned() {
            return self.run_written(sc, &path, w, args.to_vec(), Exec::Path);
        }
        let fs = self.ctx.fs;
        if fs.exists(&path) {
            if fs.is_dir(&path) {
                return Out::Unknown;
            }
            if let Some(real) = fs.canonicalize(&path) {
                let base = real.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                if let Some(id) = super::tables::guarded_bin(&base) {
                    self.cli(sc, id, args, run);
                    return Out::Unknown;
                }
            }
            return self.read_script(sc, &path, args.to_vec(), Exec::Path);
        }
        if self.tree_changed {
            self.trigger(
                sc,
                format!("ADE: {p} doesn't exist yet and an earlier command on this line changes the tree (a checkout, pull, unpack or download), so the guard can't see what it runs"),
            );
        }
        Out::Unknown
    }

    /// Remember what a redirect or `tee` writes to `path`.
    pub fn record_write(&mut self, sc: &Scope, path: PathBuf, out: &Out, append: bool) {
        let new = match (out, append) {
            (Out::Text(t), false) => Written::Text { text: t.clone(), strict: sc.strict },
            (Out::Text(t), true) => match self.writes.get(&path) {
                Some(Written::Text { text, strict }) => Written::Text { text: format!("{text}{t}"), strict: *strict },
                Some(_) => Written::Opaque,
                None => Written::Append { text: t.clone() },
            },
            (Out::File(f), false) => Written::Copy(f.clone()),
            _ => Written::Opaque,
        };
        self.writes.insert(path, new);
    }

    // ---- runners and package scripts ----

    /// `npx`, `npm exec`, `pnpm dlx`, `yarn dlx`, `bunx`, `bun x`.
    pub fn npx(&mut self, sc: &mut Scope, args: &[W], run: Run) -> Out {
        let mut k = 0;
        let mut pkg_given = false;
        while k < args.len() {
            let a = &args[k];
            if a.computed() {
                break;
            }
            let t = a.text.as_str();
            match t {
                "--" => {
                    k += 1;
                    break;
                }
                "-c" | "--call" => return args.get(k + 1).map_or(Out::Unknown, |c| self.code(sc, &c.clone(), None)),
                "-p" | "--package" => {
                    pkg_given = true;
                    k += 2;
                }
                _ if t.starts_with("--call=") => return self.code_text(sc, &t[7..], None),
                _ if t.starts_with("--package=") => {
                    pkg_given = true;
                    k += 1;
                }
                _ if t.starts_with('-') && t.len() > 1 => k += 1,
                _ => break,
            }
        }
        let Some(first) = args.get(k) else { return Out::Unknown };
        let bin = if pkg_given || first.computed() { first.clone() } else { W::lit(super::tables::package_bin(&first.text)) };
        let mut ws = vec![bin];
        ws.extend(args[k + 1..].iter().cloned());
        self.command(sc, &ws, In::None, run)
    }

    pub fn npm(&mut self, sc: &mut Scope, args: &[W], run: Run) -> Out {
        let mut sel = Sel::default();
        let k = sel.npm_opts(sc, args, 0);
        let Some(sub) = args.get(k) else { return Out::Unknown };
        if sub.computed() {
            self.trigger(sc, format!("ADE: npm's command is computed here ({})", sub.show()));
            return Out::Unknown;
        }
        let rest = &args[k + 1..];
        match sub.text.as_str() {
            "exec" | "x" => self.npx(sc, rest, run),
            "run" | "run-script" | "rum" | "urn" => {
                let mut sel2 = sel;
                let (script, extra) = sel2.script_args(sc, rest);
                let Some(script) = script else { return Out::Unknown };
                self.scripts(sc, &sel2, &script, &extra)
            }
            s @ ("start" | "test" | "t" | "tst" | "restart" | "stop") => {
                let name = match s {
                    "t" | "tst" => "test",
                    s => s,
                };
                let mut sel2 = sel;
                let (_, extra) = sel2.script_args(sc, &[&[W::lit(name)], rest].concat());
                self.scripts(sc, &sel2, &W::lit(name), &extra)
            }
            "install" | "i" | "in" | "ci" | "isntall" | "add" | "clean-install" | "install-test" | "it" | "install-ci-test" | "cit" => self.lifecycle(sc, &sel.dir(sc)),
            _ => Out::Unknown,
        }
    }

    pub fn pnpm(&mut self, sc: &mut Scope, args: &[W], run: Run) -> Out {
        let mut sel = Sel::default();
        let k = sel.pnpm_opts(sc, args, 0);
        let Some(sub) = args.get(k) else { return Out::Unknown };
        if sub.computed() {
            self.trigger(sc, format!("ADE: pnpm's command is computed here ({})", sub.show()));
            return Out::Unknown;
        }
        let rest = &args[k + 1..];
        match sub.text.as_str() {
            "exec" => {
                let j = sel.pnpm_opts(sc, rest, 0);
                self.command(sc, &rest[j..], In::None, run)
            }
            "dlx" => self.npx(sc, rest, run),
            "run" | "run-script" => {
                let (script, extra) = sel.script_args(sc, rest);
                let Some(script) = script else { return Out::Unknown };
                self.scripts(sc, &sel, &script, &extra)
            }
            "install" | "i" | "add" => self.lifecycle(sc, &sel.dir(sc)),
            s @ ("test" | "t" | "start") => {
                let name = if s == "t" { "test" } else { s };
                self.scripts(sc, &sel, &W::lit(name), rest)
            }
            s if PNPM_BUILTINS.contains(&s) => Out::Unknown,
            _ => self.script_or_bin(sc, &sel, sub, rest, run),
        }
    }

    pub fn yarn(&mut self, sc: &mut Scope, args: &[W], run: Run) -> Out {
        let mut k = 0;
        let mut dir = sc.cwd.clone();
        while k < args.len() && !args[k].computed() && args[k].text.starts_with('-') {
            if args[k].is("--cwd") {
                if let Some(d) = args.get(k + 1).filter(|d| !d.computed()) {
                    dir = abs(&sc.cwd, &d.text);
                }
                k += 1;
            }
            k += 1;
        }
        let Some(sub) = args.get(k) else { return self.lifecycle(sc, &dir) };
        if sub.computed() {
            self.trigger(sc, format!("ADE: yarn's command is computed here ({})", sub.show()));
            return Out::Unknown;
        }
        let rest = &args[k + 1..];
        let sel = Sel { dir: Some(dir.clone()), ..Sel::default() };
        match sub.text.as_str() {
            "workspace" => {
                let Some(name) = rest.first() else { return Out::Unknown };
                let dirs = self.select(&dir, std::slice::from_ref(&name.text), false);
                for d in dirs {
                    let saved = std::mem::replace(&mut sc.cwd, d);
                    self.yarn(sc, &rest[1..], run);
                    sc.cwd = saved;
                }
                Out::Unknown
            }
            "workspaces" => {
                if rest.first().is_some_and(|w| w.is("foreach")) {
                    let mut j = 1;
                    while j < rest.len() && rest[j].text.starts_with('-') {
                        j += if matches!(rest[j].text.as_str(), "--include" | "--exclude" | "--from" | "-j" | "--jobs" | "--since") { 2 } else { 1 };
                    }
                    for d in self.select(&dir, &[], true) {
                        let saved = std::mem::replace(&mut sc.cwd, d);
                        self.yarn(sc, rest.get(j..).unwrap_or(&[]), run);
                        sc.cwd = saved;
                    }
                }
                Out::Unknown
            }
            "exec" => self.command(sc, rest, In::None, run),
            "dlx" => self.npx(sc, rest, run),
            "run" => match rest.first() {
                Some(s) => self.script_or_bin(sc, &sel, s, &rest[1..], run),
                None => Out::Unknown,
            },
            "install" | "add" => self.lifecycle(sc, &dir),
            s if YARN_BUILTINS.contains(&s) => Out::Unknown,
            _ => self.script_or_bin(sc, &sel, sub, rest, run),
        }
    }

    pub fn bun(&mut self, sc: &mut Scope, args: &[W], run: Run) -> Out {
        let Some(sub) = args.first() else { return Out::Unknown };
        let rest = &args[1..];
        let sel = Sel::default();
        match sub.text.as_str() {
            "run" => match rest.iter().position(|w| !w.text.starts_with('-')) {
                Some(i) => self.script_or_bin(sc, &sel, &rest[i], &rest[i + 1..], run),
                None => Out::Unknown,
            },
            "x" => self.npx(sc, rest, run),
            "install" | "i" | "add" => self.lifecycle(sc, &sc.cwd.clone()),
            _ => Out::Unknown,
        }
    }

    /// `turbo run T…`, `nx run p:T`, `nx run-many -t T…`, `lerna run T`:
    /// the named scripts in the root and every workspace package.
    pub fn task_runner(&mut self, sc: &mut Scope, base: &str, args: &[W]) -> Out {
        let Some(sub) = args.first() else { return Out::Unknown };
        let pos = |ws: &[W]| -> Vec<W> { ws.iter().take_while(|w| !w.is("--")).filter(|w| !w.text.starts_with('-')).cloned().collect() };
        let tasks: Vec<W> = match (base, sub.text.as_str()) {
            ("turbo", "run" | "watch") => pos(&args[1..]),
            ("turbo", s) if TURBO_BUILTINS.contains(&s) => return Out::Unknown,
            ("turbo", _) => pos(args),
            ("nx", "run") => pos(&args[1..]).into_iter().take(1).map(|w| W::lit(w.text.split(':').nth(1).unwrap_or(&w.text))).collect(),
            ("nx", "run-many" | "affected") => {
                let mut v = Vec::new();
                let mut on = false;
                for w in &args[1..] {
                    let t = w.text.as_str();
                    if let Some(list) = t.strip_prefix("--target=").or_else(|| t.strip_prefix("--targets=")) {
                        v.extend(list.split(',').map(W::lit));
                        on = false;
                    } else if t == "-t" || t == "--target" || t == "--targets" {
                        on = true;
                    } else if t.starts_with('-') {
                        on = false;
                    } else if on {
                        v.extend(t.split(',').map(W::lit));
                    }
                }
                v
            }
            ("lerna", "run") => pos(&args[1..]).into_iter().take(1).collect(),
            _ => return Out::Unknown,
        };
        for t in tasks {
            // `//#task` is the root's task; `pkg#task` one package's; `task` every package's.
            let (sel, name) = match t.text.split_once('#') {
                Some(("//", n)) => (Sel::default(), n.to_string()),
                Some((pkg, n)) => (Sel { names: vec![pkg.to_string()], ..Sel::default() }, n.to_string()),
                None => (Sel { all: true, ..Sel::default() }, t.text.clone()),
            };
            self.scripts(sc, &sel, &W { text: name, ..t.clone() }, &[]);
        }
        Out::Unknown
    }

    /// `pnpm X` / `yarn X` / `bun run X`: the package script X if one is
    /// defined, else the bin X.
    fn script_or_bin(&mut self, sc: &mut Scope, sel: &Sel, name: &W, rest: &[W], run: Run) -> Out {
        if name.computed() {
            self.trigger(sc, format!("ADE: the script or command name is computed here ({})", name.show()));
            return Out::Unknown;
        }
        let dirs = self.dirs(sc, sel);
        let defined = dirs.iter().any(|d| self.peek_pkg(&d.join("package.json")).is_some_and(|j| j["scripts"][name.text.as_str()].is_string()));
        if defined {
            return self.scripts(sc, sel, name, rest);
        }
        let mut ws = vec![name.clone()];
        ws.extend(rest.iter().cloned());
        self.command(sc, &ws, In::None, run)
    }

    /// Run `pre<name>`, `<name>` (with `extra` appended) and `post<name>`
    /// from each selected package.
    fn scripts(&mut self, sc: &mut Scope, sel: &Sel, name: &W, extra: &[W]) -> Out {
        if name.computed() {
            self.trigger(sc, format!("ADE: the package script's name is computed here ({})", name.show()));
            return Out::Unknown;
        }
        for d in self.dirs(sc, sel) {
            let pj = d.join("package.json");
            let Some((json, strict)) = self.read_pkg(sc, &pj) else { continue };
            let n = name.text.as_str();
            for s in [format!("pre{n}"), n.to_string(), format!("post{n}")] {
                if let Some(body) = json["scripts"][s.as_str()].as_str() {
                    // A script already running is a cycle: npm would loop, so it adds nothing to judge.
                    let key = (d.clone(), s.clone());
                    if self.script_stack.contains(&key) {
                        continue;
                    }
                    let text = if s == n && !extra.is_empty() { format!("{body} {}", quote_args(extra)) } else { body.to_string() };
                    self.script_stack.push(key);
                    self.script_body(&text, strict, d.clone());
                    self.script_stack.pop();
                }
            }
        }
        Out::Unknown
    }

    /// `npm install` and friends run the root package's lifecycle scripts.
    fn lifecycle(&mut self, sc: &mut Scope, dir: &Path) -> Out {
        let pj = dir.join("package.json");
        let Some((json, strict)) = self.read_pkg(sc, &pj) else { return Out::Unknown };
        for s in ["preinstall", "install", "postinstall", "prepare"] {
            if let Some(body) = json["scripts"][s].as_str() {
                self.script_body(body, strict, dir.to_path_buf());
            }
        }
        Out::Unknown
    }

    fn script_body(&mut self, text: &str, strict: bool, dir: PathBuf) {
        if self.script_depth >= 4 {
            if strict {
                self.ask("ADE: package scripts call each other more than 4 levels deep, which the guard doesn't follow".into());
            }
            return;
        }
        self.script_depth += 1;
        self.run_text(text, strict, dir, None);
        self.script_depth -= 1;
    }

    /// A `package.json` under the budget, and whether its text names a
    /// guarded bin. A missing or unreadable one asks only when the command
    /// text names a guarded bin.
    fn read_pkg(&mut self, sc: &Scope, path: &Path) -> Option<(Value, bool)> {
        if self.unknown_dir(path) {
            return None;
        }
        let fd = self.ctx.fs.read(path, PARSE_CAP.min(self.budget));
        let parsed = fd.as_ref().filter(|f| f.len as usize <= f.bytes.len()).and_then(|f| serde_json::from_slice::<Value>(&f.bytes).ok());
        match (fd, parsed) {
            (Some(f), Some(json)) => {
                self.budget = self.budget.saturating_sub(f.bytes.len());
                Some((json, names_guarded(&f.bytes)))
            }
            (f, _) => {
                let names = sc.names || f.as_ref().is_some_and(|f| names_guarded(&f.bytes));
                if names {
                    self.ask(format!("ADE: {} is missing or can't be read, and this command names a guarded CLI", path.display()));
                }
                None
            }
        }
    }

    /// A small `package.json` read, outside the budget: for which names are scripts.
    fn peek_pkg(&self, path: &Path) -> Option<Value> {
        let f = self.ctx.fs.read(path, PARSE_CAP)?;
        serde_json::from_slice(&f.bytes).ok()
    }

    fn dirs(&mut self, sc: &Scope, sel: &Sel) -> Vec<PathBuf> {
        let root = sel.dir(sc);
        if sel.all {
            // pnpm -r, npm --workspaces and turbo run the packages, not the
            // root, unless asked to; a repo with no workspaces is its root.
            let pkgs = self.select(&root, &[], true);
            if pkgs.is_empty() {
                return vec![root];
            }
            let mut v = if sel.root { vec![root] } else { Vec::new() };
            v.extend(pkgs);
            return v;
        }
        if sel.names.is_empty() {
            return vec![root];
        }
        // A path selector (`--filter .`, `-F ./apps`, `{./apps}`) selects the
        // packages under that folder, and the root when the folder holds it.
        let mut v = Vec::new();
        let mut names = Vec::new();
        for n in &sel.names {
            let p = n.trim_start_matches('{').trim_end_matches('}');
            if p == "." || p.starts_with("./") || p.starts_with("../") {
                let dir = abs(&root, p);
                if root.starts_with(&dir) {
                    v.push(root.clone());
                }
                v.extend(self.select(&root, &[], true).into_iter().filter(|d| d.starts_with(&dir)));
            } else {
                names.push(n.clone());
            }
        }
        if !names.is_empty() {
            v.extend(self.select(&root, &names, false));
        }
        v.dedup();
        v
    }

    /// The workspace packages under `root` matching `names` (by name or
    /// folder), or all of them; up to 200. An unmatched name selects all.
    fn select(&mut self, root: &Path, names: &[String], all: bool) -> Vec<PathBuf> {
        let mut pats: Vec<String> = Vec::new();
        if let Some(j) = self.peek_pkg(&root.join("package.json")) {
            let ws = &j["workspaces"];
            let list = ws.as_array().or_else(|| ws["packages"].as_array());
            pats.extend(list.into_iter().flatten().filter_map(|v| v.as_str().map(String::from)));
        }
        if let Some(f) = self.ctx.fs.read(&root.join("pnpm-workspace.yaml"), 64 * 1024) {
            let text = String::from_utf8_lossy(&f.bytes).into_owned();
            let mut inside = false;
            for line in text.lines() {
                if !line.starts_with(' ') && !line.starts_with('-') {
                    inside = line.trim_end() == "packages:";
                    continue;
                }
                if let Some(p) = line.trim().strip_prefix('-').filter(|_| inside) {
                    pats.push(p.trim().trim_matches(['\'', '"']).to_string());
                }
            }
        }
        let fs = self.ctx.fs;
        let mut pkgs: Vec<PathBuf> = Vec::new();
        for p in pats.iter().filter(|p| !p.starts_with('!')) {
            let p = p.trim_start_matches("./").trim_end_matches('/');
            if let Some(prefix) = p.strip_suffix("/**").or_else(|| p.strip_suffix("/*")) {
                let dir = root.join(prefix);
                for n in fs.list_dir(&dir) {
                    if fs.exists(&dir.join(&n).join("package.json")) {
                        pkgs.push(dir.join(n));
                    }
                }
            } else if fs.exists(&root.join(p).join("package.json")) {
                pkgs.push(root.join(p));
            }
            if pkgs.len() >= 200 {
                pkgs.truncate(200);
                break;
            }
        }
        if all || names.is_empty() {
            return pkgs;
        }
        let picked: Vec<PathBuf> = pkgs
            .iter()
            .filter(|d| {
                let name = self.peek_pkg(&d.join("package.json")).and_then(|j| j["name"].as_str().map(String::from));
                names.iter().any(|n| name.as_deref() == Some(n.as_str()) || d.ends_with(n.trim_start_matches("./")))
            })
            .cloned()
            .collect();
        if picked.is_empty() {
            pkgs
        } else {
            picked
        }
    }
}

const PNPM_BUILTINS: &[&str] = &[
    "add", "audit", "bin", "config", "c", "create", "dedupe", "deploy", "doctor", "env", "fetch", "help", "import", "init", "install-test", "it", "licenses", "link", "ln",
    "list", "ls", "outdated", "pack", "patch", "patch-commit", "prune", "publish", "rebuild", "rb", "remove", "rm", "root", "server", "setup", "store", "unlink", "update",
    "up", "upgrade", "why",
];
const YARN_BUILTINS: &[&str] = &[
    "add", "bin", "cache", "config", "constraints", "dedupe", "explain", "info", "init", "link", "node", "npm", "pack", "patch", "plugin", "rebuild", "remove", "set",
    "stage", "unlink", "unplug", "up", "upgrade", "version", "why", "help", "list", "outdated", "audit", "global", "login", "logout", "owner", "publish", "tag", "team",
];
const TURBO_BUILTINS: &[&str] = &["login", "logout", "link", "unlink", "prune", "gen", "generate", "daemon", "ls", "info", "telemetry", "query", "boundaries", "scan", "devtools", "bin", "completion", "docs"];

fn quote_args(ws: &[W]) -> String {
    ws.iter()
        .map(|w| if w.text.chars().any(|c| c.is_whitespace() || "'\"$`\\;&|<>()".contains(c)) { format!("'{}'", w.text.replace('\'', "'\\''")) } else { w.text.clone() })
        .collect::<Vec<_>>()
        .join(" ")
}

fn describe(e: &ParseError) -> String {
    match e {
        ParseError::Unclosed(what) => format!("an unclosed {what}"),
        ParseError::TooDeep => "too deep".into(),
        ParseError::Syntax(s) => s.clone(),
    }
}

/// A package-manager command's selection: its folder and workspace filters.
#[derive(Debug, Default, Clone)]
pub struct Sel {
    pub dir: Option<PathBuf>,
    pub names: Vec<String>,
    /// Every workspace package (`--workspaces`, `-r`, a task runner).
    pub all: bool,
    /// The workspace root too (`--include-workspace-root`, turbo's `//#task`).
    pub root: bool,
}

impl Sel {
    fn dir(&self, sc: &Scope) -> PathBuf {
        self.dir.clone().unwrap_or_else(|| sc.cwd.clone())
    }

    /// npm's options from `k` on; returns the first operand's index.
    fn npm_opts(&mut self, sc: &Scope, args: &[W], mut k: usize) -> usize {
        while k < args.len() {
            let a = &args[k];
            if a.computed() {
                return k;
            }
            let t = a.text.as_str();
            let next = || args.get(k + 1).map(|w| w.text.clone()).unwrap_or_default();
            match t {
                "-w" | "--workspace" => {
                    self.names.push(next());
                    k += 2;
                }
                "--workspaces" | "-ws" => {
                    self.all = true;
                    k += 1;
                }
                "--include-workspace-root" | "-iwr" => {
                    self.root = true;
                    k += 1;
                }
                "--prefix" | "-C" => {
                    self.dir = Some(abs(&sc.cwd, &next()));
                    k += 2;
                }
                _ if t.starts_with("--workspace=") => {
                    self.names.push(t[12..].to_string());
                    k += 1;
                }
                _ if t.starts_with("--prefix=") => {
                    self.dir = Some(abs(&sc.cwd, &t[9..]));
                    k += 1;
                }
                "--" => return k,
                _ if t.starts_with('-') && t.len() > 1 => k += 1,
                _ => return k,
            }
        }
        k
    }

    fn pnpm_opts(&mut self, sc: &Scope, args: &[W], mut k: usize) -> usize {
        while k < args.len() {
            let a = &args[k];
            if a.computed() {
                return k;
            }
            let t = a.text.as_str();
            let next = || args.get(k + 1).map(|w| w.text.clone()).unwrap_or_default();
            match t {
                "--filter" | "-F" => {
                    self.names.push(next());
                    k += 2;
                }
                "-r" | "--recursive" => {
                    self.all = true;
                    k += 1;
                }
                "--include-workspace-root" => {
                    self.root = true;
                    k += 1;
                }
                "-C" | "--dir" => {
                    self.dir = Some(abs(&sc.cwd, &next()));
                    k += 2;
                }
                _ if t.starts_with("--filter=") => {
                    self.names.push(t[9..].to_string());
                    k += 1;
                }
                _ if t.starts_with('-') && t.len() > 1 => k += 1,
                _ => return k,
            }
        }
        k
    }

    /// After `run`: the script's name, and the arguments passed to it
    /// (npm's own options, like `-w`, may follow the name).
    fn script_args(&mut self, sc: &Scope, rest: &[W]) -> (Option<W>, Vec<W>) {
        let mut name = None;
        let mut extra = Vec::new();
        let mut k = 0;
        while k < rest.len() {
            let w = &rest[k];
            if w.is("--") {
                extra.extend(rest[k + 1..].iter().cloned());
                break;
            }
            if !w.computed() && w.text.starts_with('-') && name.is_some() {
                let j = self.npm_opts(sc, rest, k);
                if j > k {
                    k = j;
                    continue;
                }
            }
            if name.is_none() && !(w.text.starts_with('-') && !w.computed()) {
                name = Some(w.clone());
            } else if name.is_none() {
                k = self.npm_opts(sc, rest, k).max(k + 1);
                continue;
            } else {
                extra.push(w.clone());
            }
            k += 1;
        }
        (name, extra)
    }
}

#[cfg(test)]
mod tests {
    use super::super::testfs::*;

    /// Code review 1, major 1: a root script that runs the workspace (`turbo
    /// run build`, `pnpm -r test`) doesn't call itself, and a script already
    /// on the call stack ends the walk without asking.
    #[test]
    fn monorepo_roots_dont_recurse() {
        let root = r#"{"name":"root","private":true,"workspaces":["packages/*"],"scripts":{"build":"turbo run build","test":"pnpm -r test","lint":"turbo lint","check":"npm run lint --workspaces","release":"gh release create v1","loop":"npm run loop2","loop2":"npm run loop","y":"gh release delete v1"}}"#;
        let fs = FakeFs::new()
            .file("/w/package.json", root)
            .file("/w/pnpm-workspace.yaml", "packages:\n  - \"packages/*\"\n")
            .file("/w/turbo.json", "{}\n")
            .file("/w/packages/a/package.json", r#"{"name":"a","scripts":{"build":"tsc","test":"vitest run","lint":"eslint .","y":"echo y","z":"echo z"}}"#)
            .file("/w/packages/b/package.json", r#"{"name":"b","scripts":{"build":"tsc","test":"vitest run","deploy":"gh release upload v1 dist/*","z":"gh release delete v2"}}"#);
        check(
            &fs,
            &[
                ("npm run build", false),
                ("pnpm test", false),
                ("npm test", false),
                ("pnpm build", false),
                ("turbo run build", false),
                ("turbo build", false),
                ("pnpm -r test", false),
                ("pnpm -r run build", false),
                ("npm run lint", false),
                ("turbo lint", false),
                ("npm run check", false),
                ("npm run build --workspaces", false),
                ("npm run loop", false),
                // The root's own `y` is not a package's: only the packages run.
                ("turbo run y", false),
                ("pnpm -r run y", false),
                ("npm run y --workspaces", false),
                ("npm run y", true),
                // `pkg#task` is that package's task only.
                ("turbo run a#z", false),
                ("turbo run b#z", true),
                // The root's own release still asks, and so does a package's deploy.
                ("npm run release", true),
                ("pnpm release", true),
                ("turbo run //#release", true),
                ("pnpm -r --include-workspace-root release", true),
                ("npm run release --workspaces --include-workspace-root", true),
                ("turbo run deploy", true),
                ("pnpm -r run deploy", true),
                // `--filter .` / `-F ./dir` select the packages under the folder, the root included.
                ("pnpm --filter . release", true),
                ("pnpm -F ./ run release", true),
                ("pnpm --filter ./packages/a run z", false),
                ("pnpm --filter ./packages/b run z", true),
                ("npm run deploy --workspaces", true),
            ],
        );
    }
}

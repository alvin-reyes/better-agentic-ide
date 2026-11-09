//! Words: quote removal, brace expansion, `~`, and strict resolution of
//! variables assigned earlier on the same line.
//!
//! An expansion the guard can't resolve becomes a placeholder character in
//! the word's text: [`Q_PH`] where it can't split into several words (it was
//! double-quoted), [`U_PH`] where it can. A word holding either is computed.
//! Text with placeholders can be parsed again as a template (`bash -c "…"`):
//! there each placeholder is a computed word, and its quoting in the inner
//! text decides whether it can split.
//!
//! A variable resolves only under the plan's strict conditions: exactly one
//! assignment to it on the line, literal (or built only from variables that
//! resolve, to a depth of 4), unconditional, at top level, before the use,
//! on a line with none of the disqualifiers.

use super::lexer::{assignment, Cmd, Heredoc, List, Part, Script, Simple, Word};
use super::{Ctx, Guard};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

/// An expansion that can't be known and can't split.
pub const Q_PH: char = '\u{E000}';
/// An expansion that can't be known and may split into several words.
pub const U_PH: char = '\u{E001}';

fn is_ph(c: char) -> bool {
    c == Q_PH || c == U_PH
}

/// A word after expansion.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct W {
    pub text: String,
    /// Byte offsets of unquoted `*`, `?`, `[`, `{` and `}`.
    pub glob_at: Vec<usize>,
    pub quoted: bool,
}

impl W {
    pub fn lit(s: impl Into<String>) -> W {
        W { text: s.into(), glob_at: Vec::new(), quoted: false }
    }
    pub fn computed(&self) -> bool {
        self.text.contains(Q_PH) || self.text.contains(U_PH)
    }
    pub fn glob(&self) -> bool {
        self.glob_at.iter().any(|&k| matches!(self.text.as_bytes()[k], b'*' | b'?' | b'['))
    }
    pub fn brace(&self) -> bool {
        self.glob_at.iter().any(|&k| matches!(self.text.as_bytes()[k], b'{' | b'}'))
    }
    /// A literal word equal to `s`.
    pub fn is(&self, s: &str) -> bool {
        self.text == s && !self.computed()
    }
    /// For reasons: placeholders shown as `$…`.
    pub fn show(&self) -> String {
        let s: String = self.text.chars().map(|c| if is_ph(c) { '\u{2026}' } else { c }).collect();
        s.replace('\u{2026}', "$\u{2026}")
    }
    /// The text after `from` (a byte offset), as a word of its own.
    pub fn tail(&self, from: usize) -> W {
        W { text: self.text[from..].to_string(), glob_at: self.glob_at.iter().filter(|&&k| k >= from).map(|k| k - from).collect(), quoted: self.quoted }
    }
}

/// Join words with spaces, as `eval` and `ssh` do.
pub fn join(ws: &[W]) -> String {
    ws.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" ")
}

/// Split text into words with shell quoting and no expansion, for
/// `env -S`, gh alias expansions and the fallback. `;`, `|`, `&`, `(` and
/// `)` separate words too. Placeholders are kept.
pub fn split_words(text: &str) -> Vec<W> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut started = false;
    let mut quoted = false;
    let mut chars = text.chars().peekable();
    let push = |cur: &mut String, started: &mut bool, quoted: &mut bool, out: &mut Vec<W>| {
        if *started {
            out.push(W { text: std::mem::take(cur), glob_at: Vec::new(), quoted: *quoted });
        }
        *started = false;
        *quoted = false;
    };
    while let Some(c) = chars.next() {
        match c {
            c if c.is_whitespace() || matches!(c, ';' | '|' | '&' | '(' | ')') => push(&mut cur, &mut started, &mut quoted, &mut out),
            '\'' => {
                started = true;
                quoted = true;
                for d in chars.by_ref() {
                    if d == '\'' {
                        break;
                    }
                    cur.push(d);
                }
            }
            '"' => {
                started = true;
                quoted = true;
                while let Some(d) = chars.next() {
                    match d {
                        '"' => break,
                        '\\' if matches!(chars.peek(), Some('"' | '\\' | '$' | '`')) => cur.push(chars.next().unwrap()),
                        d => cur.push(d),
                    }
                }
            }
            '\\' => {
                started = true;
                if let Some(d) = chars.next() {
                    cur.push(d);
                }
            }
            c => {
                started = true;
                cur.push(c);
            }
        }
    }
    push(&mut cur, &mut started, &mut quoted, &mut out);
    out
}

/// One assignment to a name seen by the pre-pass.
#[derive(Debug, Clone)]
pub struct Ev {
    pub pos: usize,
    /// Unconditional, at top level.
    pub top: bool,
    /// The value of a plain `NAME=value` (or `export NAME=value`); None for
    /// every other form, which makes the name computed.
    pub value: Option<Word>,
}

/// What the guard knows while it walks one parsed text.
pub struct Scope<'s> {
    /// Fail-closed triggers ask (the command line, or disk text naming a guarded bin).
    pub strict: bool,
    /// The text names a guarded bin as a word.
    pub names: bool,
    pub vars: HashMap<String, Vec<Ev>>,
    /// A line disqualifier was seen: no variable resolves.
    pub disq: bool,
    pub funcs: HashMap<String, &'s Cmd>,
    /// Literal command names used on the line (function call sites).
    pub called: HashSet<String>,
    /// `$1`…, when bound: a function's call-site arguments or a script's.
    pub args: Option<Vec<W>>,
    pub cwd: PathBuf,
    pub heredocs: &'s [Heredoc],
}

impl<'s> Scope<'s> {
    pub fn new(script: &'s Script, strict: bool, names: bool, cwd: PathBuf, args: Option<Vec<W>>) -> Scope<'s> {
        let mut sc = Scope {
            strict,
            names,
            vars: HashMap::new(),
            disq: false,
            funcs: HashMap::new(),
            called: HashSet::new(),
            args,
            cwd,
            heredocs: &script.heredocs,
        };
        prepass(&mut sc, &script.list, true);
        for h in &script.heredocs {
            prepass_parts(&mut sc, &h.body);
        }
        sc
    }

    fn ev(&mut self, name: &str, pos: usize, top: bool, value: Option<Word>) {
        self.vars.entry(name.to_string()).or_default().push(Ev { pos, top, value });
    }
}

/// Collect every assignment, the line disqualifiers, function definitions
/// and call sites. `top` is true while the walk is unconditional and at top level.
fn prepass<'s>(sc: &mut Scope<'s>, list: &'s List, top: bool) {
    for item in list {
        let top = top && !item.background;
        let single = item.andor.rest.is_empty();
        for p in std::iter::once(&item.andor.first).chain(&item.andor.rest) {
            let top = top && single && p.cmds.len() == 1;
            for c in &p.cmds {
                prepass_cmd(sc, c, top);
            }
        }
    }
}

fn prepass_cmd<'s>(sc: &mut Scope<'s>, c: &'s Cmd, top: bool) {
    match c {
        Cmd::Simple(s) => prepass_simple(sc, s, top),
        Cmd::Subshell(l, r) | Cmd::Group(l, r) => {
            prepass(sc, l, false);
            prepass_redirs(sc, r);
        }
        Cmd::If(arms, els, r) => {
            for (a, b) in arms {
                prepass(sc, a, false);
                prepass(sc, b, false);
            }
            if let Some(e) = els {
                prepass(sc, e, false);
            }
            prepass_redirs(sc, r);
        }
        Cmd::Loop { cond, body, redirs } => {
            prepass(sc, cond, false);
            prepass(sc, body, false);
            prepass_redirs(sc, redirs);
        }
        Cmd::For { var, words, body, select, arith_assigns, redirs } => {
            if *select || *arith_assigns {
                sc.disq = true;
            }
            if !var.is_empty() {
                sc.ev(var, 0, false, None);
            }
            for w in words.iter().flatten() {
                prepass_parts(sc, &w.parts);
            }
            prepass(sc, body, false);
            prepass_redirs(sc, redirs);
        }
        Cmd::Case { word, arms, redirs } => {
            prepass_parts(sc, &word.parts);
            for (pats, body) in arms {
                for p in pats {
                    prepass_parts(sc, &p.parts);
                }
                prepass(sc, body, false);
            }
            prepass_redirs(sc, redirs);
        }
        Cmd::Func { name, body } => {
            sc.funcs.insert(name.clone(), body);
            prepass_cmd(sc, body, false);
        }
        Cmd::Coproc(b) => prepass_cmd(sc, b, false),
        Cmd::Arith { assigns } => sc.disq |= assigns,
        Cmd::Cond(words) => {
            for w in words {
                prepass_parts(sc, &w.parts);
            }
        }
    }
}

fn prepass_redirs(sc: &mut Scope, rs: &[super::lexer::Redir]) {
    for r in rs {
        prepass_parts(sc, &r.target.parts);
    }
}

/// Substitutions inside words run commands that can assign too.
fn prepass_parts(sc: &mut Scope, parts: &[Part]) {
    for p in parts {
        match p {
            Part::Sub { list, .. } | Part::ProcSub { list } => prepass_owned(sc, list),
            Part::Param { inner, .. } => prepass_parts(sc, inner),
            Part::Arith { assigns, .. } => sc.disq |= assigns,
            Part::Lit { .. } => {}
        }
    }
}

/// A substitution's list: it isn't borrowed for `'s` (functions defined in
/// a substitution are not callable outside it), so only its assignments count.
fn prepass_owned(sc: &mut Scope, list: &List) {
    fn walk(sc: &mut Scope, list: &List) {
        for item in list {
            for p in std::iter::once(&item.andor.first).chain(&item.andor.rest) {
                for c in &p.cmds {
                    cmd(sc, c);
                }
            }
        }
    }
    fn cmd(sc: &mut Scope, c: &Cmd) {
        match c {
            Cmd::Simple(s) => simple_assigns(sc, s, false),
            Cmd::Subshell(l, _) | Cmd::Group(l, _) => walk(sc, l),
            Cmd::If(arms, els, _) => {
                for (a, b) in arms {
                    walk(sc, a);
                    walk(sc, b);
                }
                if let Some(e) = els {
                    walk(sc, e);
                }
            }
            Cmd::Loop { cond, body, .. } => {
                walk(sc, cond);
                walk(sc, body);
            }
            Cmd::For { var, body, select, arith_assigns, .. } => {
                sc.disq |= *select || *arith_assigns;
                if !var.is_empty() {
                    sc.ev(var, 0, false, None);
                }
                walk(sc, body);
            }
            Cmd::Case { arms, .. } => {
                for (_, b) in arms {
                    walk(sc, b);
                }
            }
            Cmd::Func { body, .. } | Cmd::Coproc(body) => cmd(sc, body),
            Cmd::Arith { assigns } => sc.disq |= assigns,
            Cmd::Cond(_) => {}
        }
    }
    walk(sc, list);
}

fn prepass_simple(sc: &mut Scope, s: &Simple, top: bool) {
    simple_assigns(sc, s, top);
    if let Some(name) = s.words.first().and_then(Word::literal) {
        sc.called.insert(name);
    }
}

/// The assignments a simple command makes, and the disqualifiers it holds.
fn simple_assigns(sc: &mut Scope, s: &Simple, top: bool) {
    for a in &s.assigns {
        prepass_parts(sc, &a.value.parts);
        for w in &a.array_words {
            prepass_parts(sc, &w.parts);
        }
        let plain = s.words.is_empty() && !a.append && !a.array;
        sc.ev(&a.name, a.pos, top && s.words.is_empty(), plain.then(|| a.value.clone()));
    }
    for w in &s.words {
        prepass_parts(sc, &w.parts);
    }
    for r in &s.redirs {
        prepass_parts(sc, &r.target.parts);
    }
    let Some(name) = s.words.first().and_then(Word::literal) else { return };
    let args = &s.words[1..];
    let lit = |w: &Word| w.literal();
    match name.as_str() {
        "eval" | "source" | "." | "getopts" => sc.disq = true,
        "export" | "readonly" => {
            for w in args {
                match (assignment(w), lit(w)) {
                    (Some(a), _) => {
                        let plain = !a.append && !a.array;
                        sc.ev(&a.name, a.pos, top, plain.then_some(a.value));
                    }
                    (None, Some(_)) => {}
                    (None, None) => sc.disq = true,
                }
            }
        }
        "declare" | "typeset" | "local" => {
            for w in args {
                match (assignment(w), lit(w)) {
                    (Some(a), _) => sc.ev(&a.name, a.pos, false, None),
                    (None, Some(t)) if t.starts_with('-') || t.starts_with('+') => {
                        if t[1..].contains('n') {
                            sc.disq = true;
                        }
                    }
                    (None, Some(t)) => sc.ev(&t, w.pos, false, None),
                    (None, None) => sc.disq = true,
                }
            }
        }
        "read" => {
            let mut k = 0;
            while k < args.len() {
                match lit(&args[k]) {
                    Some(t) if t.starts_with('-') && t.len() > 1 => {
                        let last = t.chars().last().unwrap();
                        if "adinNptu".contains(last) {
                            if last == 'a' {
                                if let Some(n) = args.get(k + 1).and_then(lit) {
                                    sc.ev(&n, args[k].pos, false, None);
                                }
                            }
                            k += 1;
                        }
                    }
                    Some(t) => sc.ev(&t, args[k].pos, false, None),
                    None => sc.disq = true,
                }
                k += 1;
            }
            if args.is_empty() {
                sc.ev("REPLY", 0, false, None);
            }
        }
        "printf" => match args.first().and_then(lit) {
            Some(t) if t == "-v" => match args.get(1).and_then(lit) {
                Some(n) => sc.ev(&n, args[1].pos, false, None),
                None => sc.disq = true,
            },
            Some(t) if t.starts_with("-v") => sc.ev(&t[2..], args[0].pos, false, None),
            None if !args.is_empty() && matches!(args[0].parts.first(), Some(Part::Lit { text, .. }) if text.starts_with("-v")) => sc.disq = true,
            _ => {}
        },
        "let" => {
            for w in args {
                match lit(w) {
                    Some(t) => {
                        for name in t.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_')).filter(|n| n.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_')) {
                            sc.ev(name, w.pos, false, None);
                        }
                    }
                    None => sc.disq = true,
                }
            }
        }
        "mapfile" | "readarray" => {
            let mut named = false;
            let mut k = 0;
            while k < args.len() {
                match lit(&args[k]) {
                    Some(t) if t.starts_with('-') => {
                        if t.len() == 2 && "dnOsuCc".contains(&t[1..]) {
                            k += 1;
                        }
                    }
                    Some(t) => {
                        sc.ev(&t, args[k].pos, false, None);
                        named = true;
                    }
                    None => sc.disq = true,
                }
                k += 1;
            }
            if !named {
                sc.ev("MAPFILE", 0, false, None);
            }
        }
        "unset" => {
            for w in args {
                match lit(w) {
                    Some(t) if !t.starts_with('-') => sc.ev(&t, w.pos, false, None),
                    Some(_) => {}
                    None => sc.disq = true,
                }
            }
        }
        _ => {}
    }
}

impl<'c, 'a> Guard<'c, 'a> {
    /// The strict value of `$name` used at `use_pos`, if it resolves.
    pub fn resolve(&self, sc: &Scope, name: &str, use_pos: usize, depth: u32) -> Option<String> {
        if name == "HOME" && !sc.vars.contains_key("HOME") {
            return home_text(self.ctx);
        }
        // gh's config folders come from the session's environment when the
        // line doesn't assign them, as `$HOME` does.
        if matches!(name, "GH_CONFIG_DIR" | "XDG_CONFIG_HOME") && !sc.vars.contains_key(name) {
            return (self.ctx.env)(name).filter(|v| v.starts_with('/'));
        }
        // ADE's helper, from the session, unless the line assigns it (story 9).
        if name == "ADE_HOOK_BIN" && !sc.vars.contains_key(name) {
            return Some((self.ctx.env)(name).filter(|v| v.starts_with('/')).unwrap_or_else(|| "ade-hook".into()));
        }
        if sc.disq || depth > 4 {
            return None;
        }
        let evs = sc.vars.get(name)?;
        let [e] = evs.as_slice() else { return None };
        if !e.top || e.pos >= use_pos {
            return None;
        }
        let v = e.value.as_ref()?;
        let mut out = String::new();
        for (k, p) in v.parts.iter().enumerate() {
            match p {
                Part::Lit { text, quoted } => {
                    if k == 0 && !quoted && (text == "~" || text.starts_with("~/")) {
                        out.push_str(&home_text(self.ctx)?);
                        out.push_str(&text[1..]);
                    } else {
                        out.push_str(text);
                    }
                }
                Part::Param { name: n, plain: true, inner, .. } if inner.is_empty() && n.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_') => {
                    out.push_str(&self.resolve(sc, n, e.pos, depth + 1)?);
                }
                _ => return None,
            }
        }
        Some(out)
    }

    /// `$1`, `$@`, `$*` and `$#` when the scope's arguments are bound.
    fn positional(&self, sc: &Scope, name: &str) -> Option<Vec<W>> {
        let args = sc.args.as_ref()?;
        match name {
            "@" | "*" => Some(args.clone()),
            "#" => Some(vec![W::lit(args.len().to_string())]),
            n => {
                let k: usize = n.parse().ok()?;
                if k == 0 {
                    return None;
                }
                Some(vec![args.get(k - 1).cloned().unwrap_or_default()])
            }
        }
    }

    /// Classify what a part's substitutions run.
    fn part_subs<'s>(&mut self, sc: &mut Scope<'s>, p: &Part) {
        match p {
            Part::Sub { list, .. } | Part::ProcSub { list } => self.sub_list(sc, list),
            Part::Param { inner, .. } => {
                for ip in inner {
                    self.part_subs(sc, ip);
                }
            }
            _ => {}
        }
    }

    /// A substitution runs in a subshell: the walk sees it, its `cd` doesn't leak.
    pub fn sub_list(&mut self, sc: &mut Scope, list: &List) {
        let cwd = sc.cwd.clone();
        self.depth += 1;
        let out = self.list_any(sc, list);
        self.depth -= 1;
        sc.cwd = cwd;
        if matches!(out, super::unwrap::Out::CredNames) {
            self.ask("ADE: an argument is the list of files a find over gh's credential folder prints".into());
        }
    }

    /// Expand one word into the words it becomes.
    pub fn expand(&mut self, sc: &mut Scope, w: &Word) -> Vec<W> {
        let mut atoms: Vec<(char, bool)> = Vec::new();
        let mut quoted_any = false;
        for (k, p) in w.parts.iter().enumerate() {
            match p {
                Part::Lit { text, quoted } => {
                    quoted_any |= quoted;
                    for c in text.chars() {
                        if is_ph(c) {
                            atoms.push((if *quoted { Q_PH } else { U_PH }, false));
                        } else {
                            atoms.push((c, !quoted));
                        }
                    }
                }
                Part::Param { name, plain, quoted, inner } => {
                    for ip in inner {
                        self.part_subs(sc, ip);
                    }
                    quoted_any |= quoted;
                    let positional = name.chars().all(|c| c.is_ascii_digit()) || matches!(name.as_str(), "@" | "*" | "#");
                    if positional && *plain {
                        if let Some(vals) = self.positional(sc, name) {
                            if (name == "@" || name == "*") && w.parts.len() == 1 && (name == "@" || !quoted) {
                                return vals;
                            }
                            // `"x$@"` is a word per argument.
                            if name == "@" && *quoted && vals.len() > 1 {
                                atoms.push((U_PH, false));
                            } else {
                                push_value(&mut atoms, &join(&vals), *quoted);
                            }
                            continue;
                        }
                    }
                    // Quoted, it is still several words: `"$@"`, `"${a[@]}"`,
                    // zsh's `"${(@)a}"`, `"${(f)x}"` and `"$a[@]"`.
                    let next_at = matches!(w.parts.get(k + 1), Some(Part::Lit { text, .. }) if text.starts_with("[@]"));
                    if *quoted && may_be_words(name, *plain, inner, next_at) {
                        atoms.push((U_PH, false));
                        continue;
                    }
                    let v = if *plain && !positional { self.resolve(sc, name, w.pos, 1) } else { None };
                    match v {
                        Some(v) => push_value(&mut atoms, &v, *quoted),
                        None => atoms.push((if *quoted { Q_PH } else { U_PH }, false)),
                    }
                }
                Part::Sub { list, quoted } => {
                    self.sub_list(sc, list);
                    quoted_any |= quoted;
                    // `$(cat <<'EOF' … EOF)` is the here-doc's literal text.
                    match literal_heredoc(sc, list) {
                        Some(text) => push_value(&mut atoms, &text, *quoted),
                        None => atoms.push((if *quoted { Q_PH } else { U_PH }, false)),
                    }
                }
                Part::ProcSub { list } => {
                    self.sub_list(sc, list);
                    atoms.push((Q_PH, false));
                }
                Part::Arith { .. } => atoms.push((Q_PH, false)),
            }
        }
        // `~` and `~/…` at the start.
        if atoms.first() == Some(&('~', true)) && (atoms.len() == 1 || atoms[1] == ('/', true)) {
            if let Some(h) = home_text(self.ctx) {
                atoms.splice(0..1, h.chars().map(|c| (c, false)));
            }
        }
        let mut words = Vec::new();
        if atoms.iter().any(|&(c, u)| u && c == '{') {
            let mut budget = 256;
            brace_expand(atoms, &mut words, &mut budget);
            if budget == 0 {
                return vec![W { text: U_PH.to_string(), glob_at: Vec::new(), quoted: false }];
            }
        } else {
            words.push(atoms);
        }
        words
            .into_iter()
            .filter_map(|atoms| {
                let mut text = String::new();
                let mut glob_at = Vec::new();
                for (c, u) in atoms {
                    if u && matches!(c, '*' | '?' | '[' | '{' | '}') {
                        glob_at.push(text.len());
                    }
                    text.push(c);
                }
                (!text.is_empty() || quoted_any).then_some(W { text, glob_at, quoted: quoted_any })
            })
            .collect()
    }

    /// Expand a word into one (joined) word.
    pub fn expand_one(&mut self, sc: &mut Scope, w: &Word) -> W {
        let ws = self.expand(sc, w);
        match ws.len() {
            1 => ws.into_iter().next().unwrap(),
            _ => W { text: join(&ws), glob_at: Vec::new(), quoted: true },
        }
    }

    /// A here-doc body's text, with unknown expansions as placeholders.
    pub fn expand_text(&mut self, sc: &mut Scope, parts: &[Part]) -> String {
        let w = Word { parts: parts.to_vec(), pos: usize::MAX };
        let mut text = String::new();
        for p in &w.parts {
            match p {
                Part::Lit { text: t, .. } => text.push_str(t),
                Part::Param { name, plain, inner, .. } => {
                    for ip in inner {
                        self.part_subs(sc, ip);
                    }
                    match plain.then(|| self.resolve(sc, name, usize::MAX, 1)).flatten() {
                        Some(v) => text.push_str(&v),
                        None => text.push(Q_PH),
                    }
                }
                Part::Sub { list, .. } | Part::ProcSub { list } => {
                    self.sub_list(sc, list);
                    text.push(Q_PH);
                }
                Part::Arith { .. } => text.push(Q_PH),
            }
        }
        text
    }
}

/// The text a `$(cat <<EOF … EOF)` prints when its here-doc has no
/// expansions: the body without its trailing newlines.
fn literal_heredoc(sc: &Scope, list: &List) -> Option<String> {
    let [item] = list.as_slice() else { return None };
    if item.background || !item.andor.rest.is_empty() {
        return None;
    }
    let [Cmd::Simple(s)] = item.andor.first.cmds.as_slice() else { return None };
    if !s.assigns.is_empty() || s.words.len() != 1 || s.words[0].plain() != Some("cat") {
        return None;
    }
    let [r] = s.redirs.as_slice() else { return None };
    let body = &sc.heredocs.get(r.heredoc?)?.body;
    let mut text = String::new();
    for p in body {
        match p {
            Part::Lit { text: t, .. } => text.push_str(t),
            _ => return None,
        }
    }
    Some(text.trim_end_matches('\n').to_string())
}

fn home_text(ctx: &Ctx) -> Option<String> {
    ctx.home.as_ref().map(|h| h.to_string_lossy().into_owned())
}

/// A quoted parameter expansion that can still become several words:
/// `$@` in any form, an `[@]` subscript, a `${!prefix@}`, a zsh flag
/// (`${(@)a}`, `${(f)x}`), or zsh's `$a[@]` (`next_at`).
fn may_be_words(name: &str, plain: bool, inner: &[Part], next_at: bool) -> bool {
    let inner_at = inner.iter().any(|p| matches!(p, Part::Lit { text, .. } if text.contains('@')));
    name == "@" || next_at || (!plain && (name.is_empty() || inner_at))
}

/// An expansion's value: quoted, it is literal text; unquoted, a value that
/// could split or glob is a placeholder.
fn push_value(atoms: &mut Vec<(char, bool)>, v: &str, quoted: bool) {
    let unsafe_ = |c: char| c.is_whitespace() || "*?[]{}$`'\"\\;&|<>()!#~".contains(c);
    if !quoted && v.chars().any(unsafe_) {
        atoms.push((U_PH, false));
    } else {
        atoms.extend(v.chars().map(|c| if is_ph(c) { (if quoted { Q_PH } else { U_PH }, false) } else { (c, false) }));
    }
}

/// Bash's brace expansion of unquoted `{a,b}` (nested too). Stops at 256 words.
fn brace_expand(atoms: Vec<(char, bool)>, out: &mut Vec<Vec<(char, bool)>>, budget: &mut usize) {
    if *budget == 0 {
        return;
    }
    let n = atoms.len();
    let mut open = 0;
    while open < n {
        if atoms[open] == ('{', true) {
            let mut depth = 0;
            let mut commas = Vec::new();
            let mut close = None;
            for (k, &(c, u)) in atoms.iter().enumerate().skip(open) {
                if !u {
                    continue;
                }
                match c {
                    '{' => depth += 1,
                    '}' => {
                        depth -= 1;
                        if depth == 0 {
                            close = Some(k);
                            break;
                        }
                    }
                    ',' if depth == 1 => commas.push(k),
                    _ => {}
                }
            }
            if let (Some(close), false) = (close, commas.is_empty()) {
                let mut bounds = vec![open];
                bounds.extend(&commas);
                bounds.push(close);
                for pair in bounds.windows(2) {
                    let mut next: Vec<(char, bool)> = atoms[..open].to_vec();
                    next.extend_from_slice(&atoms[pair[0] + 1..pair[1]]);
                    next.extend_from_slice(&atoms[close + 1..]);
                    brace_expand(next, out, budget);
                    if *budget == 0 {
                        return;
                    }
                }
                return;
            }
        }
        open += 1;
    }
    out.push(atoms);
    *budget -= 1;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_words_keeps_quoting() {
        let t: Vec<String> = split_words("gh 'repo  delete' \"o/r\" a\\ b;c").into_iter().map(|w| w.text).collect();
        assert_eq!(t, ["gh", "repo  delete", "o/r", "a b", "c"]);
    }
}

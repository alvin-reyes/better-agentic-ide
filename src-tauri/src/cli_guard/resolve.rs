//! Words: quote removal, brace expansion and `~`; and the pre-pass over a
//! parsed text.
//!
//! The guard never works out what an expansion holds (ADR 0011 amendment
//! 5): each one becomes a placeholder character in the word's text,
//! [`Q_PH`] where it can't split into several words (it was double-quoted),
//! [`U_PH`] where it can. A word holding either is computed. Text with
//! placeholders can be parsed again as a template (`bash -c "…"`): there
//! each placeholder is a computed word, and its quoting in the inner text
//! decides whether it can split. The one exception is `"$ADE_HOOK_BIN"` as
//! a command word ([`Guard::hook_bin`]).
//!
//! The pre-pass records the names a text may assign (for that exception
//! and `for ((…))`), the functions it defines and calls, and flags each
//! construct that remaps a command name or runs code taken from data.

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

/// What the guard knows while it walks one parsed text.
pub struct Scope<'s> {
    /// Fail-closed triggers ask (the command line, or disk text naming a guarded bin).
    pub strict: bool,
    /// The text names a guarded bin as a word.
    pub names: bool,
    /// Each name the text may assign, in a form the pre-pass reads, and how
    /// many times.
    pub assigned: HashMap<String, usize>,
    /// The text may assign names the pre-pass can't read (`eval`, a computed
    /// command name, an assignment to a computed name, …).
    pub disq: bool,
    /// The first construct that remaps a command name or runs code taken
    /// from data: [`Guard::run_text`] triggers on it.
    pub flag: Option<String>,
    /// Inside a loop's or a function's body: what runs there may run again.
    /// (A substitution runs in a subshell: nothing in it reaches the line's
    /// shell, so its own loops don't count.)
    pub repeat: usize,
    /// The counters of `for ((NAME=INT; …))` loops: each must be assigned
    /// by its loop alone ([`Guard::run_text`]).
    pub counters: Vec<String>,
    pub funcs: HashMap<String, &'s Cmd>,
    /// Literal command names used on the line (function call sites).
    pub called: HashSet<String>,
    pub cwd: PathBuf,
    pub heredocs: &'s [Heredoc],
}

impl<'s> Scope<'s> {
    pub fn new(script: &'s Script, strict: bool, names: bool, cwd: PathBuf) -> Scope<'s> {
        let mut sc = Scope { strict, names, assigned: HashMap::new(), disq: false, flag: None, repeat: 0, counters: Vec::new(), funcs: HashMap::new(), called: HashSet::new(), cwd, heredocs: &script.heredocs };
        prepass(&mut sc, &script.list);
        for h in &script.heredocs {
            prepass_parts(&mut sc, &h.body);
        }
        if let Some(n) = sc.assigned.keys().find(|n| CODE_VARS.contains(&n.as_str())) {
            sc.flag(code_var(n));
        }
        if let Some(n) = sc.assigned.keys().find(|n| remaps(n)) {
            let reason = format!("ADE: the command assigns zsh's {n}, which changes what a command name runs");
            sc.flag(reason);
        }
        sc
    }

    fn ev(&mut self, name: &str) {
        // `A[…]` assigns A.
        let base = name.split('[').next().unwrap_or(name);
        *self.assigned.entry(base.to_string()).or_default() += 1;
    }

    /// A construct the guard asks about; it may assign anything too.
    pub fn flag(&mut self, reason: String) {
        self.disq = true;
        self.flag.get_or_insert(reason);
    }

    /// An assignment target: a subscript that isn't a literal integer is
    /// evaluated as arithmetic, which runs code from data.
    fn target(&mut self, name: &str) {
        if let Some((_, sub)) = name.split_once('[') {
            if !subscript_literal(sub.strip_suffix(']').unwrap_or(sub)) {
                self.flag(format!("ADE: the subscript of {name} is evaluated as arithmetic, which can run code taken from a variable"));
            }
        }
        self.ev(name);
    }
}

/// Variables bash runs as code: `BASH_ENV` names a file it runs first, and
/// it expands the prompts' substitutions (`PS4` under `set -x`, the rest
/// when interactive).
pub const CODE_VARS: &[&str] = &["BASH_ENV", "PS0", "PS1", "PS2", "PS4", "PROMPT_COMMAND"];

/// Why a line that sets one of [`CODE_VARS`] asks.
pub fn code_var(name: &str) -> String {
    format!("ADE: the command sets {name}, which bash runs as code")
}

/// zsh's special arrays that map a command name to what it runs.
fn remaps(name: &str) -> bool {
    matches!(name, "functions" | "aliases" | "galiases" | "saliases" | "commands" | "builtins" | "functions_source") || name.starts_with("dis_")
}

/// A subscript the shell can't evaluate as code: a literal integer (zsh
/// ranges `1,4` too), `@` or `*`.
fn subscript_literal(sub: &str) -> bool {
    let t = sub.trim();
    // (An empty subscript is a bash error, not code.)
    t == "@" || t == "*" || t.bytes().all(|b| b.is_ascii_digit() || matches!(b, b'-' | b',' | b' '))
}

/// Collect every assigned name, function definition and call site, and the
/// constructs that flag or disqualify the text.
fn prepass<'s>(sc: &mut Scope<'s>, list: &'s List) {
    for item in list {
        for p in std::iter::once(&item.andor.first).chain(&item.andor.rest) {
            for c in &p.cmds {
                prepass_cmd(sc, c);
            }
        }
    }
}

fn prepass_cmd<'s>(sc: &mut Scope<'s>, c: &'s Cmd) {
    match c {
        Cmd::Simple(s) => prepass_simple(sc, s),
        Cmd::Subshell(l, r) | Cmd::Group(l, r) => {
            prepass(sc, l);
            prepass_redirs(sc, r);
        }
        Cmd::If(arms, els, r) => {
            for (a, b) in arms {
                prepass(sc, a);
                prepass(sc, b);
            }
            if let Some(e) = els {
                prepass(sc, e);
            }
            prepass_redirs(sc, r);
        }
        Cmd::Loop { cond, body, redirs } => {
            sc.repeat += 1;
            prepass(sc, cond);
            prepass(sc, body);
            sc.repeat -= 1;
            prepass_redirs(sc, redirs);
        }
        Cmd::For { body, .. } => {
            prepass_compound(sc, c);
            sc.repeat += 1;
            prepass(sc, body);
            sc.repeat -= 1;
        }
        Cmd::Case { arms, .. } => {
            prepass_compound(sc, c);
            for (_, body) in arms {
                prepass(sc, body);
            }
        }
        Cmd::Coproc(_) | Cmd::Arith { .. } | Cmd::Cond(_) => prepass_compound(sc, c),
        Cmd::Func { name, body } => {
            sc.funcs.insert(name.clone(), body);
            sc.repeat += 1;
            prepass_cmd(sc, body);
            sc.repeat -= 1;
        }
    }
}

/// A `for` or `case` without its bodies, and the compound commands that
/// hold no function to keep.
fn prepass_compound(sc: &mut Scope, c: &Cmd) {
    match c {
        Cmd::For { var, words, arith, redirs, .. } => {
            if !var.is_empty() {
                sc.ev(var);
            }
            if let Some(t) = arith {
                match for_counter(t) {
                    Some(v) => {
                        sc.ev(&v);
                        sc.counters.push(v);
                    }
                    None => sc.flag("ADE: the for loop's arithmetic reads a variable, which the shell evaluates as code".into()),
                }
            }
            for w in words.iter().flatten() {
                prepass_parts(sc, &w.parts);
            }
            prepass_redirs(sc, redirs);
        }
        Cmd::Case { word, arms, redirs } => {
            prepass_parts(sc, &word.parts);
            for (pats, _) in arms {
                for p in pats {
                    prepass_parts(sc, &p.parts);
                }
            }
            prepass_redirs(sc, redirs);
        }
        // `coproc NAME …` assigns the array NAME.
        Cmd::Coproc(b) => {
            sc.disq = true;
            prepass_owned_cmd(sc, b);
        }
        Cmd::Arith { text } => arith(sc, text),
        Cmd::Cond(words) => {
            for w in words {
                prepass_parts(sc, &w.parts);
            }
            var_tests(sc, words);
            // `[[ A -eq B ]]` evaluates both sides as arithmetic.
            for (k, w) in words.iter().enumerate() {
                if matches!(w.literal().as_deref(), Some("-eq" | "-ne" | "-lt" | "-le" | "-gt" | "-ge")) {
                    let side = |j: Option<usize>| j.and_then(|j| words.get(j)).is_some_and(int_word);
                    if !(side(k.checked_sub(1)) && side(Some(k + 1))) {
                        sc.flag("ADE: [[ … ]] compares a value that isn't a literal integer, which the shell evaluates as code".into());
                    }
                }
            }
        }
        _ => {}
    }
}

/// `-v NAME` (`[[ … ]]`, `test`, `[`): bash evaluates NAME's subscript, so
/// NAME must be literal with a literal subscript, if any.
fn var_tests(sc: &mut Scope, words: &[Word]) {
    for (k, w) in words.iter().enumerate() {
        if w.literal().as_deref() == Some("-v") {
            let safe = words.get(k + 1).and_then(Word::literal).is_some_and(|t| t.split_once('[').is_none_or(|(_, sub)| subscript_literal(sub.strip_suffix(']').unwrap_or(sub))));
            if !safe {
                sc.flag("ADE: -v tests a variable whose name or subscript isn't literal, which the shell evaluates as code".into());
            }
        }
    }
}

/// A `[[ … -eq … ]]` side the shell can't evaluate as code: literal
/// integer text, or one of the shell's own integers (`$?`, `$#`, `$$`, `$!`).
fn int_word(w: &Word) -> bool {
    match w.parts.as_slice() {
        [Part::Param { name, plain: true, .. }] => matches!(name.as_str(), "?" | "#" | "$" | "!"),
        _ => w.literal().is_some_and(|t| super::lexer::arith_literal(&t)),
    }
}

/// `for ((NAME=INT; …; …))` whose every other operand is NAME or a literal
/// integer: NAME, which the loop alone may assign. None otherwise.
fn for_counter(text: &str) -> Option<String> {
    let clauses: Vec<&str> = text.split(';').collect();
    let [init, cond, step] = clauses.as_slice() else { return None };
    let (name, value) = init.split_once('=')?;
    let name = name.trim();
    // (A NAME that isn't an identifier, or no value, is a bash syntax error.)
    if !value.trim().bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let only = |t: &str| super::lexer::arith_literal(&t.replace(name, "0")) && t.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_')).all(|w| w.is_empty() || w == name || w.bytes().all(|b| b.is_ascii_digit()));
    (only(cond) && only(step)).then(|| name.to_string())
}

/// Arithmetic: operands that aren't all literal integers are evaluated
/// recursively by the shell, which runs code taken from a variable.
fn arith(sc: &mut Scope, text: &str) {
    if !super::lexer::arith_literal(text) {
        sc.flag(format!("ADE: arithmetic on a value that isn't a literal integer ({}) is evaluated as code", text.trim()));
    }
}

fn prepass_redirs(sc: &mut Scope, rs: &[super::lexer::Redir]) {
    for r in rs {
        if let Some(v) = &r.var {
            sc.ev(v);
        }
        prepass_parts(sc, &r.target.parts);
    }
}

/// Substitutions inside words run commands that can assign too; the
/// expansions that assign, evaluate or run code are flagged.
fn prepass_parts(sc: &mut Scope, parts: &[Part]) {
    for (k, p) in parts.iter().enumerate() {
        match p {
            Part::Sub { list, .. } | Part::ProcSub { list } => prepass_owned(sc, list),
            Part::Param { name, plain, inner, .. } => {
                let ident = name.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_');
                let head = match inner.first() {
                    Some(Part::Lit { text, .. }) => text.as_str(),
                    _ => "",
                };
                // zsh's `${(flags)^=~name…}`: the lexer names none of it.
                let (flags, tilde, rest) = if name.is_empty() { zsh_prefix(head) } else { (String::new(), false, head) };
                // `${x=v}`, `${x:=v}` and zsh's `${x::=v}` assign; through
                // `${!x:=v}` or a zsh flag (`${(P)x::=v}`) the name is computed.
                let op = if name.is_empty() { rest.trim_start_matches(|c: char| c.is_ascii_alphanumeric() || c == '_') } else { head };
                if op.starts_with('=') || op.starts_with(":=") || op.starts_with("::=") {
                    if ident {
                        sc.ev(name);
                    } else {
                        sc.flag("ADE: the command assigns a variable whose name is computed".into());
                    }
                }
                // zsh's flags: `e` evaluates, `%` expands prompts, `P` reads
                // the variable a value names (its subscript evaluated).
                if flags.contains(['e', '%', 'P']) {
                    sc.flag(format!("ADE: the zsh expansion flags ({flags}) run text taken from a variable"));
                }
                // zsh's `${~x}` and `$~x` glob the value: its qualifiers run code.
                if tilde {
                    sc.flag("ADE: zsh's ${~…} globs a value, whose glob qualifiers can run code".into());
                }
                // bash's `${x@P}` expands a prompt string, which runs its substitutions.
                if head.starts_with("@P") {
                    sc.flag("ADE: ${…@P} expands a variable as a prompt, which runs its command substitutions".into());
                }
                if !*plain && head.starts_with('[') {
                    subscript(sc, name, inner);
                }
                let all_lit = inner.iter().all(|p| matches!(p, Part::Lit { .. }));
                let text: String = inner.iter().map(|p| if let Part::Lit { text, .. } = p { text.as_str() } else { "" }).collect();
                // bash's `${!x}` reads the variable named in `$x`, and
                // evaluates its subscript: only `${!x@}`, `${!x*}` (names)
                // and `${!a[@]}`, `${!a[*]}` (keys) read no value.
                let names_only = matches!(inner.as_slice(), [Part::Lit { text, .. }] if matches!(text.as_str(), "@" | "*" | "[@]" | "[*]"));
                if name.len() > 1 && name.starts_with('!') && !names_only {
                    sc.flag(format!("ADE: ${{{name}}} reads a variable whose name is computed, and evaluates its subscript as code"));
                }
                // `${x:offset:length}` (`${a[@]:offset}` too) evaluates both
                // as arithmetic.
                let after = if head.starts_with('[') { text.split_once(']').map_or("", |(_, r)| r) } else { text.as_str() };
                if after.starts_with(':') && !after[1..].starts_with(['-', '=', '+', '?', ':']) {
                    if !all_lit || !after[1..].split(':').all(super::lexer::arith_literal) {
                        sc.flag(format!("ADE: the offset of ${{{name}:…}} is evaluated as arithmetic, which can run code taken from a variable"));
                    }
                }
                // zsh's `$a[…]` subscripts `$a`.
                if *plain && (ident || name.chars().all(|c| c.is_ascii_digit())) {
                    if let Some(rest @ [Part::Lit { text, .. }, ..]) = parts.get(k + 1..) {
                        if text.starts_with('[') {
                            subscript(sc, name, rest);
                        }
                    }
                }
                prepass_parts(sc, inner)
            }
            Part::Arith { text, .. } => arith(sc, text),
            Part::Lit { .. } => {}
        }
    }
}

/// zsh's prefix in `${…}` before the name: its `(flags)`, whether a `~`
/// is among the `^`, `=` and `~` that may come with them, and the rest.
fn zsh_prefix(head: &str) -> (String, bool, &str) {
    let mut flags = String::new();
    let mut tilde = false;
    let mut rest = head;
    loop {
        if let Some((f, r)) = rest.strip_prefix('(').and_then(|r| r.split_once(')')) {
            flags.push_str(f);
            rest = r;
        } else if let Some(r) = rest.strip_prefix(['^', '=', '~']) {
            tilde |= rest.starts_with('~');
            rest = r;
        } else {
            return (flags, tilde, rest);
        }
    }
}

/// A zsh option name that turns on (or, negated, off) GLOB_SUBST: then
/// every unquoted value is a glob, whose qualifiers can run code.
pub fn globsubst(o: &str) -> bool {
    o.chars().filter(|c| !matches!(c, '_' | '-')).collect::<String>().to_ascii_lowercase().contains("globsubst")
}

/// A subscript starting at `parts[0]` (`[…]`): flagged unless its text up
/// to `]` is literal and [`subscript_literal`].
fn subscript(sc: &mut Scope, name: &str, parts: &[Part]) {
    let mut text = String::new();
    for p in parts {
        let Part::Lit { text: t, .. } = p else { break };
        if let Some(e) = t.find(']') {
            text.push_str(&t[..e]);
            if subscript_literal(&text[1..]) {
                return;
            }
            break;
        }
        text.push_str(t);
    }
    sc.flag(format!("ADE: the subscript of ${name}[…] is evaluated as arithmetic, which can run code taken from a variable"));
}

/// A substitution's list: it isn't borrowed for `'s` (functions defined in
/// a substitution are not callable outside it), so only what it assigns
/// and flags counts.
fn prepass_owned(sc: &mut Scope, list: &List) {
    for item in list {
        for p in std::iter::once(&item.andor.first).chain(&item.andor.rest) {
            for c in &p.cmds {
                prepass_owned_cmd(sc, c);
            }
        }
    }
}

fn prepass_owned_cmd(sc: &mut Scope, c: &Cmd) {
    match c {
        Cmd::Simple(s) => simple_assigns(sc, s),
        Cmd::Subshell(l, r) | Cmd::Group(l, r) => {
            prepass_owned(sc, l);
            prepass_redirs(sc, r);
        }
        Cmd::If(arms, els, r) => {
            for (a, b) in arms {
                prepass_owned(sc, a);
                prepass_owned(sc, b);
            }
            if let Some(e) = els {
                prepass_owned(sc, e);
            }
            prepass_redirs(sc, r);
        }
        Cmd::Loop { cond, body, redirs } => {
            prepass_owned(sc, cond);
            prepass_owned(sc, body);
            prepass_redirs(sc, redirs);
        }
        Cmd::Func { body, .. } => prepass_owned_cmd(sc, body),
        Cmd::For { body, .. } => {
            prepass_compound(sc, c);
            prepass_owned(sc, body);
        }
        Cmd::Case { arms, .. } => {
            prepass_compound(sc, c);
            for (_, body) in arms {
                prepass_owned(sc, body);
            }
        }
        Cmd::Coproc(_) | Cmd::Arith { .. } | Cmd::Cond(_) => prepass_compound(sc, c),
    }
}

fn prepass_simple(sc: &mut Scope, s: &Simple) {
    simple_assigns(sc, s);
    if let Some(name) = s.words.first().and_then(Word::literal) {
        sc.called.insert(name);
    }
}

/// Builtins that may assign variables or run text in ways the pre-pass
/// doesn't follow: each one disqualifies the text. bash and zsh, module
/// builtins included.
const DISQUALIFY: &[&str] = &[
    "eval", "trap", "getopts", "fc", "r", "zmodload", "sched", "zle", "compgen", "zparseopts", "zstyle", "zformat",
    "zregexparse", "strftime", "sysread", "sysopen", "syserror", "zsystem", "zselect", "zsocket", "ztcp", "zpty", "zstat", "pcre_match", "pcre_compile",
    "zgetattr", "zlistattr", "wait", "stat",
];

/// Builtins that change what a command name runs: they ask.
const REMAP: &[&str] = &["alias", "unalias", "autoload", "enable", "disable", "functions"];

/// A named command, its arguments, and whether a wrapper was looked through.
type Named<'w> = Option<(String, &'w [Word], bool)>;

/// What a simple command's words run, looking through the wrappers that
/// run a builtin in this shell (`builtin`, `command`, zsh's `noglob`,
/// `nocorrect` and `-`). `Err` when the guard can't name it with
/// certainty: a computed or glob name, or a wrapper with a computed target.
/// `Ok(None)` when no command runs.
fn named_command(words: &[Word]) -> Result<Named<'_>, ()> {
    let mut k = 0;
    let mut wrapped = false;
    loop {
        let Some(w) = words.get(k) else { return Ok(None) };
        let name = certain_name(w).ok_or(())?;
        match name.as_str() {
            "builtin" | "command" | "noglob" | "nocorrect" | "-" => {
                k += 1;
                wrapped = true;
                // `command -p`, `-v`, `-V`, `--`: options, then the target.
                while let Some(o) = words.get(k) {
                    let o = certain_name(o).ok_or(())?;
                    if !o.starts_with('-') || o == "-" {
                        break;
                    }
                    k += 1;
                    if o == "--" {
                        break;
                    }
                }
            }
            _ => return Ok(Some((name, &words[k + 1..], wrapped))),
        }
    }
}

/// A word's text when it is literal and can't expand to anything else (no
/// unquoted glob or brace character).
fn certain_name(w: &Word) -> Option<String> {
    // `[` alone is the test builtin, never a glob.
    if w.plain() == Some("[") {
        return Some("[".into());
    }
    for p in &w.parts {
        if let Part::Lit { text, quoted: false } = p {
            if text.contains(['*', '?', '[', '{', '}']) {
                return None;
            }
        }
    }
    w.literal()
}

/// The names a simple command assigns, and what in it flags or
/// disqualifies the text.
///
/// A command the guard can't name with certainty disqualifies, since it may
/// be an assignment builtin. A named one is an assignment builtin, whose
/// assigned names are recorded, a builtin on [`DISQUALIFY`] or [`REMAP`],
/// or a command that can't touch the shell's variables. An argument of an
/// assignment builtin the guard can't read is a computed name: it flags.
fn simple_assigns(sc: &mut Scope, s: &Simple) {
    for a in &s.assigns {
        prepass_parts(sc, &a.value.parts);
        array(sc, &a.name, &a.array_words);
        assign(sc, a);
    }
    for (k, ws) in &s.arrays {
        let name = assignment(&s.words[*k]).map(|a| a.name).unwrap_or_default();
        array(sc, &name, ws);
    }
    for w in &s.words {
        prepass_parts(sc, &w.parts);
        // zsh's `=cmd` is the path of cmd.
        if matches!(w.parts.first(), Some(Part::Lit { text, quoted: false }) if text.strip_prefix('=').and_then(|t| t.bytes().next()).is_some_and(|b| b.is_ascii_alphanumeric() || b == b'_')) {
            sc.flag(format!("ADE: zsh expands {} to the path of a command, which the guard doesn't follow", w.literal().unwrap_or_default()));
        }
    }
    prepass_redirs(sc, &s.redirs);
    // ADE's helper, from the session, assigns nothing ([`Guard::hook_bin`]).
    if s.words.first().is_some_and(is_hook_bin) {
        return;
    }
    let (name, args, _) = match named_command(&s.words) {
        Ok(Some(n)) => n,
        Ok(None) => return,
        Err(()) => {
            sc.disq = true;
            return;
        }
    };
    if DISQUALIFY.contains(&name.as_str()) {
        sc.disq = true;
        return;
    }
    // The walk follows a sourced file (or asks), and what it assigns counts
    // from there on; in a body that may run again, a later pass would
    // see it first.
    if matches!(name.as_str(), "source" | ".") {
        sc.disq |= sc.repeat > 0;
        return;
    }
    if REMAP.contains(&name.as_str()) {
        sc.flag(format!("ADE: {name} changes what a command name runs"));
        return;
    }
    let lit = |w: &Word| w.literal();
    let computed = |sc: &mut Scope| sc.flag(format!("ADE: {name} assigns a variable whose name is computed"));
    // Every literal word that isn't an option is a name the builtin may
    // assign; a word the guard can't read is a computed name.
    let names_all = |sc: &mut Scope, args: &[Word]| {
        for w in args {
            match lit(w) {
                Some(t) if t.starts_with('-') || t.starts_with('+') => {}
                // zsh's `read NAME?prompt`.
                Some(t) => sc.target(t.split('?').next().unwrap_or("")),
                None => computed(sc),
            }
        }
    };
    match name.as_str() {
        // `exec 3>&1` only redirects; `exec CMD` is not followed.
        "exec" if !args.is_empty() => sc.disq = true,
        "export" | "readonly" | "declare" | "typeset" | "local" | "integer" | "float" | "private" => {
            if matches!(name.as_str(), "integer" | "float") {
                sc.flag(format!("ADE: {name} makes later assignments arithmetic, which can run code taken from a variable"));
            }
            for w in args {
                match (assignment(w), lit(w)) {
                    (Some(a), _) => assign(sc, &a),
                    (None, Some(t)) if t.starts_with('-') || t.starts_with('+') => {
                        // `-n` makes a reference to another name; `-i`, and
                        // zsh's `-E`/`-F`, make assignments arithmetic.
                        if t[1..].contains('n') {
                            computed(sc);
                        }
                        if t[1..].contains(['i', 'E', 'F']) {
                            sc.flag(format!("ADE: {name} {t} makes later assignments arithmetic, which can run code taken from a variable"));
                        }
                    }
                    (None, Some(t)) => sc.target(&t),
                    (None, None) => computed(sc),
                }
            }
        }
        "read" | "vared" | "getln" => {
            names_all(sc, args);
            sc.ev("REPLY");
        }
        "mapfile" | "readarray" => {
            // `-C CALLBACK` runs code for each line read.
            if args.iter().any(|w| lit(w).is_some_and(|t| t.starts_with('-') && t.contains('C'))) {
                sc.flag(format!("ADE: {name} -C runs a callback, code taken from text"));
            }
            names_all(sc, args);
            sc.ev("MAPFILE");
        }
        "unset" => names_all(sc, args),
        // `test -v NAME` and `[ -v NAME ]` evaluate NAME's subscript.
        "test" | "[" => var_tests(sc, args),
        // `printf -v NAME` (bash and zsh) and zsh's `print -v NAME`: the
        // word after any option cluster holding `v` is a name.
        "printf" | "print" => {
            let mut k = 0;
            while let Some(w) = args.get(k) {
                let Some(t) = lit(w) else {
                    computed(sc);
                    break;
                };
                if t == "--" || !t.starts_with('-') || t == "-" {
                    break;
                }
                if let Some(at) = t.find('v') {
                    // `-vNAME` or `-v NAME`.
                    if at + 1 < t.len() {
                        sc.target(&t[at + 1..]);
                    } else if let Some(n) = args.get(k + 1).and_then(lit) {
                        // (A computed NAME flags as the loop reaches it.)
                        sc.target(&n);
                    }
                } else if t.len() == 2 && "CuxXfa".contains(&t[1..]) {
                    // zsh print's options that take the next word as a value.
                    k += 1;
                }
                k += 1;
            }
        }
        // Each argument is arithmetic.
        "let" => {
            for w in args {
                match lit(w) {
                    Some(t) => arith(sc, &t),
                    None => sc.flag("ADE: let evaluates computed text as arithmetic".into()),
                }
            }
        }
        // `set -k` (`-o keyword`) puts every `NAME=VALUE` argument in the
        // command's environment, where the pre-pass doesn't look.
        // zsh's `set -o globsubst` globs every unquoted value.
        "set" => {
            for (k, w) in args.iter().enumerate() {
                let Some(t) = lit(w) else {
                    sc.flag("ADE: set takes a computed option, which may make values run as code".into());
                    break;
                };
                if !(t.starts_with('-') || t.starts_with('+')) || t == "--" || t == "-" {
                    break;
                }
                if t.starts_with('-') && t[1..].contains('k') {
                    sc.disq = true;
                }
                if t[1..].contains('o') {
                    // (A computed name flags as the loop reaches it.)
                    match args.get(k + 1).and_then(lit) {
                        None => {}
                        Some(o) if globsubst(&o) => sc.flag("ADE: zsh's globsubst makes every value a glob, whose qualifiers can run code".into()),
                        Some(o) if o == "keyword" => sc.disq = true,
                        _ => {}
                    }
                }
            }
        }
        "setopt" | "unsetopt" => {
            if args.iter().any(|w| lit(w).is_none_or(|t| globsubst(&t))) {
                sc.flag(format!("ADE: {name} may turn on globsubst, which makes every value a glob whose qualifiers can run code"));
            }
        }
        // `emulate sh` (or ksh) turns on globsubst; `-c` runs text.
        "emulate" => {
            if !args.iter().all(|w| lit(w).is_some_and(|t| matches!(t.as_str(), "zsh" | "-L" | "-R" | "-LR" | "-RL"))) {
                sc.flag("ADE: emulate may turn on globsubst or run text, which the guard doesn't follow".into());
            }
        }
        "shopt" => {
            if args.iter().any(|w| lit(w).is_some_and(|t| t == "keyword")) {
                sc.disq = true;
            }
            if args.iter().any(|w| lit(w).is_none_or(|t| t == "expand_aliases")) {
                sc.flag("ADE: shopt expand_aliases lets an alias change what a command name runs".into());
            }
        }
        // `hash -p PATH NAME` and zsh's `hash NAME=PATH` map a name to a file.
        "hash" => {
            if args.iter().any(|w| lit(w).is_none_or(|t| (t.starts_with('-') && t.contains('p')) || t.contains('='))) {
                sc.flag("ADE: hash maps a command name to another file".into());
            }
        }
        _ => {}
    }
}

/// An array's words: `[KEY]=value` evaluates KEY as arithmetic.
fn array(sc: &mut Scope, name: &str, words: &[Word]) {
    for w in words {
        prepass_parts(sc, &w.parts);
        let text: String = w.parts.iter().map(|p| if let Part::Lit { text, .. } = p { text.as_str() } else { "\0" }).collect();
        if matches!(w.parts.first(), Some(Part::Lit { quoted: false, .. })) && text.starts_with('[') && (text.contains("]=") || text.contains("]+=")) {
            subscript(sc, name, &w.parts);
        }
    }
}

/// `NAME=…`, `NAME+=…`, `NAME[…]=…` and `NAME=(…)`.
fn assign(sc: &mut Scope, a: &super::lexer::Assign) {
    match &a.subscript {
        Some(sub) => sc.target(&format!("{}[{sub}]", a.name)),
        None => sc.ev(&a.name),
    }
}

/// `$ADE_HOOK_BIN`, `${ADE_HOOK_BIN}`, quoted or not, as a whole word.
fn is_hook_bin(w: &Word) -> bool {
    matches!(w.parts.as_slice(), [Part::Param { name, plain: true, .. }] if name == "ADE_HOOK_BIN")
}

impl<'c, 'a> Guard<'c, 'a> {
    /// The session's home, for `~` and a bare `cd`, when no text parsed so
    /// far can assign HOME.
    pub fn home(&self) -> Option<String> {
        if self.disq || self.assigned.contains_key("HOME") {
            return None;
        }
        home_text(self.ctx)
    }

    /// `"$ADE_HOOK_BIN"` as a command word (story 9): the helper's absolute
    /// path from the session, when no text parsed so far can assign it.
    /// Unquoted, also only when none sets IFS and the path can't split or
    /// glob. Unset, an unquoted one vanishes (the next word runs), and a
    /// relative one is looked up on PATH: neither is the helper.
    pub fn hook_bin(&self, w: &Word) -> Option<W> {
        let [Part::Param { name, quoted, .. }] = w.parts.as_slice() else { return None };
        if !is_hook_bin(w) || self.disq || self.assigned.contains_key(name) {
            return None;
        }
        let v = (self.ctx.env)(name).filter(|v| v.starts_with('/'))?;
        if !quoted && (self.assigned.contains_key("IFS") || !plain_text(&v)) {
            return None;
        }
        Some(W { text: v, glob_at: Vec::new(), quoted: *quoted })
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

    /// Expand one word into the words it becomes. Every expansion is
    /// computed (ADR 0011 amendment 5): [`Q_PH`] when it is surely one word,
    /// else [`U_PH`].
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
                    // zsh reads `$a[…]` as a subscript of `$a`; `[@]` (or one
                    // the guard can't read) makes it several words.
                    let several = matches!(w.parts.get(k + 1), Some(Part::Lit { text, .. }) if text.starts_with('[') && text.find(']').is_none_or(|e| text[..e].contains('@')));
                    // Quoted, only a plain scalar is surely one word: any
                    // operator, nesting, `!`, `#`, subscript or zsh flag may
                    // make several (`"${1+"$@"}"`, `"${!x}"`, `"${(f)x}"`).
                    atoms.push((if *quoted && one_word(name, *plain) && !several { Q_PH } else { U_PH }, false));
                }
                Part::Sub { list, quoted } => {
                    self.sub_list(sc, list);
                    quoted_any |= quoted;
                    // `"$(cat <<'EOF' … EOF)"` is the here-doc's static text;
                    // unquoted, it may split.
                    match literal_heredoc(sc, list).filter(|_| *quoted && !self.defined.contains("cat")) {
                        Some(text) => atoms.extend(text.chars().map(|c| (c, false))),
                        None => atoms.push((if *quoted { Q_PH } else { U_PH }, false)),
                    }
                }
                Part::ProcSub { list } => {
                    self.sub_list(sc, list);
                    atoms.push((Q_PH, false));
                }
                Part::Arith { quoted, .. } => atoms.push((if *quoted { Q_PH } else { U_PH }, false)),
            }
        }
        // `~` and `~/…` at the start.
        if atoms.first() == Some(&('~', true)) && (atoms.len() == 1 || atoms[1] == ('/', true)) {
            match self.home() {
                Some(h) => drop(atoms.splice(0..1, h.chars().map(|c| (c, false)))),
                None => atoms[0] = (Q_PH, false),
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

    /// A here-doc body's text, with expansions as placeholders.
    pub fn expand_text(&mut self, sc: &mut Scope, parts: &[Part]) -> String {
        let mut text = String::new();
        for p in parts {
            match p {
                Part::Lit { text: t, .. } => text.push_str(t),
                Part::Param { inner, .. } => {
                    for ip in inner {
                        self.part_subs(sc, ip);
                    }
                    text.push(Q_PH);
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

/// The text a `"$(cat <<EOF … EOF)"` prints when its here-doc has no
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

/// Stand-ins for `$HOME`, `$GH_CONFIG_DIR` and `$XDG_CONFIG_HOME` in the
/// credential check: gh keeps `hosts.yml` under each by name, whatever its
/// value, so a word naming one is checked as if it were that folder. No
/// value is resolved.
pub const NAMED_DIRS: &[(&str, &str)] = &[("HOME", "/\u{0}$HOME"), ("GH_CONFIG_DIR", "/\u{0}$GH_CONFIG_DIR"), ("XDG_CONFIG_HOME", "/\u{0}$XDG_CONFIG_HOME")];

/// A word that expands `$HOME`, `$GH_CONFIG_DIR` or `$XDG_CONFIG_HOME`,
/// with each as its [`NAMED_DIRS`] stand-in and every other expansion
/// computed. None when it expands none of them.
pub fn cred_alt(w: &Word) -> Option<W> {
    let mut out = W::default();
    let mut named = false;
    for p in &w.parts {
        match p {
            Part::Lit { text, quoted } => {
                for c in text.chars() {
                    if !quoted && matches!(c, '*' | '?' | '[') {
                        out.glob_at.push(out.text.len());
                    }
                    out.text.push(c);
                }
            }
            Part::Param { name, plain: true, inner, .. } if inner.is_empty() && NAMED_DIRS.iter().any(|(n, _)| n == name) => {
                named = true;
                out.text.push_str(NAMED_DIRS.iter().find(|(n, _)| n == name).map(|(_, d)| *d).unwrap_or_default());
            }
            _ => out.text.push(Q_PH),
        }
    }
    named.then_some(out)
}

fn home_text(ctx: &Ctx) -> Option<String> {
    ctx.home.as_ref().map(|h| h.to_string_lossy().into_owned())
}

/// A quoted parameter expansion that is surely one word: a plain scalar,
/// `$name`, `${name}`, `$1`, `${10}`, or a special one (`$*`, `$#`, `$?`, `$-`,
/// `$$`, `$!`). `$@` and every `${…}` with an operator, `!`, `#`, a
/// subscript or a zsh flag (`plain` false) may be several.
fn one_word(name: &str, plain: bool) -> bool {
    let ident = name.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_') && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    let digits = !name.is_empty() && name.chars().all(|c| c.is_ascii_digit());
    plain && (ident || digits || matches!(name, "*" | "#" | "?" | "-" | "$" | "!"))
}

/// Text that stays one word unquoted under the default IFS and doesn't glob.
fn plain_text(v: &str) -> bool {
    !v.chars().any(|c| is_ph(c) || c.is_whitespace() || "*?[]{}$`'\"\\;&|<>()!#~".contains(c))
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

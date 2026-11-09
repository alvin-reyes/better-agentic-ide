//! The shell parser. Turns a command line, a `-c` string or a script into a
//! small syntax tree: lists, pipelines, simple commands, compound commands,
//! function definitions, words made of literal, quoted and expansion parts,
//! redirections and here-docs.
//!
//! It parses bash syntax (which covers sh, dash and most zsh one-liners).
//! Nesting is capped at [`MAX_DEPTH`](super::bounds::MAX_DEPTH): a
//! non-recursive pre-scan measures it first, and the parser counts it again
//! as it descends, so deep input can't overflow the stack.

use super::bounds::{nesting_depth, MAX_DEPTH};

#[derive(Debug, Clone, PartialEq)]
pub enum ParseError {
    Unclosed(&'static str),
    TooDeep,
    Syntax(String),
    /// A word followed straight by `(`: a zsh glob qualifier, which may
    /// run code (`*(e:…:)`, `*(+f)`), or zsh's `=(…)`, which runs its text.
    GlobQualifier,
}

type R<T> = Result<T, ParseError>;

/// One piece of a word.
#[derive(Debug, Clone)]
pub enum Part {
    /// Literal text. `quoted` is true for `'…'`, `"…"`, `$'…'` and `\x`.
    Lit { text: String, quoted: bool },
    /// `$name`, `${name}`, `$1`, `$@`… `plain` is false for `${…}` with an
    /// operator, `${#x}`, `${!x}` or `${x[…]}`; `inner` holds what the
    /// operator's text expands (its substitutions run).
    Param { name: String, plain: bool, quoted: bool, inner: Vec<Part> },
    /// `$( … )` or backticks.
    Sub { list: List, quoted: bool },
    /// `<( … )` or `>( … )`.
    ProcSub { list: List },
    /// `$(( … ))` or `$[ … ]`, with the expression's text.
    Arith { quoted: bool, text: String },
}

#[derive(Debug, Clone)]
pub struct Word {
    pub parts: Vec<Part>,
    /// Byte offset in the parsed text: orders assignments and uses.
    pub pos: usize,
}

impl Word {
    /// The word's text when it is made only of literal parts.
    pub fn literal(&self) -> Option<String> {
        let mut s = String::new();
        for p in &self.parts {
            match p {
                Part::Lit { text, .. } => s.push_str(text),
                _ => return None,
            }
        }
        Some(s)
    }
    /// The literal text of an unquoted word with no expansions, e.g. a keyword.
    pub fn plain(&self) -> Option<&str> {
        match self.parts.as_slice() {
            [Part::Lit { text, quoted: false }] => Some(text),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RedirOp {
    In,
    Out,
    Append,
    Clobber,
    InOut,
    DupIn,
    DupOut,
    OutErr,
    AppendErr,
    HereStr,
    HereDoc,
}

#[derive(Debug, Clone)]
pub struct Redir {
    pub op: RedirOp,
    /// `{NAME}>…`: the shell assigns the descriptor's number to NAME.
    pub var: Option<String>,
    pub target: Word,
    /// For a here-doc: its index in [`Script::heredocs`].
    pub heredoc: Option<usize>,
}

#[derive(Debug, Clone)]
pub struct Heredoc {
    /// The body: literal when the delimiter was quoted, else with expansions.
    pub body: Vec<Part>,
}

#[derive(Debug, Clone)]
pub struct Assign {
    pub name: String,
    /// `NAME[…]=`: the subscript's text.
    pub subscript: Option<String>,
    pub append: bool,
    pub array: bool,
    pub value: Word,
    pub array_words: Vec<Word>,
    pub pos: usize,
}

#[derive(Debug, Clone)]
pub struct Simple {
    pub assigns: Vec<Assign>,
    pub words: Vec<Word>,
    pub redirs: Vec<Redir>,
    /// `declare A=(…)`: the array's words, by the index of the `A=` word.
    pub arrays: Vec<(usize, Vec<Word>)>,
}

#[derive(Debug, Clone)]
pub enum Cmd {
    Simple(Simple),
    Subshell(List, Vec<Redir>),
    Group(List, Vec<Redir>),
    If(Vec<(List, List)>, Option<List>, Vec<Redir>),
    Loop { cond: List, body: List, redirs: Vec<Redir> },
    /// `for`/`select NAME [in WORDS]`; `words` is None without `in`.
    /// An arithmetic `for ((…))` has an empty `var` and its text in `arith`.
    For { var: String, words: Option<Vec<Word>>, body: List, select: bool, arith: Option<String>, redirs: Vec<Redir> },
    Case { word: Word, arms: Vec<(Vec<Word>, List)>, redirs: Vec<Redir> },
    Func { name: String, body: Box<Cmd> },
    Coproc(Box<Cmd>),
    /// `(( … ))`, with the expression's text.
    Arith { text: String },
    Cond(Vec<Word>),
}

#[derive(Debug, Clone)]
pub struct Pipeline {
    pub cmds: Vec<Cmd>,
}

#[derive(Debug, Clone)]
pub struct AndOr {
    pub first: Pipeline,
    pub rest: Vec<Pipeline>,
}

#[derive(Debug, Clone)]
pub struct Item {
    pub andor: AndOr,
    pub background: bool,
}

pub type List = Vec<Item>;

#[derive(Debug, Default)]
pub struct Script {
    pub list: List,
    pub heredocs: Vec<Heredoc>,
}

/// Parse `text`, nested `depth` levels inside other text already.
pub fn parse_at(text: &str, depth: usize) -> R<Script> {
    if depth + nesting_depth(text.as_bytes()) > MAX_DEPTH {
        return Err(ParseError::TooDeep);
    }
    let mut p = Parser { src: text.as_bytes().to_vec(), i: 0, base: 0, depth, heredocs: Vec::new(), pending: Vec::new() };
    let list = p.parse_list(&[], false)?;
    p.skip_ws_nl()?;
    if p.i < p.src.len() {
        return Err(ParseError::Syntax(format!("unexpected {:?}", p.src[p.i] as char)));
    }
    if !p.pending.is_empty() {
        return Err(ParseError::Unclosed("here-doc"));
    }
    Ok(Script { list, heredocs: p.heredocs })
}

pub fn parse(text: &str) -> R<Script> {
    parse_at(text, 0)
}

const RESERVED: &[&str] =
    &["if", "then", "elif", "else", "fi", "for", "in", "do", "done", "while", "until", "case", "esac", "select", "function", "coproc", "time", "!", "{", "}", "[[", "]]"];

fn is_meta(b: u8) -> bool {
    matches!(b, b' ' | b'\t' | b'\n' | b';' | b'&' | b'|' | b'(' | b')' | b'<' | b'>')
}

fn is_name_start(b: u8) -> bool {
    b.is_ascii_alphabetic() || b == b'_'
}

fn is_name(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

fn utf8_len(b: u8) -> usize {
    match b {
        0xF0..=0xFF => 4,
        0xE0..=0xEF => 3,
        0xC0..=0xDF => 2,
        _ => 1,
    }
}

struct Pending {
    id: usize,
    delim: Vec<u8>,
    strip: bool,
    quoted: bool,
}

struct Parser {
    src: Vec<u8>,
    i: usize,
    base: usize,
    depth: usize,
    heredocs: Vec<Heredoc>,
    pending: Vec<Pending>,
}

/// Collects a word's parts, merging runs of literal bytes.
struct Parts {
    parts: Vec<Part>,
    buf: Vec<u8>,
    quoted: bool,
}

impl Parts {
    fn new() -> Self {
        Parts { parts: Vec::new(), buf: Vec::new(), quoted: false }
    }
    fn push(&mut self, bytes: &[u8], quoted: bool) {
        if quoted != self.quoted {
            self.flush();
            self.quoted = quoted;
        }
        self.buf.extend_from_slice(bytes);
    }
    fn flush(&mut self) {
        if !self.buf.is_empty() {
            let text = String::from_utf8_lossy(&self.buf).into_owned();
            self.parts.push(Part::Lit { text, quoted: self.quoted });
            self.buf.clear();
        }
    }
    fn part(&mut self, p: Part) {
        self.flush();
        self.parts.push(p);
    }
    fn done(mut self) -> Vec<Part> {
        self.flush();
        self.parts
    }
}

impl Parser {
    fn peek(&self) -> Option<u8> {
        self.src.get(self.i).copied()
    }
    fn at(&self, k: usize) -> Option<u8> {
        self.src.get(self.i + k).copied()
    }
    fn starts(&self, s: &[u8]) -> bool {
        self.src[self.i.min(self.src.len())..].starts_with(s)
    }
    fn pos(&self) -> usize {
        self.base + self.i
    }
    fn enter(&mut self) -> R<()> {
        self.depth += 1;
        if self.depth > MAX_DEPTH {
            return Err(ParseError::TooDeep);
        }
        Ok(())
    }
    fn leave(&mut self) {
        self.depth -= 1;
    }

    /// Blanks, line continuations and comments.
    fn skip_blanks(&mut self) {
        loop {
            match self.peek() {
                Some(b' ' | b'\t' | b'\r') => self.i += 1,
                Some(b'\\') if self.at(1) == Some(b'\n') => self.i += 2,
                Some(b'#') => {
                    while let Some(b) = self.peek() {
                        if b == b'\n' {
                            break;
                        }
                        self.i += 1;
                    }
                }
                _ => break,
            }
        }
    }

    fn take_newline(&mut self) -> R<bool> {
        if self.peek() != Some(b'\n') {
            return Ok(false);
        }
        self.i += 1;
        self.read_heredocs()?;
        Ok(true)
    }

    fn skip_ws_nl(&mut self) -> R<()> {
        loop {
            self.skip_blanks();
            if !self.take_newline()? {
                return Ok(());
            }
        }
    }

    /// The reserved word at the cursor, if the next word is one.
    fn reserved(&self) -> Option<&'static str> {
        let s = &self.src[self.i.min(self.src.len())..];
        let n = s.iter().take_while(|&&b| !is_meta(b) && !matches!(b, b'\'' | b'"' | b'\\' | b'$' | b'`')).count();
        if n == 0 || s.get(n).is_some_and(|&b| !is_meta(b)) {
            return None;
        }
        let w = &s[..n];
        RESERVED.iter().copied().find(|r| r.as_bytes() == w)
    }

    fn take_reserved(&mut self, w: &str) -> R<()> {
        self.skip_ws_nl()?;
        if self.reserved() == Some(w) {
            self.i += w.len();
            Ok(())
        } else {
            Err(ParseError::Unclosed(match w {
                "then" | "fi" => "if",
                "do" | "done" => "loop",
                "esac" | "in" => "case",
                "}" => "{",
                _ => "compound command",
            }))
        }
    }

    fn read_heredocs(&mut self) -> R<()> {
        let pending = std::mem::take(&mut self.pending);
        for p in pending {
            let mut body: Vec<u8> = Vec::new();
            let start = self.pos();
            loop {
                if self.i >= self.src.len() {
                    return Err(ParseError::Unclosed("here-doc"));
                }
                let end = self.src[self.i..].iter().position(|&b| b == b'\n').map_or(self.src.len(), |k| self.i + k);
                let mut line = &self.src[self.i..end];
                if p.strip {
                    while line.first() == Some(&b'\t') {
                        line = &line[1..];
                    }
                }
                let line_end = line.strip_suffix(b"\r").unwrap_or(line);
                let done = line_end == p.delim.as_slice();
                if !done {
                    body.extend_from_slice(line);
                    body.push(b'\n');
                }
                self.i = (end + 1).min(self.src.len());
                if done {
                    break;
                }
            }
            let parts = if p.quoted {
                vec![Part::Lit { text: String::from_utf8_lossy(&body).into_owned(), quoted: true }]
            } else {
                self.with_text(body, start, |q| q.parse_dq(None))?
            };
            self.heredocs[p.id] = Heredoc { body: parts };
        }
        Ok(())
    }

    /// Parse `text` (a backtick's content or a here-doc's body) with this
    /// parser's depth and here-doc table.
    fn with_text<T>(&mut self, text: Vec<u8>, base: usize, f: impl FnOnce(&mut Self) -> R<T>) -> R<T> {
        let src = std::mem::replace(&mut self.src, text);
        let i = std::mem::replace(&mut self.i, 0);
        let b = std::mem::replace(&mut self.base, base);
        let pending = std::mem::take(&mut self.pending);
        let r = f(self);
        let left = !self.pending.is_empty();
        self.src = src;
        self.i = i;
        self.base = b;
        self.pending = pending;
        match r {
            Ok(_) if left => Err(ParseError::Unclosed("here-doc")),
            r => r,
        }
    }

    fn parse_list(&mut self, stop: &[&str], paren: bool) -> R<List> {
        let mut list = Vec::new();
        loop {
            self.skip_ws_nl()?;
            match self.peek() {
                None => break,
                Some(b')') if paren => break,
                _ => {}
            }
            if self.starts(b";;") || self.starts(b";&") {
                break;
            }
            if let Some(r) = self.reserved() {
                if stop.contains(&r) {
                    break;
                }
            }
            let andor = self.parse_andor()?;
            self.skip_blanks();
            let mut background = false;
            match self.peek() {
                Some(b'&') if !matches!(self.at(1), Some(b'&' | b'>')) => {
                    self.i += 1;
                    background = true;
                }
                Some(b';') if !matches!(self.at(1), Some(b';' | b'&')) => self.i += 1,
                None | Some(b'\n' | b';' | b')') => {}
                _ if self.reserved().is_some_and(|r| stop.contains(&r)) => {}
                Some(c) => return Err(ParseError::Syntax(format!("unexpected {:?}", c as char))),
            }
            list.push(Item { andor, background });
        }
        Ok(list)
    }

    fn parse_andor(&mut self) -> R<AndOr> {
        let first = self.parse_pipeline()?;
        let mut rest = Vec::new();
        loop {
            self.skip_blanks();
            if !(self.starts(b"&&") || self.starts(b"||")) {
                break;
            }
            self.i += 2;
            self.skip_ws_nl()?;
            rest.push(self.parse_pipeline()?);
        }
        Ok(AndOr { first, rest })
    }

    fn parse_pipeline(&mut self) -> R<Pipeline> {
        loop {
            self.skip_blanks();
            match self.reserved() {
                Some("!") => self.i += 1,
                Some("time") => {
                    self.i += 4;
                    self.skip_blanks();
                    if self.starts(b"-p") && self.at(2).map_or(true, is_meta) {
                        self.i += 2;
                    }
                }
                _ => break,
            }
        }
        let mut cmds = vec![self.parse_command()?];
        loop {
            self.skip_blanks();
            if self.peek() == Some(b'|') && self.at(1) != Some(b'|') {
                self.i += if self.at(1) == Some(b'&') { 2 } else { 1 };
                self.skip_ws_nl()?;
                cmds.push(self.parse_command()?);
            } else {
                break;
            }
        }
        Ok(Pipeline { cmds })
    }

    fn parse_command(&mut self) -> R<Cmd> {
        self.skip_blanks();
        if let Some(r) = self.reserved() {
            match r {
                "if" => return self.parse_if(),
                "while" | "until" => return self.parse_while(r.len()),
                "for" | "select" => return self.parse_for(r == "select"),
                "case" => return self.parse_case(),
                "function" => return self.parse_function(),
                "coproc" => return self.parse_coproc(),
                "{" => {
                    self.i += 1;
                    self.enter()?;
                    let list = self.parse_list(&["}"], false)?;
                    self.take_reserved("}")?;
                    self.leave();
                    let redirs = self.trailing_redirs()?;
                    return Ok(Cmd::Group(list, redirs));
                }
                "[[" => return self.parse_cond(),
                "]]" | "!" | "time" | "in" => {}
                other => return Err(ParseError::Syntax(format!("unexpected {other}"))),
            }
        }
        if self.peek() == Some(b'(') {
            if self.at(1) == Some(b'(') {
                if let Some(end) = self.arith_end(self.i + 2) {
                    let text = String::from_utf8_lossy(&self.src[self.i + 2..end]).into_owned();
                    self.i = end + 2;
                    let _ = self.trailing_redirs()?;
                    return Ok(Cmd::Arith { text });
                }
            }
            self.i += 1;
            self.enter()?;
            let list = self.parse_list(&[], true)?;
            self.skip_ws_nl()?;
            if self.peek() != Some(b')') {
                return Err(ParseError::Unclosed("("));
            }
            self.i += 1;
            self.leave();
            let redirs = self.trailing_redirs()?;
            return Ok(Cmd::Subshell(list, redirs));
        }
        self.parse_simple()
    }

    /// Where `(( … ))` or `$(( … ))` ends: the index of its `))`.
    fn arith_end(&self, from: usize) -> Option<usize> {
        let mut depth = 0usize;
        let mut k = from;
        while k < self.src.len() {
            match self.src[k] {
                b'(' => depth += 1,
                b')' if depth > 0 => depth -= 1,
                b')' => return (self.src.get(k + 1) == Some(&b')')).then_some(k),
                b'\n' if depth == 0 => {}
                _ => {}
            }
            k += 1;
        }
        None
    }

    fn trailing_redirs(&mut self) -> R<Vec<Redir>> {
        let mut v = Vec::new();
        loop {
            self.skip_blanks();
            match self.try_redir()? {
                Some(r) => v.push(r),
                None => return Ok(v),
            }
        }
    }

    fn parse_if(&mut self) -> R<Cmd> {
        self.i += 2;
        self.enter()?;
        let mut arms = Vec::new();
        let mut els = None;
        let cond = self.parse_list(&["then"], false)?;
        self.take_reserved("then")?;
        let body = self.parse_list(&["elif", "else", "fi"], false)?;
        arms.push((cond, body));
        loop {
            self.skip_ws_nl()?;
            match self.reserved() {
                Some("elif") => {
                    self.i += 4;
                    let cond = self.parse_list(&["then"], false)?;
                    self.take_reserved("then")?;
                    let body = self.parse_list(&["elif", "else", "fi"], false)?;
                    arms.push((cond, body));
                }
                Some("else") => {
                    self.i += 4;
                    els = Some(self.parse_list(&["fi"], false)?);
                }
                Some("fi") => {
                    self.i += 2;
                    break;
                }
                _ => return Err(ParseError::Unclosed("if")),
            }
        }
        self.leave();
        let redirs = self.trailing_redirs()?;
        Ok(Cmd::If(arms, els, redirs))
    }

    fn parse_while(&mut self, kw: usize) -> R<Cmd> {
        self.i += kw;
        self.enter()?;
        let cond = self.parse_list(&["do"], false)?;
        let body = self.parse_do()?;
        self.leave();
        let redirs = self.trailing_redirs()?;
        Ok(Cmd::Loop { cond, body, redirs })
    }

    /// `do LIST done`, or a `{ LIST; }` body.
    fn parse_do(&mut self) -> R<List> {
        self.skip_ws_nl()?;
        if self.reserved() == Some("{") {
            self.i += 1;
            let body = self.parse_list(&["}"], false)?;
            self.take_reserved("}")?;
            return Ok(body);
        }
        self.take_reserved("do")?;
        let body = self.parse_list(&["done"], false)?;
        self.take_reserved("done")?;
        Ok(body)
    }

    fn parse_for(&mut self, select: bool) -> R<Cmd> {
        self.i += if select { 6 } else { 3 };
        self.enter()?;
        self.skip_blanks();
        let mut var = String::new();
        let mut words = None;
        let mut arith = None;
        if self.starts(b"((") {
            let end = self.arith_end(self.i + 2).ok_or(ParseError::Unclosed("(("))?;
            arith = Some(String::from_utf8_lossy(&self.src[self.i + 2..end]).into_owned());
            self.i = end + 2;
        } else {
            let w = self.read_word()?.ok_or_else(|| ParseError::Syntax("for without a name".into()))?;
            var = w.literal().unwrap_or_default();
            self.skip_ws_nl()?;
            if self.reserved() == Some("in") {
                self.i += 2;
                let mut ws = Vec::new();
                loop {
                    self.skip_blanks();
                    match self.peek() {
                        None | Some(b';' | b'\n') => break,
                        _ => ws.push(self.read_word()?.ok_or_else(|| ParseError::Syntax("bad word in for".into()))?),
                    }
                }
                words = Some(ws);
            }
        }
        self.skip_blanks();
        if self.peek() == Some(b';') {
            self.i += 1;
        }
        let body = self.parse_do()?;
        self.leave();
        let redirs = self.trailing_redirs()?;
        Ok(Cmd::For { var, words, body, select, arith, redirs })
    }

    fn parse_case(&mut self) -> R<Cmd> {
        self.i += 4;
        self.enter()?;
        self.skip_blanks();
        let word = self.read_word()?.ok_or(ParseError::Unclosed("case"))?;
        self.take_reserved("in")?;
        let mut arms = Vec::new();
        loop {
            self.skip_ws_nl()?;
            if self.reserved() == Some("esac") {
                self.i += 4;
                break;
            }
            if self.peek().is_none() {
                return Err(ParseError::Unclosed("case"));
            }
            if self.peek() == Some(b'(') {
                self.i += 1;
            }
            let mut pats = Vec::new();
            loop {
                self.skip_blanks();
                if let Some(w) = self.read_word()? {
                    pats.push(w);
                }
                self.skip_blanks();
                match self.peek() {
                    Some(b'|') => self.i += 1,
                    Some(b')') => {
                        self.i += 1;
                        break;
                    }
                    _ => return Err(ParseError::Unclosed("case")),
                }
            }
            let body = self.parse_list(&["esac"], false)?;
            self.skip_ws_nl()?;
            if self.starts(b";;&") {
                self.i += 3;
            } else if self.starts(b";;") || self.starts(b";&") {
                self.i += 2;
            }
            arms.push((pats, body));
        }
        self.leave();
        let redirs = self.trailing_redirs()?;
        Ok(Cmd::Case { word, arms, redirs })
    }

    fn parse_function(&mut self) -> R<Cmd> {
        self.i += 8;
        self.skip_blanks();
        let name = self.read_word()?.and_then(|w| w.literal()).ok_or_else(|| ParseError::Syntax("function without a name".into()))?;
        self.skip_blanks();
        if self.peek() == Some(b'(') {
            self.i += 1;
            self.skip_blanks();
            if self.peek() != Some(b')') {
                return Err(ParseError::Syntax("bad function definition".into()));
            }
            self.i += 1;
        }
        self.func_body(name)
    }

    fn func_body(&mut self, name: String) -> R<Cmd> {
        self.skip_ws_nl()?;
        self.enter()?;
        let body = self.parse_command()?;
        self.leave();
        Ok(Cmd::Func { name, body: Box::new(body) })
    }

    fn parse_coproc(&mut self) -> R<Cmd> {
        self.i += 6;
        self.skip_blanks();
        self.enter()?;
        let compound = |p: &Parser| p.reserved().is_some_and(|r| r != "!" && r != "time") || p.peek() == Some(b'(');
        let body = if compound(self) {
            self.parse_command()?
        } else {
            let save = self.i;
            let _ = self.read_word()?;
            self.skip_blanks();
            if (self.reserved() == Some("{") || self.peek() == Some(b'(')) && !self.starts(b"()") {
                self.parse_command()?
            } else {
                self.i = save;
                self.parse_simple()?
            }
        };
        self.leave();
        Ok(Cmd::Coproc(Box::new(body)))
    }

    fn parse_cond(&mut self) -> R<Cmd> {
        self.i += 2;
        let mut words = Vec::new();
        loop {
            self.skip_blanks();
            if self.peek() == Some(b'\n') {
                self.take_newline()?;
                continue;
            }
            if self.reserved() == Some("]]") {
                self.i += 2;
                break;
            }
            match self.peek() {
                None => return Err(ParseError::Unclosed("[[")),
                Some(b'&' | b'|' | b'<' | b'>' | b'(' | b')' | b'!') => {
                    let pos = self.pos();
                    let start = self.i;
                    while matches!(self.peek(), Some(b'&' | b'|' | b'<' | b'>' | b'(' | b')' | b'!')) {
                        self.i += 1;
                    }
                    let text = String::from_utf8_lossy(&self.src[start..self.i]).into_owned();
                    words.push(Word { parts: vec![Part::Lit { text, quoted: true }], pos });
                }
                Some(b';') => return Err(ParseError::Unclosed("[[")),
                _ => match self.read_word()? {
                    Some(w) => words.push(w),
                    None => return Err(ParseError::Unclosed("[[")),
                },
            }
        }
        let _ = self.trailing_redirs()?;
        Ok(Cmd::Cond(words))
    }

    fn parse_simple(&mut self) -> R<Cmd> {
        let mut s = Simple { assigns: Vec::new(), words: Vec::new(), redirs: Vec::new(), arrays: Vec::new() };
        let mut word_end = usize::MAX;
        loop {
            self.skip_blanks();
            match self.peek() {
                None | Some(b'\n' | b';' | b'|' | b')') => break,
                Some(b'&') if !self.starts(b"&>") => break,
                _ => {}
            }
            if !(self.starts(b"<(") || self.starts(b">(")) {
                if let Some(r) = self.try_redir()? {
                    s.redirs.push(r);
                    continue;
                }
            }
            if self.peek() == Some(b'(') {
                // `local a=(…)`: an array argument.
                if self.i == word_end && s.words.last().and_then(assignment).is_some_and(|a| a.value.parts.is_empty()) {
                    self.i += 1;
                    let words = self.array_words()?;
                    s.arrays.push((s.words.len() - 1, words));
                    continue;
                }
                // Any other `word(…)` with no blank between: a zsh glob
                // qualifier or `=(…)` (`f()` is a function).
                if self.i == word_end && self.at(1) != Some(b')') {
                    return Err(ParseError::GlobQualifier);
                }
                if s.words.len() == 1 && s.assigns.is_empty() && s.redirs.is_empty() {
                    self.i += 1;
                    self.skip_blanks();
                    if self.peek() != Some(b')') {
                        return Err(ParseError::Syntax("bad function definition".into()));
                    }
                    self.i += 1;
                    let name = s.words[0].literal().ok_or_else(|| ParseError::Syntax("computed function name".into()))?;
                    return self.func_body(name);
                }
                return Err(ParseError::Syntax("unexpected (".into()));
            }
            let w = match self.read_word()? {
                Some(w) => w,
                None => return Err(ParseError::Syntax(format!("unexpected {:?}", self.peek().map(|b| b as char)))),
            };
            if s.words.is_empty() {
                if let Some(mut a) = assignment(&w) {
                    if a.value.parts.is_empty() && self.peek() == Some(b'(') {
                        self.i += 1;
                        a.array = true;
                        a.array_words = self.array_words()?;
                    }
                    s.assigns.push(a);
                    continue;
                }
            }
            s.words.push(w);
            word_end = self.i;
        }
        if s.words.is_empty() && s.assigns.is_empty() && s.redirs.is_empty() {
            return Err(ParseError::Syntax(format!("empty command at {:?}", self.peek().map(|b| b as char))));
        }
        Ok(Cmd::Simple(s))
    }

    /// An array's words, after its `(`, through the closing `)`.
    fn array_words(&mut self) -> R<Vec<Word>> {
        let mut words = Vec::new();
        loop {
            self.skip_ws_nl()?;
            match self.peek() {
                Some(b')') => {
                    self.i += 1;
                    return Ok(words);
                }
                None => return Err(ParseError::Unclosed("(")),
                _ => match self.read_word()? {
                    Some(w) => words.push(w),
                    None => return Err(ParseError::Syntax("bad array".into())),
                },
            }
        }
    }

    fn try_redir(&mut self) -> R<Option<Redir>> {
        let mut j = self.i;
        let mut var = None;
        if self.peek() == Some(b'{') && self.at(1).is_some_and(is_name_start) {
            let mut e = self.i + 1;
            while self.src.get(e).is_some_and(|&b| is_name(b)) {
                e += 1;
            }
            if self.src.get(e) == Some(&b'}') && matches!(self.src.get(e + 1), Some(b'<' | b'>')) {
                var = Some(String::from_utf8_lossy(&self.src[self.i + 1..e]).into_owned());
                j = e + 1;
            }
        }
        while self.src.get(j).is_some_and(u8::is_ascii_digit) {
            j += 1;
        }
        let has_fd = j > self.i;
        if has_fd && !matches!(self.src.get(j), Some(b'<' | b'>')) {
            return Ok(None);
        }
        let rest = &self.src[j..];
        let (op, len, strip) = if rest.starts_with(b"<<<") {
            (RedirOp::HereStr, 3, false)
        } else if rest.starts_with(b"<<-") {
            (RedirOp::HereDoc, 3, true)
        } else if rest.starts_with(b"<<") {
            (RedirOp::HereDoc, 2, false)
        } else if rest.starts_with(b"<&") {
            (RedirOp::DupIn, 2, false)
        } else if rest.starts_with(b"<>") {
            (RedirOp::InOut, 2, false)
        } else if rest.starts_with(b"<(") {
            return Ok(None);
        } else if rest.starts_with(b"<") {
            (RedirOp::In, 1, false)
        } else if rest.starts_with(b">>") {
            (RedirOp::Append, 2, false)
        } else if rest.starts_with(b">&") {
            (RedirOp::DupOut, 2, false)
        } else if rest.starts_with(b">|") {
            (RedirOp::Clobber, 2, false)
        } else if rest.starts_with(b">(") {
            return Ok(None);
        } else if rest.starts_with(b">") {
            (RedirOp::Out, 1, false)
        } else if !has_fd && rest.starts_with(b"&>>") {
            (RedirOp::AppendErr, 3, false)
        } else if !has_fd && rest.starts_with(b"&>") {
            (RedirOp::OutErr, 2, false)
        } else {
            return Ok(None);
        };
        self.i = j + len;
        self.skip_blanks();
        let target = self.read_word()?.ok_or_else(|| ParseError::Syntax("a redirection with no target".into()))?;
        let mut heredoc = None;
        if op == RedirOp::HereDoc {
            let mut delim = String::new();
            let mut quoted = false;
            for p in &target.parts {
                if let Part::Lit { text, quoted: q } = p {
                    delim.push_str(text);
                    quoted |= *q;
                } else {
                    return Err(ParseError::Syntax("a computed here-doc delimiter".into()));
                }
            }
            let id = self.heredocs.len();
            self.heredocs.push(Heredoc { body: Vec::new() });
            self.pending.push(Pending { id, delim: delim.into_bytes(), strip, quoted });
            heredoc = Some(id);
        }
        Ok(Some(Redir { op, var, target, heredoc }))
    }

    fn read_word(&mut self) -> R<Option<Word>> {
        let pos = self.pos();
        let mut ps = Parts::new();
        let mut any = false;
        loop {
            let Some(b) = self.peek() else { break };
            match b {
                b'<' | b'>' if self.at(1) == Some(b'(') && !any => {
                    self.i += 2;
                    self.enter()?;
                    let list = self.parse_list(&[], true)?;
                    self.skip_ws_nl()?;
                    if self.peek() != Some(b')') {
                        return Err(ParseError::Unclosed("<("));
                    }
                    self.i += 1;
                    self.leave();
                    ps.part(Part::ProcSub { list });
                }
                _ if is_meta(b) => break,
                b'\'' => {
                    self.i += 1;
                    let start = self.i;
                    let end = self.src[start..].iter().position(|&c| c == b'\'').ok_or(ParseError::Unclosed("'"))? + start;
                    let bytes = self.src[start..end].to_vec();
                    ps.push(&bytes, true);
                    if bytes.is_empty() {
                        ps.part(Part::Lit { text: String::new(), quoted: true });
                    }
                    self.i = end + 1;
                }
                b'"' => {
                    self.i += 1;
                    let parts = self.parse_dq(Some(b'"'))?;
                    ps.flush();
                    ps.parts.extend(parts);
                }
                b'\\' => match self.at(1) {
                    Some(b'\n') => self.i += 2,
                    Some(c) => {
                        let n = utf8_len(c);
                        let bytes = self.src[self.i + 1..(self.i + 1 + n).min(self.src.len())].to_vec();
                        ps.push(&bytes, true);
                        self.i += 1 + n;
                    }
                    None => {
                        ps.push(b"\\", false);
                        self.i += 1;
                    }
                },
                b'$' => {
                    if !self.parse_dollar(false, &mut ps)? {
                        ps.push(b"$", false);
                        self.i += 1;
                    }
                }
                b'`' => {
                    let p = self.backtick(false)?;
                    ps.part(p);
                }
                _ => {
                    ps.push(&[b], false);
                    self.i += 1;
                }
            }
            any = true;
        }
        let parts = ps.done();
        Ok((!parts.is_empty() || any).then_some(Word { parts, pos }))
    }

    /// The inside of `"…"` up to `term`; or a here-doc body when `term` is None.
    fn parse_dq(&mut self, term: Option<u8>) -> R<Vec<Part>> {
        let mut ps = Parts::new();
        loop {
            match self.peek() {
                None if term.is_some() => return Err(ParseError::Unclosed("\"")),
                None => break,
                Some(c) if Some(c) == term => {
                    self.i += 1;
                    break;
                }
                Some(b'\\') => match self.at(1) {
                    Some(c @ (b'$' | b'`' | b'\\')) => {
                        ps.push(&[c], true);
                        self.i += 2;
                    }
                    Some(b'"') if term.is_some() => {
                        ps.push(b"\"", true);
                        self.i += 2;
                    }
                    Some(b'\n') => self.i += 2,
                    _ => {
                        ps.push(b"\\", true);
                        self.i += 1;
                    }
                },
                Some(b'$') => {
                    if !self.parse_dollar(true, &mut ps)? {
                        ps.push(b"$", true);
                        self.i += 1;
                    }
                }
                Some(b'`') => {
                    let p = self.backtick(true)?;
                    ps.part(p);
                }
                Some(c) => {
                    ps.push(&[c], true);
                    self.i += 1;
                }
            }
        }
        let mut parts = ps.done();
        if parts.is_empty() {
            parts.push(Part::Lit { text: String::new(), quoted: true });
        }
        Ok(parts)
    }

    /// At a `$`: parse what it starts. False when it is a literal `$`.
    fn parse_dollar(&mut self, quoted: bool, ps: &mut Parts) -> R<bool> {
        match self.at(1) {
            Some(b'\'') if !quoted => {
                self.i += 2;
                let bytes = self.ansi_c()?;
                ps.push(&bytes, true);
                if bytes.is_empty() {
                    ps.part(Part::Lit { text: String::new(), quoted: true });
                }
            }
            Some(b'"') if !quoted => {
                self.i += 2;
                let parts = self.parse_dq(Some(b'"'))?;
                ps.flush();
                ps.parts.extend(parts);
            }
            Some(b'(') => {
                if self.at(2) == Some(b'(') {
                    if let Some(end) = self.arith_end(self.i + 3) {
                        let text = String::from_utf8_lossy(&self.src[self.i + 3..end]).into_owned();
                        self.i = end + 2;
                        ps.part(Part::Arith { quoted, text });
                        return Ok(true);
                    }
                }
                self.i += 2;
                self.enter()?;
                let list = self.parse_list(&[], true)?;
                self.skip_ws_nl()?;
                if self.peek() != Some(b')') {
                    return Err(ParseError::Unclosed("$("));
                }
                self.i += 1;
                self.leave();
                ps.part(Part::Sub { list, quoted });
            }
            Some(b'{') => {
                self.i += 2;
                let p = self.braced(quoted)?;
                ps.part(p);
            }
            // `$[ … ]`: arithmetic, as `$(( … ))`.
            Some(b'[') => {
                let mut depth = 0usize;
                let mut k = self.i + 2;
                loop {
                    match self.src.get(k) {
                        None => return Err(ParseError::Unclosed("$[")),
                        Some(b'[') => depth += 1,
                        Some(b']') if depth == 0 => break,
                        Some(b']') => depth -= 1,
                        _ => {}
                    }
                    k += 1;
                }
                let text = String::from_utf8_lossy(&self.src[self.i + 2..k]).into_owned();
                self.i = k + 1;
                ps.part(Part::Arith { quoted, text });
            }
            Some(c) if is_name_start(c) => {
                self.i += 1;
                let start = self.i;
                while self.peek().is_some_and(is_name) {
                    self.i += 1;
                }
                let name = String::from_utf8_lossy(&self.src[start..self.i]).into_owned();
                ps.part(Part::Param { name, plain: true, quoted, inner: Vec::new() });
            }
            Some(c) if c.is_ascii_digit() || matches!(c, b'@' | b'*' | b'#' | b'?' | b'-' | b'$' | b'!') => {
                self.i += 2;
                ps.part(Part::Param { name: (c as char).to_string(), plain: true, quoted, inner: Vec::new() });
            }
            // zsh's `$=X` (split), `$~X` (glob) and `$^X` (rc-expand), alone
            // or combined: not plain, so the value is never known text. It
            // reads as `${~X}` does: no name, the prefix and name inside.
            Some(b'=' | b'~' | b'^') => {
                let mut j = self.i + 1;
                while matches!(self.src.get(j), Some(b'=' | b'~' | b'^')) {
                    j += 1;
                }
                let Some(&c) = self.src.get(j) else { return Ok(false) };
                let end = if is_name_start(c) {
                    let mut e = j;
                    while self.src.get(e).is_some_and(|&b| is_name(b)) {
                        e += 1;
                    }
                    e
                } else if c.is_ascii_digit() || matches!(c, b'@' | b'*' | b'#' | b'?' | b'-' | b'$' | b'!') {
                    j + 1
                } else {
                    return Ok(false);
                };
                let text = String::from_utf8_lossy(&self.src[self.i + 1..end]).into_owned();
                self.i = end;
                ps.part(Part::Param { name: String::new(), plain: false, quoted, inner: vec![Part::Lit { text, quoted }] });
            }
            _ => return Ok(false),
        }
        Ok(true)
    }

    /// After `${`: a parameter, plain or with an operator.
    fn braced(&mut self, quoted: bool) -> R<Part> {
        self.enter()?;
        let mut plain = true;
        // `${!x}`: indirect, named `!x`; `${#x}`: a length.
        let bang = self.peek() == Some(b'!') && self.at(1) != Some(b'}');
        if matches!(self.peek(), Some(b'#' | b'!')) && self.at(1) != Some(b'}') {
            plain = false;
            self.i += 1;
        }
        let start = self.i;
        if self.peek().is_some_and(is_name_start) {
            while self.peek().is_some_and(is_name) {
                self.i += 1;
            }
        } else if self.peek().is_some_and(|c| c.is_ascii_digit()) {
            while self.peek().is_some_and(|c| c.is_ascii_digit()) {
                self.i += 1;
            }
        } else if self.peek().is_some_and(|c| matches!(c, b'@' | b'*' | b'#' | b'?' | b'-' | b'$' | b'!')) && !(self.peek() == Some(b'$') && matches!(self.at(1), Some(b'{' | b'('))) {
            // (zsh's `${${x}}` nests: its `$` starts an expansion, not `$$`.)
            self.i += 1;
        }
        let name = format!("{}{}", if bang { "!" } else { "" }, String::from_utf8_lossy(&self.src[start..self.i]));
        let mut inner = Vec::new();
        if self.peek() == Some(b'}') {
            self.i += 1;
        } else {
            plain = false;
            // The operator's text, up to the matching `}`.
            let mut ps = Parts::new();
            loop {
                match self.peek() {
                    None => return Err(ParseError::Unclosed("${")),
                    Some(b'}') => {
                        self.i += 1;
                        break;
                    }
                    Some(b'\'') if !quoted => {
                        self.i += 1;
                        let s = self.i;
                        let e = self.src[s..].iter().position(|&c| c == b'\'').ok_or(ParseError::Unclosed("'"))? + s;
                        let bytes = self.src[s..e].to_vec();
                        ps.push(&bytes, true);
                        self.i = e + 1;
                    }
                    Some(b'"') => {
                        self.i += 1;
                        let parts = self.parse_dq(Some(b'"'))?;
                        ps.flush();
                        ps.parts.extend(parts);
                    }
                    Some(b'\\') => {
                        let n = self.at(1).map_or(0, utf8_len);
                        let bytes = self.src[self.i + 1..(self.i + 1 + n).min(self.src.len())].to_vec();
                        ps.push(&bytes, true);
                        self.i += 1 + n.max(1);
                    }
                    Some(b'$') => {
                        if !self.parse_dollar(quoted, &mut ps)? {
                            ps.push(b"$", quoted);
                            self.i += 1;
                        }
                    }
                    Some(b'`') => {
                        let p = self.backtick(quoted)?;
                        ps.part(p);
                    }
                    Some(c) => {
                        ps.push(&[c], quoted);
                        self.i += 1;
                    }
                }
            }
            inner = ps.done();
        }
        self.leave();
        Ok(Part::Param { name, plain, quoted, inner })
    }

    fn backtick(&mut self, quoted: bool) -> R<Part> {
        self.i += 1;
        let start = self.pos();
        let mut raw = Vec::new();
        loop {
            match self.peek() {
                None => return Err(ParseError::Unclosed("`")),
                Some(b'`') => {
                    self.i += 1;
                    break;
                }
                Some(b'\\') => match self.at(1) {
                    Some(c @ (b'$' | b'`' | b'\\')) => {
                        raw.push(c);
                        self.i += 2;
                    }
                    Some(b'"') if quoted => {
                        raw.push(b'"');
                        self.i += 2;
                    }
                    _ => {
                        raw.push(b'\\');
                        self.i += 1;
                    }
                },
                Some(c) => {
                    raw.push(c);
                    self.i += 1;
                }
            }
        }
        self.enter()?;
        let list = self.with_text(raw, start, |p| {
            let l = p.parse_list(&[], false)?;
            p.skip_ws_nl()?;
            if p.i < p.src.len() {
                return Err(ParseError::Syntax("unexpected text in backticks".into()));
            }
            Ok(l)
        })?;
        self.leave();
        Ok(Part::Sub { list, quoted })
    }

    /// After `$'`: the decoded text, up to the closing quote.
    fn ansi_c(&mut self) -> R<Vec<u8>> {
        let mut out = Vec::new();
        loop {
            let Some(c) = self.peek() else { return Err(ParseError::Unclosed("$'")) };
            self.i += 1;
            match c {
                b'\'' => return Ok(out),
                b'\\' => {
                    let Some(e) = self.peek() else { return Err(ParseError::Unclosed("$'")) };
                    self.i += 1;
                    match e {
                        b'n' => out.push(b'\n'),
                        b't' => out.push(b'\t'),
                        b'r' => out.push(b'\r'),
                        b'a' => out.push(7),
                        b'b' => out.push(8),
                        b'e' | b'E' => out.push(27),
                        b'f' => out.push(12),
                        b'v' => out.push(11),
                        b'x' => {
                            let v = self.hex(2);
                            match v {
                                Some(v) => out.push(v as u8),
                                None => out.extend_from_slice(b"\\x"),
                            }
                        }
                        b'u' | b'U' => {
                            let v = self.hex(if e == b'u' { 4 } else { 8 });
                            match v.and_then(char::from_u32) {
                                Some(ch) => out.extend_from_slice(ch.to_string().as_bytes()),
                                None => out.extend_from_slice(&[b'\\', e]),
                            }
                        }
                        b'0'..=b'7' => {
                            let mut v = (e - b'0') as u32;
                            for _ in 0..2 {
                                match self.peek() {
                                    Some(d @ b'0'..=b'7') => {
                                        v = v * 8 + (d - b'0') as u32;
                                        self.i += 1;
                                    }
                                    _ => break,
                                }
                            }
                            out.push(v as u8);
                        }
                        b'c' => {
                            if let Some(x) = self.peek() {
                                self.i += 1;
                                out.push(x & 0x1f);
                            }
                        }
                        other => {
                            if !matches!(other, b'\\' | b'\'' | b'"' | b'?') {
                                out.push(b'\\');
                            }
                            out.push(other);
                        }
                    }
                }
                c => out.push(c),
            }
        }
    }

    fn hex(&mut self, max: usize) -> Option<u32> {
        let mut v = 0u32;
        let mut n = 0;
        while n < max {
            match self.peek().and_then(|c| (c as char).to_digit(16)) {
                Some(d) => {
                    v = v * 16 + d;
                    self.i += 1;
                    n += 1;
                }
                None => break,
            }
        }
        (n > 0).then_some(v)
    }
}

/// Whether an arithmetic expression's operands are all literal integers:
/// only digits, operators, parentheses and blanks, and the shell's own
/// integers `$?`, `$#`, `$$` and `$!`. A name, any other `$`, a quote or a
/// subscript is evaluated recursively by the shell: code from data.
pub fn arith_literal(s: &str) -> bool {
    let s = s.replace("$?", "0").replace("$#", "0").replace("$$", "0").replace("$!", "0");
    s.bytes().all(|b| b.is_ascii_digit() || b.is_ascii_whitespace() || b"+-*/%<>=!&|^~?:,()".contains(&b))
}

/// `NAME=…`, `NAME+=…` or `NAME[…]=…` at the start of a word.
pub fn assignment(w: &Word) -> Option<Assign> {
    let Some(Part::Lit { text, quoted: false }) = w.parts.first() else { return None };
    let b = text.as_bytes();
    if !b.first().is_some_and(|&c| is_name_start(c)) {
        return None;
    }
    let mut k = 1;
    while k < b.len() && is_name(b[k]) {
        k += 1;
    }
    let name = text[..k].to_string();
    let mut array = false;
    let mut subscript = None;
    if b.get(k) == Some(&b'[') {
        let close = text[k..].find(']')? + k;
        subscript = Some(text[k + 1..close].to_string());
        k = close + 1;
        array = true;
    }
    let append = b.get(k) == Some(&b'+');
    if append {
        k += 1;
    }
    if b.get(k) != Some(&b'=') {
        return None;
    }
    let rest = &text[k + 1..];
    let mut parts = Vec::new();
    if !rest.is_empty() {
        parts.push(Part::Lit { text: rest.to_string(), quoted: false });
    }
    parts.extend(w.parts[1..].iter().cloned());
    Some(Assign { name, subscript, append, array, value: Word { parts, pos: w.pos }, array_words: Vec::new(), pos: w.pos })
}

#[cfg(test)]
mod tests {
    use super::super::testfs::*;
    use super::super::*;
    use super::*;

    fn seen(fs: &FakeFs, cmd: &str) -> (Verdict, Vec<String>) {
        trace(cmd, &ctx(fs, &no_env))
    }

    #[test]
    fn lexes_the_shapes_agents_write() {
        let fs = FakeFs::new()
            .file("/w/env.sh", "x=g\n")
            .bytes("/usr/bin/gh", b"\x7fELF\x02\x01\x01\0".to_vec())
            .link("/w/deploy", "/usr/bin/gh");

        // Each shape is parsed and the gh command in it is found; reads give no decision.
        let found: &[(&str, &[&str])] = &[
            (
                "gh pr view 1 && gh repo view || gh issue list; gh status | cat & gh run list\ngh search repos x |& cat",
                &["gh pr view", "gh repo view", "gh issue list", "gh status", "gh run list", "gh search repos"],
            ),
            ("(gh repo view); { gh pr view 1; }", &["gh repo view", "gh pr view"]),
            ("echo $(gh repo view) `gh pr view 1` <(gh issue list)", &["gh repo view", "gh pr view", "gh issue list"]),
            ("echo \"$(gh repo view)\" \"`gh pr view 1`\"", &["gh repo view", "gh pr view"]),
            ("$'\\x67\\x68' repo view", &["gh repo view"]),
            ("$'\\u0067\\150' pr view 1", &["gh pr view"]),
            ("g\"\"h repo view", &["gh repo view"]),
            ("{gh,} repo view", &["gh repo view"]),
            ("gh repo \\\n view", &["gh repo view"]),
            ("bash <<'EOF'\ngh repo view\nEOF", &["gh repo view"]),
            ("cat <<EOF > notes.txt\nhello\nEOF\ngh pr view 1", &["gh pr view"]),
            ("for x in a b; do gh repo view; done", &["gh repo view"]),
            ("for ((i=0; i<3; i++)); do gh pr view $i; done", &["gh pr view"]),
            ("until gh pr view 1; do break; done", &["gh pr view"]),
            ("while true; do gh repo view; break; done", &["gh repo view"]),
            ("select x in a; do gh repo view; done", &["gh repo view"]),
            (
                "if gh pr view 1; then gh repo view; elif true; then gh issue list; else gh status; fi",
                &["gh pr view", "gh repo view", "gh issue list", "gh status"],
            ),
            ("case $1 in a|b) gh repo view ;; *) gh pr view 1 ;; esac", &["gh repo view", "gh pr view"]),
            ("! gh repo view", &["gh repo view"]),
            ("coproc gh repo view", &["gh repo view"]),
            ("coproc w { gh repo view; }", &["gh repo view"]),
            ("time gh repo view", &["gh repo view"]),
            ("time -p gh repo view", &["gh repo view"]),
            ("[ -x x ] && gh repo view", &["gh repo view"]),
            ("[[ -n $x && $y == a ]] && gh repo view", &["gh repo view"]),
            ("x=(a b); gh repo view 2>&1 >/dev/null </dev/null", &["gh repo view"]),
            ("echo ${x:-$(gh repo view)}", &["gh repo view"]),
            ("echo $(( 1 + 2 )) && gh repo view # gh repo delete o/r", &["gh repo view"]),
        ];
        let mut bad = Vec::new();
        for (cmd, invs) in found {
            let (v, seen) = seen(&fs, cmd);
            if v != Verdict::NoDecision || !invs.iter().all(|i| seen.iter().any(|s| s == i)) {
                bad.push(format!("{cmd:?}: {v:?}, seen {seen:?}, want {invs:?}"));
            }
        }

        // A here-doc's body that only `cat` reads is not a command.
        let (v, s) = seen(&fs, "cat <<EOF > f\ngh repo delete o/r\nEOF");
        if v != Verdict::NoDecision || !s.is_empty() {
            bad.push(format!("cat here-doc: {v:?} {s:?}"));
        }

        // Found and risky: asks through the table.
        for cmd in [
            "./deploy repo delete o/r",
            "f() { gh repo delete o/r; }",
            "$'\\x67\\x68' repo delete o/r",
        ] {
            match seen(&fs, cmd) {
                (Verdict::Ask(r), s) if r.starts_with("ADE: gh repo delete") && s.iter().any(|s| s == "gh repo delete") => {}
                other => bad.push(format!("{cmd:?}: want the table's ask, got {other:?}")),
            }
        }

        // Computed: each asks because the name can't be known, and bash would run gh for each.
        for cmd in [
            // ADR 0011 amendment 5: no expansion is resolved, a function's
            // arguments included.
            "x=g; ${x}h repo view",
            "\"$VIRTUAL_ENV/bin/gh\" repo delete o/r",
            "f() { gh \"$@\"; }; f repo view",
            "function f { gh \"$@\"; }; f pr view 1",
            "function f() { gh $1 $2; }\nf repo view",
            "printf gh | xargs -I{} {} repo view",
            "x=g; false && x=y; ${x}h repo delete o/r",
            "x=g; (x=y); ${x}h repo delete o/r",
            "x=g; f(){ x=y; }; ${x}h repo delete o/r",
            "x=g; if false; then x=y; fi; ${x}h repo delete o/r",
            "x=y; printf -v x gh; $x repo delete o/r",
            "x=y; read x <<<gh; $x repo delete o/r",
            "x=g; x+=h; $x repo delete o/r",
            "${x:-g}h repo delete o/r",
            "x=ghz; ${x%z} repo delete o/r",
            "x=y; declare -n r=x; r=g; ${x}h repo delete o/r",
            "x=y; eval x=g; ${x}h repo delete o/r",
            "x=y; source ./env.sh; ${x}h repo delete o/r",
            "n=x; x=y; printf -v \"$n\" g; ${x}h repo delete o/r",
            "x=y; set -- -g; getopts g x; ${x}h repo delete o/r",
            "x=y; select x in g; do break; done <<< 1; ${x}h repo delete o/r",
            "x=g & ${x}h repo delete o/r",
            "a=\"gh repo delete o/r #\"; $a/b",
            "\"$GH\" repo view",
            "${!x} repo view",
        ] {
            match seen(&fs, cmd) {
                (Verdict::Ask(r), _) if r.contains("computed") => {}
                other => bad.push(format!("{cmd:?}: want a computed ask, got {other:?}")),
            }
        }

        // Unclosed quotes, `$(`, backticks and here-docs are parse failures.
        for text in ["echo \"a", "echo 'a", "echo $(a", "echo `a", "cat <<EOF\nx\n", "echo $'a", "if true; then a", "echo ${x"] {
            if parse(text).is_ok() {
                bad.push(format!("{text:?} parsed"));
            }
        }
        for text in ["echo \"a\" 'b' $'c' $(d) `e` ${f}", "cat <<EOF\nx\nEOF", "cat <<-EOF\n\tx\n\tEOF\n", "a && b || c; d | e & f\n"] {
            if let Err(e) = parse(text) {
                bad.push(format!("{text:?}: {e:?}"));
            }
        }
        assert!(bad.is_empty(), "{} shapes wrong:\n{}", bad.len(), bad.join("\n"));
    }
}

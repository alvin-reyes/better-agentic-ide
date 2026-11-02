//! The guard's caps, and the fail-closed rules around them.
//!
//! - A command line over [`MAX_INPUT`] asks.
//! - Nesting deeper than [`MAX_DEPTH`] (subshells, substitutions, `-c`
//!   strings, scripts) asks. The pre-scan that measures it is iterative, so
//!   deep input can't overflow the stack.
//! - Text read from disk: files up to [`PARSE_CAP`] are parsed, files up to
//!   [`SCAN_CAP`] are scanned for guarded names, and one hook call reads at
//!   most [`BUDGET`] bytes in total.
//! - A panic inside the classifier is caught and asks.

/// The largest command line the guard parses: 256 KB.
pub const MAX_INPUT: usize = 256 * 1024;
/// The deepest nesting the guard follows.
pub const MAX_DEPTH: usize = 64;
/// Disk text up to this size is parsed.
pub const PARSE_CAP: usize = 256 * 1024;
/// Disk text up to this size is scanned for guarded names; larger asks only
/// when the line names a guarded bin.
pub const SCAN_CAP: usize = 4 * 1024 * 1024;
/// Disk text read in one hook call, across every script and sourced file.
pub const BUDGET: usize = 4 * 1024 * 1024;
/// Shell function calls followed in one hook call (each distinct call once).
pub const MAX_CALLS: usize = 2000;

/// How deeply `s` nests `( )`, `{ }`, `$( )`, `${ }` and backticks, counted
/// without recursion. Single-quoted text and comments are skipped; inside
/// double quotes only substitutions count.
pub fn nesting_depth(s: &[u8]) -> usize {
    // The open contexts: `(`, `{`, a backtick, or `"` (which doesn't count).
    let mut stack: Vec<u8> = Vec::new();
    let mut depth = 0usize;
    let mut max = 0usize;
    let mut i = 0;
    let word_start = |i: usize| i == 0 || matches!(s[i - 1], b' ' | b'\t' | b'\n' | b';' | b'&' | b'|' | b'(' | b')');
    while i < s.len() {
        let b = s[i];
        let top = stack.last().copied();
        let push = |c: u8, stack: &mut Vec<u8>, depth: &mut usize| {
            stack.push(c);
            if c != b'"' {
                *depth += 1;
            }
        };
        if top == Some(b'"') {
            match b {
                b'\\' => i += 1,
                b'"' => {
                    stack.pop();
                }
                b'$' if matches!(s.get(i + 1), Some(b'(' | b'{')) => {
                    push(s[i + 1], &mut stack, &mut depth);
                    i += 1;
                }
                b'`' => push(b'`', &mut stack, &mut depth),
                _ => {}
            }
        } else {
            match b {
                b'\\' => i += 1,
                b'\'' => {
                    let ansi = i > 0 && s[i - 1] == b'$';
                    i += 1;
                    while i < s.len() && s[i] != b'\'' {
                        if ansi && s[i] == b'\\' {
                            i += 1;
                        }
                        i += 1;
                    }
                }
                b'"' => push(b'"', &mut stack, &mut depth),
                b'#' if word_start(i) => {
                    while i < s.len() && s[i] != b'\n' {
                        i += 1;
                    }
                }
                b'(' | b'{' => push(b, &mut stack, &mut depth),
                b')' | b'}' => {
                    if top == Some(if b == b')' { b'(' } else { b'{' }) {
                        stack.pop();
                        depth -= 1;
                    }
                }
                b'`' => {
                    if top == Some(b'`') {
                        stack.pop();
                        depth -= 1;
                    } else {
                        push(b'`', &mut stack, &mut depth);
                    }
                }
                _ => {}
            }
        }
        max = max.max(depth);
        i += 1;
    }
    max
}

#[cfg(test)]
pub(crate) mod tests {
    use super::super::corpus::*;
    use super::super::testfs::*;
    use super::super::*;
    use super::*;
    use serde_json::Value;

    /// A script in `ltmain.sh`'s shape: long `case` dispatch tables, `func_`
    /// helpers, `eval` of built strings and sed scripts in single quotes.
    pub(crate) fn ltmain_shaped(size: usize) -> String {
        let mut s = String::from("#! /usr/bin/env sh\n## DO NOT EDIT - This file generated from ./build-aux/ltmain.in\n\n");
        let mut i = 0;
        while s.len() < size - 800 {
            s.push_str(&format!(
                "func_mode_{i} ()\n{{\n    $debug_cmd\n\n    for arg\n    do\n      case $arg in\n      -all-static | -static | -static-libtool-libs)\n\tcase $arg in\n\t-all-static) prefer_static_libs=yes ;;\n\t*) build_libtool_libs=no ;;\n\tesac\n\tcontinue\n\t;;\n      -L*)\n\tfunc_stripname \"-L\" '' \"$arg\"\n\tdir=$func_stripname_result\n\tfunc_append deplibs \" -L$dir\"\n\t;;\n      *.la) func_append libs \" $arg\" ;;\n      esac\n    done\n    sed_quote_subst_{i}='s|\\([`\"$\\\\]\\)|\\\\\\1|g'\n    eval \"$var_{i}=\\\"\\$$var_{i} \\$arg\\\"\"\n    test -n \"$opt_dry_run\" || {{ $opt_quiet || func_echo \"mode {i}\"; }}\n    exit_cmd=: ; $exit_cmd\n}}\n\n"
            ));
            i += 1;
        }
        while s.len() < size {
            s.push_str("#\n");
        }
        s.truncate(size);
        s
    }

    fn deep(n: usize, inner: &str) -> String {
        format!("{}{inner}{}", "echo $(".repeat(n), ")".repeat(n))
    }

    #[test]
    fn bounded_and_fail_closed() {
        let fs = FakeFs::new().file("/home/u/.config/gh/config.yml", GH_CONFIG);
        // A 1 MB command asks, whatever it holds.
        let big = format!("echo {}", "a".repeat(1024 * 1024));
        assert!(matches!(verdict(&fs, &big), Verdict::Ask(r) if r.contains("256 KB")));
        // A command at the cap is parsed.
        let at_cap = format!("echo {}", "a".repeat(MAX_INPUT - 5));
        assert_eq!(verdict(&fs, &at_cap), Verdict::NoDecision);

        // 10,000-deep `$(…)`: asks, without a stack overflow on a 256 KB stack.
        let fs2 = fs.clone();
        let deep_cmd = deep(10_000, "gh pr view 1");
        let v = std::thread::Builder::new().stack_size(256 * 1024).spawn(move || verdict(&fs2, &deep_cmd)).unwrap().join().unwrap();
        assert!(matches!(&v, Verdict::Ask(r) if r.contains("64")), "{v:?}");
        // As deep as allowed is parsed, and fits in 1 MB of stack even in a
        // debug build (the helper runs it on an 8 MB thread).
        let fs2 = fs.clone();
        let ok_cmd = deep(MAX_DEPTH - 1, "gh repo delete o/r");
        let v = std::thread::Builder::new().stack_size(1024 * 1024).spawn(move || verdict(&fs2, &ok_cmd)).unwrap().join().unwrap();
        assert!(matches!(&v, Verdict::Ask(r) if r.starts_with("ADE: gh repo delete")), "{v:?}");
        let fs2 = fs.clone();
        let ok_cmd = deep(MAX_DEPTH - 1, "gh pr view 1");
        let v = std::thread::Builder::new().stack_size(1024 * 1024).spawn(move || verdict(&fs2, &ok_cmd)).unwrap().join().unwrap();
        assert_eq!(v, Verdict::NoDecision);
        // Deep nesting through scripts: a chain of 70 sourced files asks
        // when they name gh, and gives no decision when they don't.
        let mut chain = FakeFs::new();
        let mut quiet = FakeFs::new();
        for i in 0..70 {
            chain = chain.file(&format!("/w/s/{i}.sh"), &format!(". /w/s/{}.sh\n# gh\n", i + 1));
            quiet = quiet.file(&format!("/w/s/{i}.sh"), &format!(". /w/s/{}.sh\n", i + 1));
        }
        assert!(asks(&chain, "source s/0.sh"));
        assert_eq!(verdict(&quiet, "source s/0.sh"), Verdict::NoDecision);

        // Unclosed quotes: asks only when the text names a guarded bin.
        assert!(asks(&fs, "gh repo delete \"unterminated"));
        assert_eq!(verdict(&fs, "echo \"unterminated"), Verdict::NoDecision);
        assert!(asks(&fs, "echo $(gh pr view 1"));

        // An injected panic prints `ask` and exits 0.
        let boom = FakeFs::new().panics("/w/boom");
        let input = r#"{"tool_name":"Bash","tool_input":{"command":"./boom"},"cwd":"/w"}"#;
        let mut out = Vec::new();
        let code = run(input.as_bytes(), &mut out, false, &no_env, &boom);
        assert_eq!(code, 0);
        let v: Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(v["hookSpecificOutput"]["permissionDecision"], "ask", "{v}");

        // Across every corpus the guard never prints `allow` or `updatedInput`.
        let mut all: Vec<String> = generated().into_iter().map(|(c, _)| c).collect();
        all.extend(GH_HAND.iter().map(|(c, _)| c.to_string()));
        all.extend(super::super::unwrap::tests::AC2.iter().map(|(c, _)| c.to_string()));
        assert!(all.len() > 3000);
        let mut asked = 0;
        for c in &all {
            let input = serde_json::json!({"tool_name": "Bash", "tool_input": {"command": c}, "cwd": "/w"}).to_string();
            let mut out = Vec::new();
            assert_eq!(run(input.as_bytes(), &mut out, false, &no_env, &fs), 0);
            let text = String::from_utf8(out).unwrap();
            assert!(!text.contains("updatedInput"), "{c}: {text}");
            if !text.is_empty() {
                let v: Value = serde_json::from_str(&text).unwrap();
                assert_ne!(v["hookSpecificOutput"]["permissionDecision"], "allow", "{c}");
                asked += 1;
            }
        }
        assert!(asked > 1000, "only {asked} asked");
    }

    #[test]
    fn nesting_depth_is_counted_without_recursion() {
        assert_eq!(nesting_depth(b"echo hi"), 0);
        assert_eq!(nesting_depth(b"echo $(a $(b))"), 2);
        assert_eq!(nesting_depth(b"(a; { b; })"), 2);
        assert_eq!(nesting_depth(b"echo '((((' \"(((\" # (((("), 0);
        assert_eq!(nesting_depth(b"echo \"$(a)\" `b`"), 1);
        assert_eq!(nesting_depth(deep(100_000, "x").as_bytes()), 100_000);
    }
}

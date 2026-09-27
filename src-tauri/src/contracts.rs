// Smart contract project support: find the project a terminal is in, which
// toolchain it uses (Foundry, Hardhat, Anchor), its contract sources and
// compiled artifacts, and which CLI tools are installed.
//
// Everything here only reads the filesystem or runs `<tool> --version`; the
// build, test and deploy commands themselves run in the user's terminal, where
// they can see and interrupt them.

use serde::Serialize;
use std::path::{Path, PathBuf};

const MAX_FILES: usize = 500;
const MAX_DEPTH: usize = 8;
/// Folders that hold dependencies or build output, never the user's sources.
const SKIP_DIRS: &[&str] = &["node_modules", "lib", "out", "cache", "artifacts", "typechain-types", "target", ".git", ".anchor", "broadcast"];

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Toolchain {
    /// "foundry" | "hardhat" | "anchor"
    pub kind: String,
    /// The config file that identified it.
    pub config: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourceFile {
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    /// Contract name, from the artifact's file name.
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContractsProject {
    pub root: String,
    pub toolchains: Vec<Toolchain>,
    pub sources: Vec<SourceFile>,
    /// Foundry deploy scripts (`script/*.s.sol`) or Hardhat Ignition modules.
    pub scripts: Vec<SourceFile>,
    pub artifacts: Vec<Artifact>,
}

fn detect_toolchains(dir: &Path) -> Vec<Toolchain> {
    let mut out = Vec::new();
    let mut add = |kind: &str, file: &str| {
        let p = dir.join(file);
        if p.is_file() {
            out.push(Toolchain { kind: kind.into(), config: p.to_string_lossy().into_owned() });
            true
        } else {
            false
        }
    };
    add("foundry", "foundry.toml");
    for f in ["hardhat.config.ts", "hardhat.config.js", "hardhat.config.cjs", "hardhat.config.mjs"] {
        if add("hardhat", f) {
            break;
        }
    }
    add("anchor", "Anchor.toml");
    out
}

/// The nearest folder at or above `start` that has a contract toolchain config.
pub fn find_root(start: &Path) -> Option<PathBuf> {
    let mut dir = Some(start);
    while let Some(d) = dir {
        if !detect_toolchains(d).is_empty() {
            return Some(d.to_path_buf());
        }
        dir = d.parent();
    }
    None
}

/// `src = "contracts"` style values from foundry.toml's [profile.default].
fn foundry_setting(root: &Path, key: &str) -> Option<String> {
    let text = std::fs::read_to_string(root.join("foundry.toml")).ok()?;
    let mut in_default = false;
    for line in text.lines() {
        let t = line.trim();
        if t.starts_with('[') {
            in_default = t == "[profile.default]";
            continue;
        }
        if !in_default {
            continue;
        }
        if let Some((k, v)) = t.split_once('=') {
            if k.trim() == key {
                return Some(v.trim().trim_matches(|c| c == '"' || c == '\'').to_string());
            }
        }
    }
    None
}

fn walk(dir: &Path, depth: usize, keep: &dyn Fn(&Path) -> bool, out: &mut Vec<PathBuf>) {
    if depth > MAX_DEPTH || out.len() >= MAX_FILES {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = rd.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let Ok(ft) = e.file_type() else { continue };
        let p = e.path();
        let name = e.file_name().to_string_lossy().into_owned();
        if ft.is_symlink() || name.starts_with('.') {
            continue;
        }
        if ft.is_dir() {
            if !SKIP_DIRS.contains(&name.as_str()) {
                walk(&p, depth + 1, keep, out);
            }
        } else if keep(&p) && out.len() < MAX_FILES {
            out.push(p);
        }
    }
}

fn files(root: &Path, sub: &str, keep: &dyn Fn(&Path) -> bool) -> Vec<SourceFile> {
    let mut found = Vec::new();
    walk(&root.join(sub), 0, keep, &mut found);
    found
        .into_iter()
        .map(|p| SourceFile {
            name: p.strip_prefix(root).unwrap_or(&p).to_string_lossy().replace('\\', "/"),
            path: p.to_string_lossy().into_owned(),
        })
        .collect()
}

/// "Vault.sol" for each source, matching the build output's folder names.
fn file_names(sources: &[SourceFile]) -> Vec<String> {
    sources
        .iter()
        .filter_map(|s| Path::new(&s.path).file_name().map(|n| n.to_string_lossy().into_owned()))
        .collect()
}

fn has_ext(p: &Path, ext: &str) -> bool {
    p.extension().and_then(|e| e.to_str()) == Some(ext)
}

/// Compiled artifacts with an ABI: `out/<File>.sol/<Contract>.json` (Foundry)
/// or `artifacts/contracts/<File>.sol/<Contract>.json` (Hardhat). Debug and
/// build-info files are skipped, as are test and script contracts. Only files
/// named in `own` are kept: the build output also holds every dependency's
/// contracts (forge-std, OpenZeppelin), which would bury the project's own.
fn artifacts(root: &Path, dir: &str, own: &[String]) -> Vec<Artifact> {
    let base = root.join(dir);
    let mut found = Vec::new();
    let Ok(rd) = std::fs::read_dir(&base) else { return found };
    let mut sol_dirs: Vec<_> = rd.flatten().filter(|e| e.path().is_dir()).collect();
    sol_dirs.sort_by_key(|e| e.file_name());
    for d in sol_dirs {
        let dname = d.file_name().to_string_lossy().into_owned();
        if !dname.ends_with(".sol") || dname.ends_with(".t.sol") || dname.ends_with(".s.sol") || !own.contains(&dname) {
            // Hardhat nests them one level deeper under artifacts/contracts/.
            if dname == "contracts" {
                found.extend(artifacts(root, &format!("{}/contracts", dir), own));
            }
            continue;
        }
        let Ok(inner) = std::fs::read_dir(d.path()) else { continue };
        let mut jsons: Vec<_> = inner.flatten().map(|e| e.path()).collect();
        jsons.sort();
        for p in jsons {
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            if has_ext(&p, "json") && !stem.ends_with(".dbg") && found.len() < MAX_FILES {
                found.push(Artifact { name: stem.to_string(), path: p.to_string_lossy().into_owned() });
            }
        }
    }
    found
}

pub fn scan(root: &Path) -> ContractsProject {
    let toolchains = detect_toolchains(root);
    let kinds: Vec<&str> = toolchains.iter().map(|t| t.kind.as_str()).collect();
    let sol = |p: &Path| has_ext(p, "sol") && !p.to_string_lossy().ends_with(".t.sol") && !p.to_string_lossy().ends_with(".s.sol");

    let mut sources = Vec::new();
    let mut scripts = Vec::new();
    let mut arts = Vec::new();
    if kinds.contains(&"foundry") {
        let src = foundry_setting(root, "src").unwrap_or_else(|| "src".into());
        sources.extend(files(root, &src, &sol));
        let script_dir = foundry_setting(root, "script").unwrap_or_else(|| "script".into());
        scripts.extend(files(root, &script_dir, &|p: &Path| p.to_string_lossy().ends_with(".s.sol")));
        let out = foundry_setting(root, "out").unwrap_or_else(|| "out".into());
        arts.extend(artifacts(root, &out, &file_names(&sources)));
    }
    if kinds.contains(&"hardhat") {
        for s in files(root, "contracts", &sol) {
            if !sources.iter().any(|x: &SourceFile| x.path == s.path) {
                sources.push(s);
            }
        }
        scripts.extend(files(root, "ignition/modules", &|p: &Path| has_ext(p, "ts") || has_ext(p, "js")));
        for a in artifacts(root, "artifacts", &file_names(&sources)) {
            if !arts.iter().any(|x: &Artifact| x.name == a.name) {
                arts.push(a);
            }
        }
    }
    if kinds.contains(&"anchor") {
        sources.extend(files(root, "programs", &|p: &Path| has_ext(p, "rs")));
        // Anchor's IDL is its ABI.
        let mut idls = Vec::new();
        walk(&root.join("target").join("idl"), 0, &|p: &Path| has_ext(p, "json"), &mut idls);
        arts.extend(idls.into_iter().map(|p| Artifact {
            name: p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string(),
            path: p.to_string_lossy().into_owned(),
        }));
    }

    ContractsProject {
        root: root.to_string_lossy().into_owned(),
        toolchains,
        sources,
        scripts,
        artifacts: arts,
    }
}

/// The contract project containing `path`, or None if there isn't one.
#[tauri::command(async)]
pub fn contracts_detect(path: String) -> Option<ContractsProject> {
    find_root(Path::new(&path)).map(|root| scan(&root))
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub name: String,
    pub version: Option<String>,
}

/// Installed versions of the contract CLIs. Tools are found the same way as
/// agent CLIs (common install folders, then a login shell's PATH), since an
/// app started from the Dock doesn't inherit the shell's PATH.
#[tauri::command(async)]
pub fn contracts_tools(tools: Vec<String>) -> Vec<ToolStatus> {
    tools
        .into_iter()
        .take(16)
        .map(|name| {
            let valid = !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
            let version = valid
                .then(|| crate::find_command(&name).ok())
                .flatten()
                .and_then(|bin| std::process::Command::new(bin).arg("--version").output().ok())
                .filter(|o| o.status.success())
                .map(|o| {
                    let text = String::from_utf8_lossy(&o.stdout);
                    text.lines().next().unwrap_or("").trim().to_string()
                });
            ToolStatus { name, version }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Workbench: run forge/cast in the project and return their output.
//
// The webview drives this, so the command is checked here rather than trusted:
// only the subcommands the workbench needs, nothing that broadcasts to a real
// network or touches keys, and RPC only to a node on this machine.

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExecResult {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
}

const FORGE_SUBCOMMANDS: &[&str] = &["build", "test"];
const CAST_SUBCOMMANDS: &[&str] = &["call", "send", "chain-id", "block-number", "balance", "code", "rpc"];
/// Flags that would reach real funds or real networks.
const FORBIDDEN_FLAGS: &[&str] = &[
    "--private-key", "--private-keys", "--mnemonic", "--mnemonics", "--keystore", "--keystores",
    "--account", "--accounts", "--ledger", "--trezor", "--aws", "--gcp", "--interactive", "-i",
    "--broadcast", "--fork-url", "-f", "--etherscan-api-key", "--verify",
];
/// eth_* methods the workbench may call through `cast rpc`.
const RPC_METHODS: &[&str] = &["eth_accounts", "eth_chainId", "eth_blockNumber"];

fn is_local_url(url: &str) -> bool {
    ["http://127.0.0.1:", "http://localhost:", "ws://127.0.0.1:", "ws://localhost:"]
        .iter()
        .any(|p| url.starts_with(p))
}

/// Why a command is refused, or None if it may run.
pub fn check_exec(program: &str, args: &[String]) -> Option<String> {
    let sub = args.first().map(String::as_str).unwrap_or("");
    let allowed = match program {
        "forge" => FORGE_SUBCOMMANDS,
        "cast" => CAST_SUBCOMMANDS,
        _ => return Some(format!("{program} is not allowed")),
    };
    if !allowed.contains(&sub) {
        return Some(format!("{program} {sub} is not allowed"));
    }
    for (i, a) in args.iter().enumerate() {
        let flag = a.split('=').next().unwrap_or(a);
        if FORBIDDEN_FLAGS.contains(&flag) {
            return Some(format!("{flag} is not allowed"));
        }
        if flag == "--rpc-url" || flag == "-r" {
            let url = a.split_once('=').map(|(_, v)| v.to_string()).or_else(|| args.get(i + 1).cloned()).unwrap_or_default();
            if !is_local_url(&url) {
                return Some("only a local node (127.0.0.1 or localhost) is allowed".into());
            }
        }
    }
    if program == "cast" && sub != "chain-id" {
        // Every cast call must name its node explicitly, and it must be local:
        // without --rpc-url cast falls back to ETH_RPC_URL, which could be mainnet.
        if !args.iter().any(|a| a == "--rpc-url" || a.starts_with("--rpc-url=")) {
            return Some("cast needs an explicit local --rpc-url".into());
        }
        if sub == "send" && !args.iter().any(|a| a == "--unlocked") {
            return Some("cast send must use an unlocked local account (--unlocked --from)".into());
        }
        if sub == "rpc" && !args.get(1).is_some_and(|m| RPC_METHODS.contains(&m.as_str())) {
            return Some("that RPC method is not allowed".into());
        }
    }
    if program == "cast" && sub == "chain-id" && !args.iter().any(|a| a == "--rpc-url") {
        return Some("cast needs an explicit local --rpc-url".into());
    }
    None
}

/// Run `forge` or `cast` in a contract project and capture its output.
#[tauri::command(async)]
pub fn contracts_exec(root: String, program: String, args: Vec<String>, timeout_secs: Option<u64>) -> Result<ExecResult, String> {
    let root = Path::new(&root);
    if find_root(root).as_deref() != Some(root) {
        return Err("not a contract project root".into());
    }
    if let Some(why) = check_exec(&program, &args) {
        return Err(why);
    }
    let bin = crate::find_command(&program)?;
    let mut child = std::process::Command::new(bin)
        .args(&args)
        .current_dir(root)
        .env("NO_COLOR", "1")
        .env("FOUNDRY_DISABLE_NIGHTLY_WARNING", "1")
        .env_remove("ETH_RPC_URL")
        .env_remove("ETH_FROM")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    // Read both pipes on threads so a chatty build can't fill one and stall.
    let mut out_pipe = child.stdout.take();
    let mut err_pipe = child.stderr.take();
    let out_t = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(p) = out_pipe.as_mut() { let _ = std::io::Read::read_to_string(p, &mut s); }
        s
    });
    let err_t = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(p) = err_pipe.as_mut() { let _ = std::io::Read::read_to_string(p, &mut s); }
        s
    });
    let limit = std::time::Duration::from_secs(timeout_secs.unwrap_or(300).clamp(1, 1800));
    let started = std::time::Instant::now();
    let mut timed_out = false;
    let status = loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(s) => break Some(s),
            None if started.elapsed() > limit => {
                let _ = child.kill();
                timed_out = true;
                break child.wait().ok();
            }
            None => std::thread::sleep(std::time::Duration::from_millis(50)),
        }
    };
    Ok(ExecResult {
        code: status.and_then(|s| s.code()),
        stdout: out_t.join().unwrap_or_default(),
        stderr: err_t.join().unwrap_or_default(),
        timed_out,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> PathBuf {
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let d = std::env::temp_dir().join(format!("ade-contracts-{}-{}-{}", name, std::process::id(), n));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn touch(p: PathBuf, text: &str) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    #[test]
    fn foundry_project_from_a_subfolder() {
        let root = tmp("foundry");
        touch(root.join("foundry.toml"), "[profile.default]\nsrc = \"src\"\nout = \"out\"\n");
        touch(root.join("src/Counter.sol"), "contract Counter {}");
        touch(root.join("src/tokens/Token.sol"), "contract Token {}");
        touch(root.join("test/Counter.t.sol"), "");
        touch(root.join("script/Deploy.s.sol"), "");
        touch(root.join("lib/forge-std/src/Test.sol"), "");
        touch(root.join("out/Counter.sol/Counter.json"), "{\"abi\":[]}");
        touch(root.join("out/Counter.t.sol/CounterTest.json"), "{}");
        touch(root.join("out/StdAssertions.sol/StdAssertions.json"), "{}");

        let p = contracts_detect(root.join("src/tokens").to_string_lossy().into()).unwrap();
        assert_eq!(p.root, root.to_string_lossy());
        assert_eq!(p.toolchains.iter().map(|t| t.kind.as_str()).collect::<Vec<_>>(), ["foundry"]);
        let names: Vec<_> = p.sources.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["src/Counter.sol", "src/tokens/Token.sol"]);
        assert_eq!(p.scripts.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(), ["script/Deploy.s.sol"]);
        assert_eq!(p.artifacts.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), ["Counter"]);
    }

    #[test]
    fn custom_foundry_src_folder() {
        let root = tmp("custom");
        touch(root.join("foundry.toml"), "[profile.default]\nsrc = 'contracts'\n\n[profile.ci]\nsrc = 'other'\n");
        touch(root.join("contracts/Vault.sol"), "");
        let p = scan(&root);
        assert_eq!(p.sources.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(), ["contracts/Vault.sol"]);
    }

    #[test]
    fn hardhat_and_anchor() {
        let root = tmp("hh");
        touch(root.join("hardhat.config.ts"), "");
        touch(root.join("contracts/Lock.sol"), "");
        touch(root.join("artifacts/contracts/Lock.sol/Lock.json"), "{\"abi\":[]}");
        touch(root.join("artifacts/contracts/Lock.sol/Lock.dbg.json"), "{}");
        touch(root.join("ignition/modules/Lock.ts"), "");
        let p = scan(&root);
        assert_eq!(p.toolchains[0].kind, "hardhat");
        assert_eq!(p.sources[0].name, "contracts/Lock.sol");
        assert_eq!(p.artifacts.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), ["Lock"]);
        assert_eq!(p.scripts[0].name, "ignition/modules/Lock.ts");

        let sol = tmp("anchor");
        touch(sol.join("Anchor.toml"), "");
        touch(sol.join("programs/vault/src/lib.rs"), "");
        touch(sol.join("target/idl/vault.json"), "{}");
        let p = scan(&sol);
        assert_eq!(p.toolchains[0].kind, "anchor");
        assert_eq!(p.sources[0].name, "programs/vault/src/lib.rs");
        assert_eq!(p.artifacts[0].name, "vault");
    }

    #[test]
    fn no_project_outside_one() {
        let d = tmp("none");
        assert!(contracts_detect(d.to_string_lossy().into()).is_none());
    }

    #[test]
    fn tool_names_are_validated() {
        let r = contracts_tools(vec!["forge; rm -rf ~".into(), "definitely-not-installed-xyz".into()]);
        assert!(r.iter().all(|t| t.version.is_none()));
    }

    fn v(a: &[&str]) -> Vec<String> { a.iter().map(|s| s.to_string()).collect() }

    #[test]
    fn exec_guard_allows_the_workbench_commands() {
        let local = "http://127.0.0.1:8545";
        for (prog, args) in [
            ("forge", v(&["build", "--json"])),
            ("forge", v(&["test", "--json", "--match-test", "test_X"])),
            ("cast", v(&["chain-id", "--rpc-url", local])),
            ("cast", v(&["rpc", "eth_accounts", "--rpc-url", local])),
            ("cast", v(&["call", "0xabc", "f()(uint256)", "--rpc-url", local])),
            ("cast", v(&["send", "--unlocked", "--from", "0x1", "--rpc-url", local, "--json", "0xabc", "f()"])),
            ("cast", v(&["send", "--unlocked", "--from", "0x1", "--rpc-url=http://localhost:8545", "--create", "0x60"])),
        ] {
            assert_eq!(check_exec(prog, &args), None, "{prog} {args:?}");
        }
    }

    #[test]
    fn exec_guard_blocks_keys_real_networks_and_other_commands() {
        let local = "http://127.0.0.1:8545";
        for (prog, args) in [
            ("sh", v(&["-c", "id"])),
            ("forge", v(&["script", "script/Deploy.s.sol"])),
            ("forge", v(&["create", "src/A.sol:A"])),
            ("forge", v(&["test", "--fork-url", "https://eth.llamarpc.com"])),
            ("cast", v(&["send", "--private-key", "0x01", "--rpc-url", local, "0xabc", "f()"])),
            ("cast", v(&["send", "--account", "deployer", "--rpc-url", local, "0xabc", "f()"])),
            ("cast", v(&["send", "--unlocked", "--from", "0x1", "--rpc-url", "https://mainnet.infura.io/v3/x", "0xabc", "f()"])),
            ("cast", v(&["send", "--unlocked", "--from", "0x1", "0xabc", "f()"])),
            ("cast", v(&["send", "--from", "0x1", "--rpc-url", local, "0xabc", "f()"])),
            ("cast", v(&["call", "0xabc", "f()"])),
            ("cast", v(&["rpc", "anvil_setBalance", "0x1", "0x1", "--rpc-url", local])),
            ("cast", v(&["wallet", "new"])),
        ] {
            assert!(check_exec(prog, &args).is_some(), "{prog} {args:?} was allowed");
        }
    }

    #[test]
    fn exec_needs_a_project_root() {
        let d = tmp("exec");
        assert!(contracts_exec(d.to_string_lossy().into(), "forge".into(), v(&["build"]), None).is_err());
    }
}

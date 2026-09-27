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
}

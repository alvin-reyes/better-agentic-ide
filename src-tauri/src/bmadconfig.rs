//! Where BMAD keeps things in a project, read for the switch: the v4
//! locations from `.bmad-core/core-config.yaml` and the v6 output folder from
//! the merged `_bmad` config. Ports of src/lib/bmadConfig.ts and
//! src/lib/bmadRuntime/config.ts; the fixtures in `fixtures/switch/` are read
//! by both languages' tests.

use std::collections::HashMap;
use std::path::Path;

/// A v4 project's configured locations, project-relative unless the config
/// says otherwise.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct V4Paths {
    pub qa_location: String,
    pub prd_file: String,
    pub prd_sharded_location: String,
    pub architecture_file: String,
    pub architecture_sharded_location: String,
    pub dev_story_location: String,
    /// Read here only: the frontend has no use for it.
    pub dev_debug_log: String,
}

/// The keys that name a path, for deciding whether a config said anything.
const PATH_KEYS: [&str; 8] = [
    "qaLocation", "prdFile", "prdSharded", "prdShardedLocation",
    "architectureFile", "architectureSharded", "architectureShardedLocation",
    "devStoryLocation",
];

/// `key: value` at any indentation, as `scalars` in bmadConfig.ts reads it:
/// the comment is cut after the quotes are found, since a path may hold `#`.
/// A trailing `\r` is dropped first, so a file saved on Windows reads the same.
fn scalars(yaml: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for raw in yaml.split('\n') {
        let line = raw.strip_suffix('\r').unwrap_or(raw).trim_start();
        let key_len = line
            .char_indices()
            .take_while(|&(i, c)| if i == 0 { c.is_ascii_alphabetic() || c == '_' } else { c.is_ascii_alphanumeric() || c == '_' || c == '-' })
            .count();
        // The key is ASCII, so its length in characters is its length in bytes.
        let (key, rest) = line.split_at(key_len);
        let Some(value) = rest.strip_prefix(':') else { continue };
        if key.is_empty() {
            continue;
        }
        let mut cut = value.len();
        let mut quote: Option<char> = None;
        for (i, c) in value.char_indices() {
            if let Some(q) = quote {
                if c == q {
                    quote = None;
                }
            } else if c == '"' || c == '\'' {
                quote = Some(c);
            } else if c == '#' {
                cut = i;
                break;
            }
        }
        let value = value[..cut].trim();
        let quoted = value.len() >= 2
            && (value.starts_with('"') || value.starts_with('\''))
            && value.chars().next() == value.chars().last();
        let value = if quoted { &value[1..value.len() - 1] } else { value };
        if !value.is_empty() {
            out.insert(key.to_string(), value.to_string());
        }
    }
    out
}

/// The locations a v4 project is configured with. A config that sets none of
/// the path keys supplies nothing here, so BMAD's own defaults stand.
pub(crate) fn parse_core_config(yaml: Option<&str>) -> V4Paths {
    let all = yaml.map(scalars).unwrap_or_default();
    let said_anything = PATH_KEYS.iter().any(|k| all.contains_key(*k));
    let path = |key: &str, fallback: &str| {
        all.get(key).filter(|_| said_anything).cloned().unwrap_or_else(|| fallback.to_string())
    };
    V4Paths {
        qa_location: path("qaLocation", "docs/qa"),
        prd_file: path("prdFile", "docs/prd.md"),
        prd_sharded_location: path("prdShardedLocation", "docs/prd"),
        architecture_file: path("architectureFile", "docs/architecture.md"),
        architecture_sharded_location: path("architectureShardedLocation", "docs/architecture"),
        dev_story_location: path("devStoryLocation", "docs/stories"),
        dev_debug_log: all.get("devDebugLog").cloned().unwrap_or_else(|| ".ai/debug-log.md".to_string()),
    }
}

/// Merge `over` into `base`: tables merge key by key, anything else is replaced.
fn merge(base: &mut toml::Table, over: toml::Table) {
    for (key, value) in over {
        if let toml::Value::Table(inner) = value {
            if let Some(toml::Value::Table(existing)) = base.get_mut(&key) {
                merge(existing, inner);
                continue;
            }
            base.insert(key, toml::Value::Table(inner));
        } else {
            base.insert(key, value);
        }
    }
}

/// The three layers of a v6 project's central config, in the order they apply.
const LAYERS: [&str; 3] = ["_bmad/config.toml", "_bmad/custom/config.toml", "_bmad/custom/config.user.toml"];

/// `_bmad/config.toml` <- `_bmad/custom/config.toml` <- `_bmad/custom/config.user.toml`.
/// A layer the project doesn't have is skipped; one that can't be parsed is an
/// error naming it, since guessing where the output folder is could move the
/// wrong one.
pub(crate) fn load_central_config(root: &Path) -> Result<toml::Table, String> {
    let mut merged = toml::Table::new();
    for layer in LAYERS {
        let Ok(text) = std::fs::read_to_string(root.join(layer)) else { continue };
        let table: toml::Table = toml::from_str(&text).map_err(|e| format!("{layer} can't be read: {}", e.message()))?;
        merge(&mut merged, table);
    }
    Ok(merged)
}

/// The project's output folder as configured, `{project-root}` filled in.
pub(crate) fn output_folder(root: &Path, config: &toml::Table) -> String {
    let configured = config
        .get("core")
        .and_then(|core| core.get("output_folder"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or_default();
    if configured.is_empty() {
        return "_bmad-output".to_string();
    }
    configured.replace("{project-root}", &root.to_string_lossy())
}

#[cfg(test)]
mod tests {
    use super::*;

    const YAML: &str = include_str!("fixtures/switch/core-config.yaml");
    const EXPECTED: &str = include_str!("fixtures/switch/expected.json");

    fn expected() -> serde_json::Value {
        serde_json::from_str(EXPECTED).unwrap()
    }

    fn temp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("ade-bmadconfig-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("_bmad/custom")).unwrap();
        dir
    }

    #[test]
    fn reads_the_shared_yaml_fixture_as_the_ts_reader_does() {
        let p = parse_core_config(Some(YAML));
        let want = &expected()["yaml"];
        assert_eq!(p.qa_location, want["qaLocation"]);
        assert_eq!(p.prd_file, want["prdFile"]);
        assert_eq!(p.prd_sharded_location, want["prdShardedLocation"]);
        assert_eq!(p.architecture_file, want["architectureFile"]);
        assert_eq!(p.architecture_sharded_location, want["architectureShardedLocation"]);
        assert_eq!(p.dev_story_location, want["devStoryLocation"]);
        // Rust only: the TS reader has no use for the debug log.
        assert_eq!(p.dev_debug_log, "logs/debug.md");
    }

    #[test]
    fn a_config_with_no_path_keys_means_the_defaults() {
        for yaml in [None, Some(""), Some("markdownExploder: true\nslashPrefix: BMad\n")] {
            let p = parse_core_config(yaml);
            assert_eq!(p.qa_location, "docs/qa");
            assert_eq!(p.prd_file, "docs/prd.md");
            assert_eq!(p.prd_sharded_location, "docs/prd");
            assert_eq!(p.architecture_file, "docs/architecture.md");
            assert_eq!(p.architecture_sharded_location, "docs/architecture");
            assert_eq!(p.dev_story_location, "docs/stories");
            assert_eq!(p.dev_debug_log, ".ai/debug-log.md");
        }
        // The debug log is read even when nothing else is set.
        assert_eq!(parse_core_config(Some("devDebugLog: tmp/log.md\n")).dev_debug_log, "tmp/log.md");
    }

    #[test]
    fn reads_the_vendored_config() {
        let p = parse_core_config(Some(include_str!("../resources/bmad/bmad-core/core-config.yaml")));
        assert_eq!(p.dev_story_location, "docs/stories");
        assert_eq!(p.dev_debug_log, ".ai/debug-log.md");
    }

    // The TS reader reads CRLF too; scripts/switchFixtures.test.ts holds both
    // to the same expected.json.
    #[test]
    fn reads_a_config_with_windows_line_endings() {
        let p = parse_core_config(Some("qa:\r\n  qaLocation: quality\r\ndevDebugLog: logs/debug.md\r\n"));
        assert_eq!(p.qa_location, "quality");
        assert_eq!(p.dev_debug_log, "logs/debug.md");
    }

    #[test]
    fn keeps_a_hash_inside_quotes_and_a_key_with_no_value_takes_nothing() {
        let p = parse_core_config(Some("prd:\n  prdFile: \"docs/a#b/prd.md\" # the PRD\ndevStoryLocation:\nqa:\n  qaLocation: q\n"));
        assert_eq!(p.prd_file, "docs/a#b/prd.md");
        assert_eq!(p.dev_story_location, "docs/stories", "an empty value is not a location");
    }

    #[test]
    fn merges_the_shared_toml_layers_as_the_ts_reader_does() {
        let dir = temp("layers");
        std::fs::write(dir.join("_bmad/config.toml"), include_str!("fixtures/switch/config.toml")).unwrap();
        std::fs::write(dir.join("_bmad/custom/config.toml"), include_str!("fixtures/switch/config.team.toml")).unwrap();
        std::fs::write(dir.join("_bmad/custom/config.user.toml"), include_str!("fixtures/switch/config.user.toml")).unwrap();
        let config = load_central_config(&dir).unwrap();
        let want = &expected()["toml"];
        let core = config["core"].as_table().unwrap();
        assert_eq!(core["project_name"].as_str(), want["projectName"].as_str());
        assert_eq!(core["communication_language"].as_str(), want["communicationLanguage"].as_str());
        let demo = config["modules"]["demo"].as_table().unwrap();
        assert_eq!(demo["enabled"].as_bool(), want["demoEnabled"].as_bool());
        assert_eq!(demo["level"].as_integer(), want["demoLevel"].as_i64());
        let root = Path::new(want["root"].as_str().unwrap());
        assert_eq!(output_folder(root, &config), want["outputFolder"].as_str().unwrap());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_layer_that_does_not_parse_is_named() {
        let dir = temp("broken");
        std::fs::write(dir.join("_bmad/config.toml"), "[core]\noutput_folder = \"out\"\n").unwrap();
        std::fs::write(dir.join("_bmad/custom/config.toml"), "not = [toml").unwrap();
        let err = load_central_config(&dir).unwrap_err();
        assert!(err.contains("_bmad/custom/config.toml"), "{err}");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn no_config_or_no_output_folder_means_the_default_folder() {
        let dir = temp("none");
        let config = load_central_config(&dir).unwrap();
        assert_eq!(output_folder(&dir, &config), "_bmad-output");
        std::fs::write(dir.join("_bmad/config.toml"), "[core]\noutput_folder = \"\"\n").unwrap();
        assert_eq!(output_folder(&dir, &load_central_config(&dir).unwrap()), "_bmad-output");
        std::fs::remove_dir_all(dir).ok();
    }
}

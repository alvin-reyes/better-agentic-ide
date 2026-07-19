// Sub-agent transcript parsing — filled in by later tasks.

use std::path::{Path, PathBuf};

pub fn encode_project_dir(cwd: &str) -> String {
    cwd.chars()
        .map(|c| if c == '/' || c == '.' { '-' } else { c })
        .collect()
}

pub fn claude_project_path(home: &Path, cwd: &str) -> PathBuf {
    home.join(".claude")
        .join("projects")
        .join(encode_project_dir(cwd))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_plain_path() {
        assert_eq!(
            encode_project_dir("/Users/alvin-reyes/Project/caiden-web"),
            "-Users-alvin-reyes-Project-caiden-web"
        );
    }

    #[test]
    fn encodes_dotted_path() {
        assert_eq!(
            encode_project_dir("/Users/alvin-reyes/.claude-mem/x"),
            "-Users-alvin-reyes--claude-mem-x"
        );
    }

    #[test]
    fn builds_full_project_path() {
        let p = claude_project_path(Path::new("/home/u"), "/a/b");
        assert_eq!(p, PathBuf::from("/home/u/.claude/projects/-a-b"));
    }
}

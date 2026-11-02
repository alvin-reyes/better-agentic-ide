//! Each guarded CLI's Claude Code permission rules: the ask rules that sit
//! on top of the command guard (the documented floor, on canonical forms),
//! the allow rules for reads (for the main checkout's root
//! `settings.local.json` only) and the `Read` rules for credential files,
//! which are ask rules. See `.ade/context/cli-guard.md`.

// Story 2 puts the ask rules on every launch and Story 4 writes all three
// lists; until then only the tests read them.
#![allow(dead_code)]

/// One `Bash(gh <leaf> *)` per risky leaf of `cli_guard::tables::GH_CLASSES`
/// (prefix style, `Bash(b G V *)`), then the canonical risky forms of the
/// conditional leaves. `gh api` with `-f`/`-F` is left to the guard: a rule
/// can't tell a graphql query from a mutation, and agents read with
/// `gh api graphql -f query=…` all the time.
pub const GH_ASK: &[&str] = &[
    "Bash(gh agent-task create *)",
    "Bash(gh alias delete *)",
    "Bash(gh alias import *)",
    "Bash(gh alias set *)",
    "Bash(gh auth login *)",
    "Bash(gh auth logout *)",
    "Bash(gh auth refresh *)",
    "Bash(gh auth setup-git *)",
    "Bash(gh auth switch *)",
    "Bash(gh auth token *)",
    "Bash(gh cache delete *)",
    "Bash(gh codespace code *)",
    "Bash(gh codespace cp *)",
    "Bash(gh codespace create *)",
    "Bash(gh codespace delete *)",
    "Bash(gh codespace edit *)",
    "Bash(gh codespace jupyter *)",
    "Bash(gh codespace logs *)",
    "Bash(gh codespace ports *)",
    "Bash(gh codespace ports forward *)",
    "Bash(gh codespace ports visibility *)",
    "Bash(gh codespace rebuild *)",
    "Bash(gh codespace ssh *)",
    "Bash(gh codespace stop *)",
    "Bash(gh config set *)",
    "Bash(gh copilot *)",
    "Bash(gh extension browse *)",
    "Bash(gh extension create *)",
    "Bash(gh extension exec *)",
    "Bash(gh extension install *)",
    "Bash(gh extension remove *)",
    "Bash(gh extension upgrade *)",
    "Bash(gh gist create *)",
    "Bash(gh gist delete *)",
    "Bash(gh gist edit *)",
    "Bash(gh gist rename *)",
    "Bash(gh gpg-key add *)",
    "Bash(gh gpg-key delete *)",
    "Bash(gh gpg-key list *)",
    "Bash(gh issue delete *)",
    "Bash(gh issue transfer *)",
    "Bash(gh label delete *)",
    "Bash(gh pr merge *)",
    "Bash(gh project close *)",
    "Bash(gh project delete *)",
    "Bash(gh project field-delete *)",
    "Bash(gh project item-delete *)",
    "Bash(gh release create *)",
    "Bash(gh release delete *)",
    "Bash(gh release delete-asset *)",
    "Bash(gh release edit *)",
    "Bash(gh release upload *)",
    "Bash(gh repo archive *)",
    "Bash(gh repo autolink create *)",
    "Bash(gh repo autolink delete *)",
    "Bash(gh repo create *)",
    "Bash(gh repo delete *)",
    "Bash(gh repo deploy-key add *)",
    "Bash(gh repo deploy-key delete *)",
    "Bash(gh repo deploy-key list *)",
    "Bash(gh repo edit *)",
    "Bash(gh repo rename *)",
    "Bash(gh repo sync *)",
    "Bash(gh run cancel *)",
    "Bash(gh run delete *)",
    "Bash(gh run rerun *)",
    "Bash(gh secret delete *)",
    "Bash(gh secret set *)",
    "Bash(gh ssh-key add *)",
    "Bash(gh ssh-key delete *)",
    "Bash(gh ssh-key list *)",
    "Bash(gh variable delete *)",
    "Bash(gh variable set *)",
    "Bash(gh workflow disable *)",
    "Bash(gh workflow enable *)",
    "Bash(gh workflow run *)",
    // Risky only with a flag or an argument (the guard checks every spelling; these are the canonical ones).
    "Bash(gh pr close * -d*)",
    "Bash(gh pr close * --delete-branch*)",
    "Bash(gh auth status -t*)",
    "Bash(gh auth status *--show-token*)",
    "Bash(gh config get oauth_token *)",
    "Bash(gh config list *)",
    "Bash(gh api *-X *)",
    "Bash(gh api *--method*)",
    "Bash(gh api *--input*)",
    "Bash(gh api *secret-scanning*)",
];
/// Reads, for the main checkout's root `settings.local.json` only: a literal
/// subcommand and one trailing wildcard, never `gh auth status` (`-t` prints
/// the token), `gh api` or `gh config`.
pub const GH_ALLOW: &[&str] = &[
    "Bash(gh agent-task list *)",
    "Bash(gh agent-task view *)",
    "Bash(gh alias list *)",
    "Bash(gh attestation trusted-root *)",
    "Bash(gh attestation verify *)",
    "Bash(gh cache list *)",
    "Bash(gh codespace list *)",
    "Bash(gh codespace view *)",
    "Bash(gh completion *)",
    "Bash(gh extension list *)",
    "Bash(gh extension search *)",
    "Bash(gh gist list *)",
    "Bash(gh gist view *)",
    "Bash(gh issue list *)",
    "Bash(gh issue status *)",
    "Bash(gh issue view *)",
    "Bash(gh label list *)",
    "Bash(gh licenses *)",
    "Bash(gh org list *)",
    "Bash(gh pr checks *)",
    "Bash(gh pr diff *)",
    "Bash(gh pr list *)",
    "Bash(gh pr status *)",
    "Bash(gh pr view *)",
    "Bash(gh project field-list *)",
    "Bash(gh project item-list *)",
    "Bash(gh project list *)",
    "Bash(gh project view *)",
    "Bash(gh release list *)",
    "Bash(gh release verify *)",
    "Bash(gh release verify-asset *)",
    "Bash(gh release view *)",
    "Bash(gh repo autolink list *)",
    "Bash(gh repo autolink view *)",
    "Bash(gh repo gitignore list *)",
    "Bash(gh repo gitignore view *)",
    "Bash(gh repo license list *)",
    "Bash(gh repo license view *)",
    "Bash(gh repo list *)",
    "Bash(gh repo view *)",
    "Bash(gh ruleset check *)",
    "Bash(gh ruleset list *)",
    "Bash(gh ruleset view *)",
    "Bash(gh run list *)",
    "Bash(gh run view *)",
    "Bash(gh run watch *)",
    "Bash(gh search code *)",
    "Bash(gh search commits *)",
    "Bash(gh search issues *)",
    "Bash(gh search prs *)",
    "Bash(gh search repos *)",
    "Bash(gh secret list *)",
    "Bash(gh status *)",
    "Bash(gh variable get *)",
    "Bash(gh variable list *)",
    "Bash(gh workflow list *)",
    "Bash(gh workflow view *)",
];
/// `Read` rules for gh's credential file: ask rules.
pub const GH_READ: &[&str] = &["Read(~/.config/gh/hosts.yml)"];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude_settings::rule_matches;
    use crate::cli_guard::tables::gh_canonical_forms;

    #[test]
    fn gh_rules_cover_canonical_risks() {
        let forms = gh_canonical_forms();
        let risky: Vec<String> = forms.iter().filter(|f| f.risky).map(|f| format!("gh {}", f.rest)).collect();
        let reads: Vec<String> = forms.iter().filter(|f| !f.risky).map(|f| format!("gh {}", f.rest)).collect();
        assert!(risky.len() > 60 && reads.len() > 80, "{} risky, {} not", risky.len(), reads.len());
        for rule in GH_ASK {
            assert!(risky.iter().any(|c| rule_matches(rule, c)), "{rule} matches no risky leaf's canonical form");
            for r in &reads {
                assert!(!rule_matches(rule, r), "{rule} matches {r}");
            }
        }
        // The other way: every risky canonical form has an ask rule.
        for c in &risky {
            assert!(GH_ASK.iter().any(|r| rule_matches(r, c)), "no ask rule for {c}");
        }
        // Allow rules: only reads, a literal subcommand before the one
        // trailing wildcard, never a leaf with a secret-printing flag.
        assert!(!GH_ALLOW.is_empty());
        for rule in GH_ALLOW {
            let inner = rule.strip_prefix("Bash(gh ").and_then(|r| r.strip_suffix(" *)")).unwrap_or_else(|| panic!("{rule}"));
            assert!(!inner.contains('*'), "{rule}");
            for c in &risky {
                assert!(!rule_matches(rule, c), "{rule} allows {c}");
            }
            assert!(reads.iter().any(|c| rule_matches(rule, c)), "{rule} allows no read");
            assert!(!rule.contains("auth status") && !rule.contains("gh api") && !rule.contains("config"), "{rule}");
        }
        // The allow list is the read set, written down a second time: every
        // read leaf has one and nothing else does, so a class changed in the
        // table without its rules fails here.
        for f in forms.iter().filter(|f| !f.risky) {
            let c = format!("gh {}", f.rest);
            assert_eq!(GH_ALLOW.iter().any(|r| rule_matches(r, &c)), f.complete_read, "allow rules vs {c}");
        }
        assert_eq!(GH_READ, &["Read(~/.config/gh/hosts.yml)"]);
    }
}

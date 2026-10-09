//! Platform differences, as plain functions over the environment.
//!
//! These could each be a `#[cfg]` block at their call site, but then they could
//! only be exercised on the platform they target, and this port is being written
//! on a machine that cannot compile for Windows. Taking the environment as an
//! argument means the Windows behaviour is testable from anywhere, and the
//! `#[cfg]` is reduced to picking which lookup to perform.

use std::path::PathBuf;

/// Whether this build targets Windows. A constant so the functions below can be
/// tested for both platforms from either.
pub const IS_WINDOWS: bool = cfg!(windows);

/// The home directory variable, which Windows spells differently.
///
/// Windows sets neither HOME nor, reliably, a POSIX-looking home. USERPROFILE is
/// the documented one; HOMEDRIVE+HOMEPATH is the fallback for older setups and
/// for domain accounts where USERPROFILE is absent.
pub fn home_from<F>(windows: bool, var: F) -> Option<PathBuf>
where
    F: Fn(&str) -> Option<String>,
{
    if windows {
        if let Some(p) = var("USERPROFILE").filter(|s| !s.is_empty()) {
            return Some(PathBuf::from(p));
        }
        let drive = var("HOMEDRIVE").filter(|s| !s.is_empty())?;
        let path = var("HOMEPATH").filter(|s| !s.is_empty())?;
        return Some(PathBuf::from(format!("{drive}{path}")));
    }
    var("HOME").filter(|s| !s.is_empty()).map(PathBuf::from)
}

/// The shell to spawn, and the arguments that make it a login shell.
///
/// On Unix this is $SHELL, falling back to zsh. On Windows there is no $SHELL:
/// prefer PowerShell 7 if the environment names it, else Windows PowerShell,
/// which is present on every supported version. `-l` is meaningless to both and
/// would be passed through to the profile as a parameter, so Windows gets no
/// login flag.
pub fn shell_from<F>(windows: bool, var: F) -> (String, Vec<String>)
where
    F: Fn(&str) -> Option<String>,
{
    if windows {
        let shell = var("ADE_SHELL")
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "powershell.exe".to_string());
        return (shell, vec!["-NoLogo".to_string()]);
    }
    let shell = var("SHELL").filter(|s| !s.is_empty()).unwrap_or_else(|| "/bin/zsh".to_string());
    (shell, vec!["-l".to_string()])
}

/// Environment variables worth carrying into a spawned terminal.
///
/// PATH matters on both. The Unix trio of HOME/USER/LANG has Windows
/// equivalents that programs there actually read, and passing the Unix names on
/// Windows would set variables nothing looks at.
pub fn passthrough_vars(windows: bool) -> &'static [&'static str] {
    if windows {
        &["PATH", "USERPROFILE", "USERNAME", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA", "SYSTEMROOT", "TEMP", "COMSPEC"]
    } else {
        &["HOME", "USER", "PATH", "LANG"]
    }
}

/// How to ask the system where a command lives.
pub fn which_command(windows: bool) -> (&'static str, &'static [&'static str]) {
    if windows { ("where.exe", &[]) } else { ("/bin/sh", &["-lc"]) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        move |k| pairs.iter().find(|(n, _)| *n == k).map(|(_, v)| v.to_string())
    }

    #[test]
    fn unix_home_is_home() {
        assert_eq!(home_from(false, env(&[("HOME", "/Users/x")])), Some(PathBuf::from("/Users/x")));
    }

    #[test]
    fn windows_home_prefers_userprofile() {
        let e = env(&[("USERPROFILE", r"C:\Users\x"), ("HOME", "/should/not/win")]);
        assert_eq!(home_from(true, e), Some(PathBuf::from(r"C:\Users\x")));
    }

    #[test]
    fn windows_home_falls_back_to_homedrive_and_homepath() {
        let e = env(&[("HOMEDRIVE", "C:"), ("HOMEPATH", r"\Users\x")]);
        assert_eq!(home_from(true, e), Some(PathBuf::from(r"C:\Users\x")));
    }

    /// An empty variable is not a home directory. Windows sets USERPROFILE to
    /// an empty string in some service contexts, and treating that as a path
    /// would put the shell in the filesystem root.
    #[test]
    fn an_empty_variable_is_not_a_home() {
        assert_eq!(home_from(true, env(&[("USERPROFILE", "")])), None);
        assert_eq!(home_from(false, env(&[("HOME", "")])), None);
    }

    #[test]
    fn unix_shell_is_login_shell() {
        let (sh, args) = shell_from(false, env(&[("SHELL", "/bin/fish")]));
        assert_eq!(sh, "/bin/fish");
        assert_eq!(args, vec!["-l".to_string()]);
    }

    #[test]
    fn unix_shell_falls_back_to_zsh() {
        let (sh, _) = shell_from(false, env(&[]));
        assert_eq!(sh, "/bin/zsh");
    }

    /// $SHELL on Windows, if something set it, names a Unix path that cannot be
    /// spawned. Windows must not read it.
    #[test]
    fn windows_ignores_shell_and_never_passes_a_login_flag() {
        let (sh, args) = shell_from(true, env(&[("SHELL", "/bin/zsh")]));
        assert_eq!(sh, "powershell.exe");
        assert!(!args.contains(&"-l".to_string()), "-l is a profile parameter to powershell");
    }

    #[test]
    fn windows_shell_can_be_overridden() {
        let (sh, _) = shell_from(true, env(&[("ADE_SHELL", "pwsh.exe")]));
        assert_eq!(sh, "pwsh.exe");
    }

    #[test]
    fn passthrough_carries_path_on_both() {
        assert!(passthrough_vars(true).contains(&"PATH"));
        assert!(passthrough_vars(false).contains(&"PATH"));
    }

    /// Setting HOME on Windows sets a variable almost nothing reads, and omits
    /// the ones that matter.
    #[test]
    fn windows_passthrough_uses_windows_names() {
        let w = passthrough_vars(true);
        assert!(w.contains(&"USERPROFILE"));
        assert!(!w.contains(&"HOME"));
    }

    #[test]
    fn which_differs_by_platform() {
        assert_eq!(which_command(true).0, "where.exe");
        assert_eq!(which_command(false).0, "/bin/sh");
    }
}

//! Where the daemon socket and the `aimux` binary live. Mirrors
//! `src/profile-paths.ts` and `src/daemon/runtime-paths.ts`.

use std::path::PathBuf;

pub fn sanitize_profile(raw: &str) -> String {
    let lowered = raw.trim().to_lowercase();
    let mut out = String::new();
    for c in lowered.chars() {
        let keep = c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-');
        let c = if keep { c } else { '-' };
        if !(c == '-' && out.ends_with('-')) {
            out.push(c);
        }
    }
    let trimmed = out.strip_prefix('-').unwrap_or(&out);
    let trimmed = trimmed.strip_suffix('-').unwrap_or(trimmed);
    if trimmed.is_empty() {
        "default".to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn daemon_socket_path(
    xdg_runtime_dir: Option<&str>,
    home: &str,
    profile: Option<&str>,
) -> PathBuf {
    let profile = match profile {
        Some(p) if !p.is_empty() => sanitize_profile(p),
        _ => "default".to_string(),
    };
    let dir = format!("aimux-{profile}");
    match xdg_runtime_dir {
        Some(xdg) if !xdg.is_empty() => PathBuf::from(xdg).join(dir).join("daemon.sock"),
        _ => PathBuf::from(home)
            .join(".local/state")
            .join(dir)
            .join("daemon.sock"),
    }
}

pub fn aimux_bin(override_path: Option<&str>, home: &str) -> PathBuf {
    match override_path {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => PathBuf::from(home).join(".bun/bin/aimux"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_sanitized() {
        assert_eq!(sanitize_profile("My Profile!"), "my-profile");
        assert_eq!(sanitize_profile("  "), "default");
        assert_eq!(sanitize_profile("-a--b_c.d-"), "a-b_c.d");
    }

    #[test]
    fn xdg_wins() {
        assert_eq!(
            daemon_socket_path(Some("/run/u"), "/h", None),
            PathBuf::from("/run/u/aimux-default/daemon.sock")
        );
    }

    #[test]
    fn empty_xdg_falls_back_to_home() {
        assert_eq!(
            daemon_socket_path(Some(""), "/h", Some("dev")),
            PathBuf::from("/h/.local/state/aimux-dev/daemon.sock")
        );
    }

    #[test]
    fn aimux_bin_prefers_override() {
        assert_eq!(aimux_bin(Some("/x/aimux"), "/h"), PathBuf::from("/x/aimux"));
        assert_eq!(aimux_bin(None, "/h"), PathBuf::from("/h/.bun/bin/aimux"));
    }
}

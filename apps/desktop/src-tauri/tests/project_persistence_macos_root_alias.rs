#[path = "../src/project_persistence.rs"]
mod project_persistence;

use std::path::Path;

#[test]
fn macos_root_alias_policy_only_allows_known_system_aliases() {
    assert_eq!(
        project_persistence::trusted_macos_root_alias_target(Path::new("/var")),
        Some(Path::new("/private/var"))
    );
    assert_eq!(
        project_persistence::trusted_macos_root_alias_target(Path::new("/tmp")),
        Some(Path::new("/private/tmp"))
    );
    assert_eq!(
        project_persistence::trusted_macos_root_alias_target(Path::new("/etc")),
        Some(Path::new("/private/etc"))
    );

    assert_eq!(
        project_persistence::trusted_macos_root_alias_target(Path::new("/opt")),
        None,
        "an arbitrary root-level alias must not gain project-save authority"
    );
    assert_eq!(
        project_persistence::trusted_macos_root_alias_target(Path::new("/Users")),
        None,
        "ordinary root directories are not trusted aliases"
    );
    assert_eq!(
        project_persistence::trusted_macos_root_alias_target(Path::new("/var/tmp")),
        None,
        "only the exact top-level system aliases are admitted"
    );
}

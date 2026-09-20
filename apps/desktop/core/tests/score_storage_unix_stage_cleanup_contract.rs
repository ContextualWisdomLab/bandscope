const SCORE_STORAGE_SOURCE: &str = include_str!("../src/score_storage.rs");

#[test]
fn unix_owned_stage_cleanup_uses_descriptor_relative_identity_recheck_before_unlink() {
    let unix_cleanup_start = SCORE_STORAGE_SOURCE
        .find("#[cfg(unix)]\nfn remove_owned_stage")
        .expect("Unix owned-stage cleanup must remain explicit");
    let windows_cleanup_start = SCORE_STORAGE_SOURCE[unix_cleanup_start..]
        .find("#[cfg(windows)]\nfn remove_owned_stage_with_hook")
        .map(|offset| unix_cleanup_start + offset)
        .expect("Windows cleanup boundary must follow the Unix implementation");
    let unix_cleanup = &SCORE_STORAGE_SOURCE[unix_cleanup_start..windows_cleanup_start];

    assert!(
        unix_cleanup.contains("open_score_entry_at"),
        "Unix stage cleanup must reopen the reserved basename beneath a pinned parent descriptor"
    );
    assert!(
        unix_cleanup.contains("stage_identity(&current_file)"),
        "Unix stage cleanup must revalidate the current object identity immediately before unlink"
    );
    assert!(
        unix_cleanup.contains("unlinkat"),
        "Unix stage cleanup must unlink through the pinned parent descriptor rather than a pathname"
    );
    assert!(
        !unix_cleanup.contains("fs::remove_file(path)"),
        "Unix stage cleanup must not fall back to pathname-only deletion after identity validation"
    );
}

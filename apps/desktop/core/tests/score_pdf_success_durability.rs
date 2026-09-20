const ROOT_SOURCE: &str = include_str!("../src/root.rs");
const RECOVERY_SOURCE: &str = include_str!("../src/score_recovery.rs");

#[test]
fn public_score_publication_routes_through_lease_bound_success_durability_boundary() {
    assert!(
        ROOT_SOURCE.contains("mod score_publication;"),
        "the crate root must own an explicit successful-publication durability boundary"
    );
    assert!(
        ROOT_SOURCE.contains("publish_score_pdf_attachment"),
        "the public crate root must continue exporting the canonical publication API"
    );

    let lease = RECOVERY_SOURCE
        .find("let lease = acquire_score_workspace_lease(scores_root)?;")
        .expect("publication must acquire the Score Storage workspace lease");
    let publication = RECOVERY_SOURCE
        .find("let written = score_storage::publish_score_pdf_attachment(source, scores_root, score_id)?;")
        .expect("publication must use the canonical lower Score Storage publisher");
    let barrier = RECOVERY_SOURCE
        .find("sync_metadata(scores_root)?;")
        .expect("publication must execute the metadata durability barrier");

    assert!(
        lease < publication && publication < barrier,
        "the successful-return durability barrier must execute after publication while the lease remains in scope"
    );
    assert!(
        RECOVERY_SOURCE.contains("score_publication::sync_successful_publication_metadata"),
        "the public publication path must supply the platform durability barrier"
    );
}

const ROOT_SOURCE: &str = include_str!("../src/root.rs");

#[test]
fn public_score_publication_routes_through_success_durability_boundary() {
    assert!(
        ROOT_SOURCE.contains("mod score_publication;"),
        "the crate root must own an explicit successful-publication durability boundary"
    );
    assert!(
        ROOT_SOURCE.contains("pub use score_publication::publish_score_pdf_attachment;"),
        "external callers must receive the durability-wrapped publication API"
    );
}

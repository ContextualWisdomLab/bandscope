use bandscope_desktop_core::prepare_project_migration;
use std::io::Cursor;

#[test]
fn migration_receipt_verifies_the_exact_input_bytes() {
    let original = include_str!("../testdata/project-v2.json");
    let prepared = prepare_project_migration(original).expect("v2 fixture should prepare migration");

    prepared
        .receipt()
        .verify_input_reader(Cursor::new(original.as_bytes()))
        .expect("the exact admitted input bytes should match their receipt");

    let changed_but_parse_equivalent = format!("{original}\n");
    assert!(
        prepared
            .receipt()
            .verify_input_reader(Cursor::new(changed_but_parse_equivalent.as_bytes()))
            .is_err(),
        "a byte-level predecessor change must fail even when the JSON parses to the same document"
    );
}

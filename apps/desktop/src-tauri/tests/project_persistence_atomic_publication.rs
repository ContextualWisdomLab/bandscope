#[test]
fn hard_link_fallback_never_reserves_the_final_path_with_an_empty_file() {
    let source = include_str!("../src/project_persistence.rs");

    assert!(
        !source.contains("File::create_new(target)")
            && !source.contains("File::create_new(&target)"),
        "hard-link fallback must not materialize an empty final-path placeholder before the staged project is atomically published"
    );
}

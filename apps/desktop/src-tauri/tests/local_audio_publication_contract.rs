#[test]
fn local_audio_materializer_consumes_publication_bound_receipt() {
    let source = include_str!("../src/main.rs");
    let materializer_start = source
        .find("fn materialize_local_audio_source(")
        .expect("desktop materializer must remain present");
    let materializer_tail = &source[materializer_start..];
    let materializer_end = materializer_tail
        .find("\n}\n\nfn parse_request_payload")
        .expect("materializer boundary must remain inspectable");
    let materializer = &materializer_tail[..materializer_end];

    assert!(
        materializer.contains("copy_bounded_local_audio_with_receipt"),
        "production materialization must retain native size+SHA-256 staging evidence"
    );
    assert!(
        materializer.contains("verify_local_audio_publication_receipt"),
        "production materialization must re-read the published app-owned source and bind it to the staging receipt"
    );
    assert!(
        !materializer.contains("copy_bounded_local_audio(source"),
        "the compatibility byte-count-only adapter must not remain on the production publication path"
    );
}

#[test]
fn local_audio_publication_must_not_overwrite_an_existing_source_name() {
    let source = include_str!("../src/main.rs");
    let materializer_start = source
        .find("fn materialize_local_audio_source(")
        .expect("desktop materializer must remain present");
    let materializer_tail = &source[materializer_start..];
    let materializer_end = materializer_tail
        .find("\n}\n\nfn parse_request_payload")
        .expect("materializer boundary must remain inspectable");
    let materializer = &materializer_tail[..materializer_end];

    assert!(
        materializer.contains("std::fs::hard_link(&stage, &destination)"),
        "publication must use an atomic no-clobber filesystem create instead of check-then-rename"
    );
    assert!(
        !materializer.contains("destination.exists()"),
        "a preflight existence check is racy and must not authorize a later overwrite-capable rename"
    );
    assert!(
        !materializer.contains("std::fs::rename(&stage, &destination)"),
        "overwrite-capable rename must not publish the immutable project source"
    );
}

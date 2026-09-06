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

#[test]
fn local_audio_selection_retains_verified_path_free_identity_in_native_state() {
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
        materializer.contains("build_local_audio_publication_identity"),
        "the verified publication receipt must be converted to the canonical path-free native identity"
    );
    assert!(
        materializer.contains("LocalAudioPublicationIdentity"),
        "materialization must return typed native publication evidence alongside analysis bootstrap state"
    );

    let selector_start = source
        .find("fn select_local_audio_source(")
        .expect("desktop local-audio selector must remain present");
    let selector_tail = &source[selector_start..];
    let selector_end = selector_tail
        .find("\n}\n\n#[tauri::command]\nasync fn import_youtube_url")
        .expect("selector boundary must remain inspectable");
    let selector = &selector_tail[..selector_end];

    assert!(
        source.contains("struct LocalAudioPublicationIdentityState"),
        "Tauri must retain verified source identity in native state instead of renderer JSON"
    );
    assert!(
        selector.contains("store_local_audio_publication_identity"),
        "local selection must retain the verified identity before returning bootstrap authority"
    );
    assert!(
        source.contains(".manage(LocalAudioPublicationIdentityState::default())"),
        "the native identity state must be registered with the Tauri runtime"
    );
}

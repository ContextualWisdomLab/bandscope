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

    assert!(
        source.contains("struct LocalAudioPublicationIdentityState"),
        "verified source identity must have a native-only state owner"
    );
    assert!(
        source.contains("build_local_audio_publication_identity(project_id, &extension, &receipt)"),
        "the production materializer must derive persistence identity from the verified native receipt"
    );
    assert!(
        source.contains("store_local_audio_publication_identity(&publication_state, publication_identity)"),
        "selection must retain native publication identity before returning bootstrap authority"
    );
    assert!(
        source.contains(".manage(LocalAudioPublicationIdentityState::default())"),
        "the native publication identity state must be registered with the Tauri runtime"
    );
}

#[test]
fn project_save_binds_only_explicit_project_id_to_retained_native_source_identity() {
    let source = include_str!("../src/main.rs");
    let save_start = source
        .find("fn save_project(")
        .expect("native project save command must remain present");
    let save_tail = &source[save_start..];
    let save_end = save_tail
        .find("\n}\n\n#[tauri::command]\nfn load_project")
        .expect("save command boundary must remain inspectable");
    let save_command = &save_tail[..save_end];

    assert!(
        source.contains("fn project_document_with_retained_source_reference("),
        "native persistence needs one explicit retained-identity adapter"
    );
    assert!(
        save_command.contains("project_id: Option<String>"),
        "renderer may submit only the already-minted project id as the save selector"
    );
    assert!(
        save_command.contains("publication_state: tauri::State<'_, LocalAudioPublicationIdentityState>"),
        "save must read verified source identity from native state instead of renderer evidence"
    );
    assert!(
        save_command.contains("project_document_with_retained_source_reference("),
        "save must inject the native source reference before project serialization"
    );
    assert!(
        !save_command.contains("source_reference = serde_json"),
        "save must never reconstruct source identity from renderer JSON"
    );
    assert!(
        !source.contains("last_selected_project"),
        "multiple project aggregates forbid a global last-selected shortcut"
    );
}

#[test]
fn project_load_re_admits_persisted_source_before_returning_document() {
    let source = include_str!("../src/main.rs");
    let load_start = source
        .find("fn load_project(")
        .expect("native project load command must remain present");
    let load_tail = &source[load_start..];
    let load_end = load_tail
        .find("\n}\n\nfn scores_root_for_project")
        .expect("load command boundary must remain inspectable");
    let load_command = &load_tail[..load_end];

    assert!(
        source.contains("fn restore_project_source_after_restart"),
        "restart needs one native adapter that restores source authority from persisted evidence"
    );
    assert!(
        load_command.contains("app: tauri::AppHandle<impl Runtime>"),
        "load must resolve the app-local project root inside the native boundary"
    );
    assert!(
        load_command.contains("state: tauri::State<'_, AppState>"),
        "load must restore fresh native bootstrap state for the exact project aggregate"
    );
    assert!(
        load_command.contains("publication_state: tauri::State<'_, LocalAudioPublicationIdentityState>"),
        "load must restore path-free publication identity only after re-admission"
    );
    assert!(
        load_command.contains("restore_project_source_after_restart("),
        "a v3 source reference must be re-admitted before the loaded document is returned"
    );
    assert!(
        !load_command.contains("app_owned_root(&app, \"projects\""),
        "restart must not provision a missing project directory while reading"
    );
}

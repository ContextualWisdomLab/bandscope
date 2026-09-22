const MAIN_SOURCE: &str = include_str!("../src/main.rs");

#[test]
fn production_local_audio_materializer_uses_private_stage_creation_boundary() {
    let materializer_start = MAIN_SOURCE
        .find("fn materialize_local_audio_source(")
        .expect("desktop materializer must remain present");
    let materializer_tail = &MAIN_SOURCE[materializer_start..];
    let materializer_end = materializer_tail
        .find("\n}\n\nfn parse_request_payload")
        .expect("materializer boundary must remain inspectable");
    let materializer = &materializer_tail[..materializer_end];

    assert!(
        materializer.contains("create_private_local_audio_stage(&stage)"),
        "production local-audio materialization must create its private stage through the tested native boundary"
    );
    assert!(
        !materializer.contains(".create_new(true)"),
        "the production materializer must not bypass the private stage boundary with ambient-mode file creation"
    );
}

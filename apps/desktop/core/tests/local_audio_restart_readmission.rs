use bandscope_desktop_core::{
    re_admit_local_audio_publication, re_admit_local_audio_publication_from_project_root,
    ProjectSourceReferencePayload,
};
use std::{
    io::{Cursor, Error, ErrorKind, Read, Result as IoResult},
    path::Path,
};

const WAV_BYTES: &[u8] = &[
    0x52, 0x49, 0x46, 0x46, 0x2c, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d,
    0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x40, 0x1f, 0x00, 0x00,
    0x40, 0x1f, 0x00, 0x00, 0x01, 0x00, 0x08, 0x00, 0x64, 0x61, 0x74, 0x61, 0x08, 0x00,
    0x00, 0x00, 0x80, 0xa0, 0xc0, 0xe0, 0xff, 0xe0, 0xc0, 0xa0,
];
const WAV_SHA256: &str =
    "6edea6da3400897a1eae8dede07c13843cffd02a91dc3599cd1f542a9a888be5";

struct RejectRead;

impl Read for RejectRead {
    fn read(&mut self, _buf: &mut [u8]) -> IoResult<usize> {
        panic!("malformed durable evidence must be rejected before reading the artifact");
    }
}

struct FailingReader;

impl Read for FailingReader {
    fn read(&mut self, _buf: &mut [u8]) -> IoResult<usize> {
        Err(Error::new(ErrorKind::PermissionDenied, "private OS detail"))
    }
}

fn source_reference() -> ProjectSourceReferencePayload {
    ProjectSourceReferencePayload {
        project_id: "project-600-6".to_string(),
        artifact_name: "source.wav".to_string(),
        extension: "wav".to_string(),
        file_size_bytes: WAV_BYTES.len() as u64,
        content_sha256: WAV_SHA256.to_string(),
    }
}

#[test]
fn restart_re_admission_accepts_only_the_exact_persisted_audio_bytes() {
    let identity = re_admit_local_audio_publication(&source_reference(), Cursor::new(WAV_BYTES))
        .expect("the exact persisted app-owned WAV should regain native identity");

    assert_eq!(identity.project_id, "project-600-6");
    assert_eq!(identity.artifact_name, "source.wav");
    assert_eq!(identity.extension, "wav");
    assert_eq!(identity.file_size_bytes, WAV_BYTES.len() as u64);
    assert_eq!(identity.content_sha256, WAV_SHA256);
}

#[test]
fn restart_re_admission_rejects_same_size_audio_mutation() {
    let mut mutated = WAV_BYTES.to_vec();
    let last = mutated.len() - 1;
    mutated[last] ^= 0x01;

    let error = re_admit_local_audio_publication(&source_reference(), Cursor::new(mutated))
        .expect_err("same-size audio replacement must not regain runtime authority");

    assert_eq!(error, "Could not prepare the local project workspace.");
}

#[test]
fn restart_re_admission_rejects_growth_and_truncation() {
    let mut grown = WAV_BYTES.to_vec();
    grown.push(0x00);
    let truncated = &WAV_BYTES[..WAV_BYTES.len() - 1];

    for bytes in [grown.as_slice(), truncated] {
        let error = re_admit_local_audio_publication(&source_reference(), Cursor::new(bytes))
            .expect_err("changed byte length must not regain runtime authority");
        assert_eq!(error, "Could not prepare the local project workspace.");
    }
}

#[test]
fn restart_re_admission_revalidates_fixed_app_owned_artifact_identity_before_reading() {
    let mut forged = source_reference();
    forged.artifact_name = "../source.wav".to_string();

    let error = re_admit_local_audio_publication(&forged, RejectRead)
        .expect_err("typed but forged artifact identity must fail the reverse ACL");

    assert_eq!(error, "Could not prepare the local project workspace.");
}

#[test]
fn restart_re_admission_rejects_malformed_durable_identity_before_reading() {
    let mut invalid_project = source_reference();
    invalid_project.project_id = "../project-600-6".to_string();
    let mut invalid_extension = source_reference();
    invalid_extension.extension = "WAV".to_string();
    invalid_extension.artifact_name = "source.WAV".to_string();

    for malformed in [invalid_project, invalid_extension] {
        let error = re_admit_local_audio_publication(&malformed, RejectRead)
            .expect_err("malformed persisted identity must fail before becoming runtime authority");
        assert_eq!(error, "Could not prepare the local project workspace.");
    }
}

#[test]
fn restart_re_admission_does_not_expose_reader_failures() {
    let error = re_admit_local_audio_publication(&source_reference(), FailingReader)
        .expect_err("a failed app-owned read must not regain runtime authority");

    assert_eq!(error, "Could not prepare the local project workspace.");
    assert!(!error.contains("private OS detail"));
}

#[test]
fn project_root_adapter_derives_only_the_validated_fixed_artifact_path() {
    let root = Path::new("/trusted/app/project-600-6");
    let reopened = re_admit_local_audio_publication_from_project_root(
        root,
        &source_reference(),
        |path| {
            assert_eq!(path, root.join("source.wav"));
            Ok(Cursor::new(WAV_BYTES))
        },
    )
    .expect("validated durable evidence should derive one fixed app-owned artifact path");

    assert_eq!(reopened.source_path, root.join("source.wav"));
    assert_eq!(reopened.identity.project_id, "project-600-6");
}

#[test]
fn project_root_adapter_rejects_cross_project_binding_before_opening() {
    let error = re_admit_local_audio_publication_from_project_root(
        Path::new("/trusted/app/project-700-7"),
        &source_reference(),
        |_path| -> IoResult<Cursor<&'static [u8]>> {
            panic!("a mismatched project root must fail before filesystem authority is requested")
        },
    )
    .expect_err("persisted evidence must remain bound to its exact project aggregate");

    assert_eq!(error, "Could not prepare the local project workspace.");
}

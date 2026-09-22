#[path = "../src/analysis_source.rs"]
mod analysis_source;

#[cfg(unix)]
use analysis_source::create_private_local_audio_stage;
use analysis_source::revalidate_local_audio_bootstrap_for_analysis;
use bandscope_desktop_core::{
    build_local_audio_publication_identity, LocalAudioCopyReceipt, LocalAudioSourcePayload,
    ProjectBootstrapSummaryPayload,
};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

const MAIN_SOURCE: &str = include_str!("../src/main.rs");
const WAV_BYTES: &[u8] = b"RIFF\x04\x00\x00\x00WAVE";
const WAV_SHA256: &str = "1fe5a351bf0314c8a1840b023fd1e4cab3f0f123468940c241bd7bf20e989ab8";

fn unique_project_root() -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after epoch")
        .as_nanos();
    std::env::temp_dir()
        .join(format!("bandscope-analysis-dispatch-{suffix}"))
        .join("project-1-1")
}

fn bootstrap(project_root: &std::path::Path) -> ProjectBootstrapSummaryPayload {
    ProjectBootstrapSummaryPayload {
        project_id: "project-1-1".to_string(),
        source_mode: "reference".to_string(),
        project_root: project_root.to_string_lossy().into_owned(),
        cache_root: project_root.join("cache").to_string_lossy().into_owned(),
        temp_root: project_root.join("temp").to_string_lossy().into_owned(),
        source: LocalAudioSourcePayload {
            source_path: project_root
                .join("source.wav")
                .to_string_lossy()
                .into_owned(),
            file_name: "rehearsal.wav".to_string(),
            extension: "wav".to_string(),
            file_size_bytes: WAV_BYTES.len() as u64,
        },
    }
}

fn retained_identity() -> bandscope_desktop_core::LocalAudioPublicationIdentity {
    build_local_audio_publication_identity(
        "project-1-1",
        "wav",
        &LocalAudioCopyReceipt {
            file_size_bytes: WAV_BYTES.len() as u64,
            content_sha256: WAV_SHA256.to_string(),
        },
    )
    .expect("fixture identity should be valid")
}

#[test]
fn analysis_dispatch_revalidates_current_app_owned_bytes() {
    let project_root = unique_project_root();
    fs::create_dir_all(&project_root).expect("project root should be created");
    let source_path = project_root.join("source.wav");
    fs::write(&source_path, WAV_BYTES).expect("source fixture should be written");

    let refreshed = revalidate_local_audio_bootstrap_for_analysis(
        &bootstrap(&project_root),
        &retained_identity(),
        |path| fs::File::open(path),
    )
    .expect("unchanged app-owned bytes should regain dispatch authority");
    assert_eq!(refreshed.source.source_path, source_path.to_string_lossy());
    assert_eq!(refreshed.source.file_size_bytes, WAV_BYTES.len() as u64);
    assert_eq!(
        PathBuf::from(&refreshed.cache_root),
        project_root.join("cache").join(WAV_SHA256)
    );
    assert_eq!(
        PathBuf::from(&refreshed.temp_root),
        project_root.join("temp").join(WAV_SHA256)
    );

    let mut changed = WAV_BYTES.to_vec();
    let last_byte = changed.len() - 1;
    changed[last_byte] = b'A';
    fs::write(&source_path, changed).expect("same-size mutation should be written");

    let error = revalidate_local_audio_bootstrap_for_analysis(
        &bootstrap(&project_root),
        &retained_identity(),
        |path| fs::File::open(path),
    )
    .expect_err("same-size mutation must fail before analysis dispatch");
    assert_eq!(
        error,
        "Analysis job source was not found. Choose local audio again."
    );

    fs::remove_dir_all(project_root.parent().expect("project root should have parent"))
        .expect("fixture should be removed");
}

#[cfg(unix)]
#[test]
fn local_audio_stage_remains_owner_private_with_permissive_umask() {
    use std::{
        io::Write,
        os::raw::c_uint,
        os::unix::fs::PermissionsExt,
        process::Command,
    };

    const CHILD_ENV: &str = "BANDSCOPE_LOCAL_AUDIO_PRIVATE_STAGE_CHILD";
    const TEST_NAME: &str =
        "local_audio_stage_remains_owner_private_with_permissive_umask";

    if std::env::var_os(CHILD_ENV).is_none() {
        let output = Command::new(std::env::current_exe().expect("test executable should resolve"))
            .args(["--exact", TEST_NAME, "--nocapture"])
            .env(CHILD_ENV, "1")
            .output()
            .expect("isolated permissive-umask child should launch");
        assert!(
            output.status.success(),
            "permissive-umask local-audio child failed:\nstdout:\n{}\nstderr:\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        return;
    }

    extern "C" {
        fn umask(mask: c_uint) -> c_uint;
    }

    unsafe {
        umask(0);
    }

    let root = unique_project_root();
    fs::create_dir_all(&root).expect("test project root should be created");
    let stage = root.join(".source-private.stage");
    let mut staged = create_private_local_audio_stage(&stage)
        .expect("production local-audio stage should be created");
    staged
        .write_all(WAV_BYTES)
        .expect("fixture bytes should be written through the production stage handle");
    staged.sync_all().expect("fixture stage should synchronize");
    drop(staged);

    let mode = fs::metadata(&stage)
        .expect("local-audio stage should be readable")
        .permissions()
        .mode()
        & 0o777;
    assert_eq!(
        mode, 0o600,
        "app-owned local-audio stage must remain owner-only under a permissive umask"
    );

    fs::remove_dir_all(root.parent().expect("project root should have parent"))
        .expect("fixture should be removed");
}

#[test]
fn analysis_process_receives_native_evidence_without_global_environment_mutation() {
    assert!(MAIN_SOURCE.contains("BANDSCOPE_ADMITTED_AUDIO_BYTES"));
    assert!(MAIN_SOURCE.contains("BANDSCOPE_ADMITTED_AUDIO_SHA256"));
    assert!(MAIN_SOURCE.contains(".env_remove(ADMITTED_AUDIO_BYTES_ENV)"));
    assert!(MAIN_SOURCE.contains(".env_remove(ADMITTED_AUDIO_SHA256_ENV)"));
    assert!(MAIN_SOURCE.contains("ADMITTED_AUDIO_BYTES_ENV,"));
    assert!(MAIN_SOURCE.contains("ADMITTED_AUDIO_SHA256_ENV, &identity.content_sha256"));
    assert!(!MAIN_SOURCE.contains("std::env::set_var(\"BANDSCOPE_ADMITTED_AUDIO_"));
}

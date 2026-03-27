fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "start_analysis_job",
            "get_analysis_job_status",
            "select_local_audio_source",
        ]),
    ))
    .expect("failed to build tauri application manifest");
}

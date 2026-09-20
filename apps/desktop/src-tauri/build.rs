fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "start_analysis_job",
            "get_analysis_job_status",
            "select_local_audio_source",
            "import_youtube_url",
            "save_project",
            "load_project",
            "attach_score_pdf",
            "read_score_pdf",
            "get_score_pdf_receipt",
            "remove_score_pdf_if_receipt_matches",
        ]),
    ))
    .expect("failed to build tauri application manifest");
}
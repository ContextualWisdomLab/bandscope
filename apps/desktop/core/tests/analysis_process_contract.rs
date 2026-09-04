//! Process-contract invariants for the native analysis JSONL boundary.

use bandscope_desktop_core::{
    analysis_process_status::{
        parse_analysis_process_status, validate_analysis_process_status_for_job,
        validate_final_analysis_process_status,
    },
    AnalysisJobState,
};
use serde_json::{json, Value};

const PROCESS_STATUS_ERROR: &str = "Analysis engine returned an invalid response.";
const JOB_ID: &str = "job-process-contract";

fn status(state: &str) -> Value {
    let mut value = json!({
        "jobId": JOB_ID,
        "state": state,
        "requestedAt": "2026-09-04T00:00:00Z",
        "updatedAt": "2026-09-04T00:00:01Z"
    });
    let object = value
        .as_object_mut()
        .expect("analysis status fixture must remain an object");
    match state {
        "succeeded" => {
            object.insert("progressStage".into(), json!("ready"));
            object.insert("progressPercent".into(), json!(100));
            object.insert(
                "result".into(),
                json!({
                    "id": "rights-cleared-song",
                    "title": "Rights-cleared fixture",
                    "sections": [],
                    "exportSummary": {
                        "format": "cue-sheet",
                        "headline": "Check the first section.",
                        "focusSections": []
                    }
                }),
            );
        }
        "failed" => {
            object.insert(
                "error".into(),
                json!({
                    "code": "engine_unavailable",
                    "message": "Analysis failed."
                }),
            );
        }
        _ => {}
    }
    value
}

fn parse(
    value: Value,
) -> Result<bandscope_desktop_core::analysis_process_status::AnalysisProcessStatus, &'static str> {
    parse_analysis_process_status(
        &serde_json::to_string(&value).expect("analysis status fixture should serialize"),
    )
}

#[test]
fn process_status_job_identity_must_match_the_requested_job() {
    let process_status = parse(status("succeeded")).expect("valid succeeded status should parse");

    validate_analysis_process_status_for_job(&process_status, JOB_ID)
        .expect("matching process job identity should be accepted");
    let error = validate_analysis_process_status_for_job(&process_status, "job-other")
        .expect_err("mismatched process job identity must fail closed");
    assert_eq!(error, PROCESS_STATUS_ERROR);
}

#[test]
fn final_process_status_must_be_terminal() {
    for state in ["queued", "running"] {
        let process_status = parse(status(state)).expect("nonterminal status shape should parse");
        let error = validate_final_analysis_process_status(Some(&process_status), JOB_ID)
            .expect_err("process exit with nonterminal status must fail closed");
        assert_eq!(error, PROCESS_STATUS_ERROR);
    }

    let succeeded = parse(status("succeeded")).expect("succeeded status should parse");
    assert!(matches!(
        validate_final_analysis_process_status(Some(&succeeded), JOB_ID)
            .expect("succeeded status is terminal")
            .renderer_status()
            .state,
        AnalysisJobState::Succeeded
    ));

    let failed = parse(status("failed")).expect("failed status should parse");
    assert!(matches!(
        validate_final_analysis_process_status(Some(&failed), JOB_ID)
            .expect("failed status is terminal")
            .renderer_status()
            .state,
        AnalysisJobState::Failed
    ));

    let missing = validate_final_analysis_process_status(None, JOB_ID)
        .expect_err("successful process exit without a status must fail closed");
    assert_eq!(missing, PROCESS_STATUS_ERROR);
}

#[test]
fn rejects_contradictory_state_payloads_without_stem_metadata() {
    let mut succeeded_without_result = status("succeeded");
    succeeded_without_result
        .as_object_mut()
        .expect("status fixture must remain an object")
        .remove("result");

    let mut succeeded_with_error = status("succeeded");
    succeeded_with_error
        .as_object_mut()
        .expect("status fixture must remain an object")
        .insert(
            "error".into(),
            json!({"code": "engine_unavailable", "message": "Contradictory status."}),
        );

    let mut failed_without_error = status("failed");
    failed_without_error
        .as_object_mut()
        .expect("status fixture must remain an object")
        .remove("error");

    let mut queued_with_result = status("queued");
    queued_with_result
        .as_object_mut()
        .expect("status fixture must remain an object")
        .insert(
            "result".into(),
            status("succeeded")
                .get("result")
                .expect("succeeded fixture should include result")
                .clone(),
        );

    for invalid in [
        succeeded_without_result,
        succeeded_with_error,
        failed_without_error,
        queued_with_result,
    ] {
        let error = parse(invalid).expect_err("contradictory state payload must fail closed");
        assert_eq!(error, PROCESS_STATUS_ERROR);
    }
}

use bandscope_desktop_core::{AnalysisJobError, AnalysisJobErrorCode};

#[test]
fn cancelled_analysis_error_uses_the_shared_snake_case_wire_code() {
    let error = AnalysisJobError {
        code: AnalysisJobErrorCode::Cancelled,
        message: "Analysis was cancelled.".to_string(),
    };

    let value = serde_json::to_value(error).expect("analysis error should serialize");

    assert_eq!(value["code"], "cancelled");
    assert_eq!(value["message"], "Analysis was cancelled.");
}

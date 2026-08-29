use bandscope_desktop_core::project_payload_from_content;
use serde_json::{json, Value};

fn song_with_breakdown_plan() -> Value {
    json!({
        "id": "analyzed-song",
        "title": "Late Night Set",
        "sections": [
            {
                "id": "chorus-1",
                "label": "chorus",
                "groove": "Sparse half-time chorus",
                "timeRange": { "start": 30, "end": 46 },
                "confidence": {
                    "level": "high",
                    "source": "model",
                    "notes": "Stem activity corroborates the breakdown."
                },
                "roles": [
                    {
                        "id": "bass-guitar",
                        "name": "Bass Guitar",
                        "roleType": "instrument",
                        "harmony": {
                            "chord": "C#m7",
                            "functionLabel": "vi pedal anchor",
                            "source": "model"
                        },
                        "cue": {
                            "kind": "transition",
                            "value": "Hold into the sparse chorus."
                        },
                        "range": {
                            "lowestNote": "C#2",
                            "highestNote": "E3"
                        },
                        "confidence": {
                            "level": "high",
                            "source": "model",
                            "notes": "Bass remains active after the density drop."
                        },
                        "rehearsalPriority": "high",
                        "simplification": "Stay on roots.",
                        "setupNote": "Keep the attack short.",
                        "manualOverrides": [],
                        "overlapWarnings": [],
                        "breakdownPlan": "Hold this breakdown with Lead Vocal; keep it sparse until the drop.",
                        "breakdownPlanSource": "model"
                    }
                ],
                "partGraph": [
                    {
                        "role_id": "bass-guitar",
                        "is_active": true,
                        "handoff_to": [],
                        "handoff_from": []
                    }
                ]
            }
        ],
        "exportSummary": {
            "format": "cue-sheet",
            "headline": "Lock the sparse chorus texture.",
            "focusSections": ["chorus-1"]
        }
    })
}

#[test]
fn project_contract_round_trips_breakdown_plan_provenance() {
    let payload = song_with_breakdown_plan();
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    let parsed = project_payload_from_content(&content)
        .expect("native project contract must accept shared breakdown-plan fields");
    let serialized =
        serde_json::to_value(parsed).expect("native project contract should serialize");

    assert_eq!(
        serialized["sections"][0]["roles"][0]["breakdownPlan"],
        payload["sections"][0]["roles"][0]["breakdownPlan"]
    );
    assert_eq!(
        serialized["sections"][0]["roles"][0]["breakdownPlanSource"],
        json!("model")
    );
}

#[test]
fn project_contract_rejects_invalid_breakdown_plan_provenance() {
    let mut payload = song_with_breakdown_plan();
    payload["sections"][0]["roles"][0]["breakdownPlanSource"] = json!("inferred");
    let content = serde_json::to_string(&payload).expect("payload should serialize");

    assert!(project_payload_from_content(&content).is_err());

    let mut missing_copy = song_with_breakdown_plan();
    missing_copy["sections"][0]["roles"][0]
        .as_object_mut()
        .expect("role should be an object")
        .remove("breakdownPlan");
    let content = serde_json::to_string(&missing_copy).expect("payload should serialize");

    assert!(project_payload_from_content(&content).is_err());
}

#[test]
fn project_contract_rejects_breakdown_plan_without_source() {
    let mut payload = song_with_breakdown_plan();
    payload["sections"][0]["roles"][0]
        .as_object_mut()
        .expect("role fixture should be an object")
        .remove("breakdownPlanSource");
    let content = serde_json::to_string(&payload).expect("payload should serialize");

    assert!(project_payload_from_content(&content).is_err());
}

#[test]
fn project_contract_rejects_invalid_breakdown_plan_copy() {
    for breakdown_plan in [
        "",
        "   ",
        "\u{0009}",
        "\u{000B}",
        "\u{000C}",
        "\u{000D}",
        "\u{0085}",
        "\u{00A0}",
        "\u{1680}",
        "\u{2000}",
        "\u{200A}",
        "\u{2028}",
        "\u{2029}",
        "\u{202F}",
        "\u{205F}",
        "\u{3000}",
        "\u{FEFF}",
        "hold\nthen drop",
        "hold\rthen drop",
        "hold\u{0085}then drop",
        "hold\u{2028}then drop",
        "hold\u{2029}then drop",
    ] {
        let mut payload = song_with_breakdown_plan();
        payload["sections"][0]["roles"][0]["breakdownPlan"] = json!(breakdown_plan);
        let content = serde_json::to_string(&payload).expect("payload should serialize");

        assert!(project_payload_from_content(&content).is_err());
    }
}

#[test]
fn project_contract_accepts_unicode_padded_single_line_breakdown_plan() {
    let mut payload = song_with_breakdown_plan();
    payload["sections"][0]["roles"][0]["breakdownPlan"] =
        json!("\u{FEFF} Hold this breakdown; keep it sparse until the drop.\u{3000}");
    let content = serde_json::to_string(&payload).expect("payload should serialize");

    assert!(project_payload_from_content(&content).is_ok());
}

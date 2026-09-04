use bandscope_desktop_core::project_payload_from_content;
use serde_json::{json, Value};

fn song_with_pickup_plan() -> Value {
    json!({
        "id": "analyzed-song",
        "title": "Late Night Set",
        "sections": [{
            "id": "verse-1",
            "label": "verse",
            "groove": "Rest into the downbeat",
            "timeRange": { "start": 0, "end": 30 },
            "confidence": {
                "level": "high",
                "source": "model",
                "notes": "The pickup is supported by the active-part transition."
            },
            "roles": [{
                "id": "bass-guitar",
                "name": "Bass Guitar",
                "roleType": "instrument",
                "harmony": {
                    "chord": "C#m7",
                    "functionLabel": "vi pedal anchor",
                    "source": "model"
                },
                "harmonicExplanation": "The bass holds the tonal floor into the downbeat.",
                "cue": {
                    "kind": "transition",
                    "value": "Hold through the pickup before the downbeat."
                },
                "range": {
                    "lowestNote": "C#2",
                    "highestNote": "E3"
                },
                "confidence": {
                    "level": "medium",
                    "source": "model",
                    "notes": "Watch the slide into the turnaround."
                },
                "rehearsalPriority": "high",
                "simplification": "Stay on roots if the entrance gets muddy.",
                "setupNote": "Keep the attack short.",
                "transpositionPlan": "Move the shape down a whole step if needed.",
                "pickupPlan": "Play this pickup with Lead Vocal; land the downbeat together.",
                "pickupPlanSource": "model",
                "manualOverrides": [],
                "overlapWarnings": [],
                "transcription": [{
                    "pitch": "C#2",
                    "onset": 29.0,
                    "offset": 29.5,
                    "velocity": 0.8
                }],
                "practiceProgress": 50
            }],
            "partGraph": [{
                "role_id": "bass-guitar",
                "is_active": true,
                "handoff_to": [],
                "handoff_from": []
            }]
        }],
        "exportSummary": {
            "format": "cue-sheet",
            "headline": "Land the downbeat together.",
            "focusSections": ["verse-1"]
        }
    })
}

#[test]
fn project_contract_round_trips_pickup_plan_and_shared_role_fields() {
    let payload = song_with_pickup_plan();
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    let parsed = project_payload_from_content(&content)
        .expect("native project contract must accept shared pickup-plan fields");
    let serialized =
        serde_json::to_value(parsed).expect("native project contract should serialize");
    let role = &serialized["sections"][0]["roles"][0];

    for field in [
        "harmonicExplanation",
        "transpositionPlan",
        "pickupPlan",
        "pickupPlanSource",
        "transcription",
        "practiceProgress",
    ] {
        assert_eq!(role[field], payload["sections"][0]["roles"][0][field]);
    }
}

#[test]
fn project_contract_rejects_pickup_plan_source_without_copy() {
    let mut payload = song_with_pickup_plan();
    payload["sections"][0]["roles"][0]
        .as_object_mut()
        .expect("role fixture should be an object")
        .remove("pickupPlan");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(project_payload_from_content(&content).is_err());
}

#[test]
fn project_contract_rejects_pickup_plan_without_source() {
    let mut payload = song_with_pickup_plan();
    payload["sections"][0]["roles"][0]
        .as_object_mut()
        .expect("role fixture should be an object")
        .remove("pickupPlanSource");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(project_payload_from_content(&content).is_err());
}

#[test]
fn project_contract_rejects_invalid_pickup_plan_copy() {
    for pickup_plan in [
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
        "land here\nthen hold",
        "land here\rthen hold",
        "land here\u{0085}then hold",
        "land here\u{2028}then hold",
        "land here\u{2029}then hold",
    ] {
        let mut payload = song_with_pickup_plan();
        payload["sections"][0]["roles"][0]["pickupPlan"] = json!(pickup_plan);
        let content = serde_json::to_string(&payload).expect("fixture should serialize");

        assert!(project_payload_from_content(&content).is_err());
    }
}

#[test]
fn project_contract_accepts_unicode_padded_single_line_pickup_plan() {
    let mut payload = song_with_pickup_plan();
    payload["sections"][0]["roles"][0]["pickupPlan"] = json!("\u{FEFF} Land the downbeat \u{3000}");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(project_payload_from_content(&content).is_ok());
}

#[test]
fn project_contract_rejects_unknown_pickup_plan_source() {
    let mut payload = song_with_pickup_plan();
    payload["sections"][0]["roles"][0]["pickupPlanSource"] = json!("legacy");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(project_payload_from_content(&content).is_err());
}

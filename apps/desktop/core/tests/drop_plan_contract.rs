use bandscope_desktop_core::project_payload_from_content;
use serde_json::{json, Value};

fn song_with_drop_plan() -> Value {
    json!({
        "id": "analyzed-song",
        "title": "Late Night Set",
        "sections": [
            {
                "id": "chorus-1",
                "label": "chorus",
                "groove": "Filled chorus downbeat",
                "timeRange": { "start": 30, "end": 46 },
                "confidence": {
                    "level": "high",
                    "source": "model",
                    "notes": "Stem activity corroborates the drop."
                },
                "roles": [
                    {
                        "id": "lead-vocal",
                        "name": "Lead Vocal",
                        "roleType": "vocal",
                        "harmony": {
                            "chord": "C#m7",
                            "functionLabel": "vi landing",
                            "source": "model"
                        },
                        "cue": {
                            "kind": "transition",
                            "value": "Come in on the filled chorus."
                        },
                        "range": {
                            "lowestNote": "G#3",
                            "highestNote": "C#5"
                        },
                        "confidence": {
                            "level": "high",
                            "source": "model",
                            "notes": "Vocal enters when the texture fills."
                        },
                        "rehearsalPriority": "high",
                        "simplification": "Hold the landing syllable.",
                        "setupNote": "Keep the attack short.",
                        "manualOverrides": [],
                        "overlapWarnings": [],
                        "dropPlan": "Hit this drop; come in together when the texture fills.",
                        "dropPlanSource": "model"
                    }
                ],
                "partGraph": [
                    {
                        "role_id": "lead-vocal",
                        "is_active": true,
                        "handoff_to": [],
                        "handoff_from": []
                    }
                ]
            }
        ],
        "exportSummary": {
            "format": "cue-sheet",
            "headline": "Land the chorus drop together.",
            "focusSections": ["chorus-1"]
        }
    })
}

#[test]
fn project_contract_round_trips_drop_plan_provenance() {
    let payload = song_with_drop_plan();
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    let parsed = project_payload_from_content(&content)
        .expect("native project contract must accept shared drop-plan fields");
    let serialized = serde_json::to_value(parsed).expect("native project contract should serialize");

    assert_eq!(
        serialized["sections"][0]["roles"][0]["dropPlan"],
        payload["sections"][0]["roles"][0]["dropPlan"]
    );
    assert_eq!(
        serialized["sections"][0]["roles"][0]["dropPlanSource"],
        json!("model")
    );
}

#[test]
fn project_contract_round_trips_optional_shared_role_fields() {
    let mut payload = song_with_drop_plan();
    let role = payload["sections"][0]["roles"][0]
        .as_object_mut()
        .expect("role fixture should be an object");
    role.insert(
        "harmonicExplanation".into(),
        json!("The leading tone resolves into the chorus tonic."),
    );
    role.insert(
        "transpositionPlan".into(),
        json!("Move the line down a whole step if the vocal sits high."),
    );
    role.insert(
        "transcription".into(),
        json!([{
            "pitch": "C#4",
            "onset": 30.0,
            "offset": 30.5,
            "velocity": 96.0
        }]),
    );
    role.insert("practiceProgress".into(), json!(75));
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    let parsed = project_payload_from_content(&content)
        .expect("native project contract must accept optional shared role fields");
    let serialized = serde_json::to_value(parsed).expect("native project contract should serialize");
    let serialized_role = &serialized["sections"][0]["roles"][0];

    for field in [
        "harmonicExplanation",
        "transpositionPlan",
        "transcription",
        "practiceProgress",
    ] {
        assert_eq!(serialized_role[field], payload["sections"][0]["roles"][0][field]);
    }
}

#[test]
fn project_contract_rejects_practice_progress_outside_shared_range() {
    let mut payload = song_with_drop_plan();
    payload["sections"][0]["roles"][0]["practiceProgress"] = json!(101);
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must enforce the shared 0..=100 practice-progress range"
    );
}

#[test]
fn project_contract_rejects_drop_plan_source_without_drop_plan() {
    let mut payload = song_with_drop_plan();
    payload["sections"][0]["roles"][0]
        .as_object_mut()
        .expect("role fixture should be an object")
        .remove("dropPlan");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject provenance without the value it describes"
    );
}

#[test]
fn project_contract_rejects_invalid_drop_plan_copy_with_source() {
    for drop_plan in ["", "   ", "land here\nthen hold", "land here\rthen hold"] {
        let mut payload = song_with_drop_plan();
        payload["sections"][0]["roles"][0]["dropPlan"] = json!(drop_plan);
        let content = serde_json::to_string(&payload).expect("fixture should serialize");

        assert!(
            project_payload_from_content(&content).is_err(),
            "native persisted contract must reject blank or multiline sourced drop-plan copy"
        );
    }
}

#[test]
fn project_contract_rejects_unknown_drop_plan_source() {
    let mut payload = song_with_drop_plan();
    payload["sections"][0]["roles"][0]["dropPlanSource"] = json!("legacy");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject provenance outside model/user"
    );
}

use bandscope_desktop_core::project_payload_from_content;
use serde_json::{json, Value};

fn song_with_fade_plan() -> Value {
    json!({
        "id": "analyzed-song",
        "title": "Late Night Set",
        "sections": [
            {
                "id": "chorus-1",
                "label": "chorus",
                "groove": "Lifted chorus downbeat",
                "timeRange": { "start": 30, "end": 46 },
                "confidence": {
                    "level": "high",
                    "source": "model",
                    "notes": "Stem energy corroborates the fade."
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
                            "value": "Let the next downbeat land quieter."
                        },
                        "range": {
                            "lowestNote": "G#3",
                            "highestNote": "C#5"
                        },
                        "confidence": {
                            "level": "high",
                            "source": "model",
                            "notes": "Vocal stays while the level comes down."
                        },
                        "rehearsalPriority": "high",
                        "simplification": "Hold the landing syllable.",
                        "setupNote": "Keep the attack short.",
                        "manualOverrides": [],
                        "overlapWarnings": [],
                        "fadePlan": "Fade this part; let the next downbeat land quieter.",
                        "fadePlanSource": "model"
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
            "headline": "Let the chorus fade together.",
            "focusSections": ["chorus-1"]
        }
    })
}

#[test]
fn project_contract_round_trips_fade_plan_provenance() {
    let payload = song_with_fade_plan();
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    let parsed = project_payload_from_content(&content)
        .expect("native project contract must accept shared fade-plan fields");
    let serialized = serde_json::to_value(parsed).expect("native project contract should serialize");

    assert_eq!(
        serialized["sections"][0]["roles"][0]["fadePlan"],
        payload["sections"][0]["roles"][0]["fadePlan"]
    );
    assert_eq!(
        serialized["sections"][0]["roles"][0]["fadePlanSource"],
        json!("model")
    );
}

#[test]
fn project_contract_rejects_fade_plan_source_without_fade_plan() {
    let mut payload = song_with_fade_plan();
    payload["sections"][0]["roles"][0]
        .as_object_mut()
        .expect("role fixture should be an object")
        .remove("fadePlan");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject provenance without the value it describes"
    );
}

#[test]
fn project_contract_rejects_invalid_fade_plan_copy_with_source() {
    for fade_plan in ["", "   ", "fade here\nthen hold", "fade here\rthen hold"] {
        let mut payload = song_with_fade_plan();
        payload["sections"][0]["roles"][0]["fadePlan"] = json!(fade_plan);
        let content = serde_json::to_string(&payload).expect("fixture should serialize");

        assert!(
            project_payload_from_content(&content).is_err(),
            "native persisted contract must reject blank or multiline sourced fade-plan copy"
        );
    }
}

#[test]
fn project_contract_rejects_unknown_fade_plan_source() {
    let mut payload = song_with_fade_plan();
    payload["sections"][0]["roles"][0]["fadePlanSource"] = json!("legacy");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject provenance outside model/user"
    );
}

use bandscope_desktop_core::project_payload_from_content;
use serde_json::{json, Value};

fn song_with_swell_plan() -> Value {
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
                    "notes": "Stem energy corroborates the swell."
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
                            "value": "Grow into the next downbeat."
                        },
                        "range": {
                            "lowestNote": "G#3",
                            "highestNote": "C#5"
                        },
                        "confidence": {
                            "level": "high",
                            "source": "model",
                            "notes": "Vocal stays while the lift grows."
                        },
                        "rehearsalPriority": "high",
                        "simplification": "Hold the landing syllable.",
                        "setupNote": "Keep the attack short.",
                        "manualOverrides": [],
                        "overlapWarnings": [],
                        "swellPlan": "Swell this part; grow into the next downbeat.",
                        "swellPlanSource": "model"
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
            "headline": "Grow the chorus swell together.",
            "focusSections": ["chorus-1"]
        }
    })
}

#[test]
fn project_contract_round_trips_swell_plan_provenance() {
    let payload = song_with_swell_plan();
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    let parsed = project_payload_from_content(&content)
        .expect("native project contract must accept shared swell-plan fields");
    let serialized = serde_json::to_value(parsed).expect("native project contract should serialize");

    assert_eq!(
        serialized["sections"][0]["roles"][0]["swellPlan"],
        payload["sections"][0]["roles"][0]["swellPlan"]
    );
    assert_eq!(
        serialized["sections"][0]["roles"][0]["swellPlanSource"],
        json!("model")
    );
}

#[test]
fn project_contract_rejects_swell_plan_source_without_swell_plan() {
    let mut payload = song_with_swell_plan();
    payload["sections"][0]["roles"][0]
        .as_object_mut()
        .expect("role fixture should be an object")
        .remove("swellPlan");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject provenance without the value it describes"
    );
}

#[test]
fn project_contract_rejects_swell_plan_without_source() {
    let mut payload = song_with_swell_plan();
    payload["sections"][0]["roles"][0]
        .as_object_mut()
        .expect("role fixture should be an object")
        .remove("swellPlanSource");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject swell-plan copy without provenance"
    );
}

#[test]
fn project_contract_rejects_invalid_swell_plan_copy_with_source() {
    for swell_plan in ["", "   ", "swell here\nthen hold", "swell here\rthen hold"] {
        let mut payload = song_with_swell_plan();
        payload["sections"][0]["roles"][0]["swellPlan"] = json!(swell_plan);
        let content = serde_json::to_string(&payload).expect("fixture should serialize");

        assert!(
            project_payload_from_content(&content).is_err(),
            "native persisted contract must reject blank or multiline sourced swell-plan copy"
        );
    }
}

#[test]
fn project_contract_rejects_unknown_swell_plan_source() {
    let mut payload = song_with_swell_plan();
    payload["sections"][0]["roles"][0]["swellPlanSource"] = json!("legacy");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject provenance outside model/user"
    );
}

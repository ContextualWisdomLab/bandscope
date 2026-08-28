use bandscope_desktop_core::project_payload_from_content;
use serde_json::{json, Value};

fn song_with_ritardando_plan() -> Value {
    json!({
        "id": "analyzed-song",
        "title": "Late Night Set",
        "sections": [
            {
                "id": "chorus-1",
                "label": "chorus",
                "groove": "Lifted chorus downbeat",
                "timeRange": { "start": 0, "end": 16 },
                "confidence": {
                    "level": "high",
                    "source": "model",
                    "notes": "Tempo stability corroborates the ritardando."
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
                            "value": "Let the next downbeat land later."
                        },
                        "range": {
                            "lowestNote": "G#3",
                            "highestNote": "C#5"
                        },
                        "confidence": {
                            "level": "high",
                            "source": "model",
                            "notes": "Vocal stays while the tempo eases."
                        },
                        "rehearsalPriority": "high",
                        "simplification": "Hold the landing syllable.",
                        "setupNote": "Keep the attack short.",
                        "manualOverrides": [],
                        "overlapWarnings": [],
                        "ritardandoPlan": "Ease this part from 120 BPM into 80 BPM; let the next downbeat land later.",
                        "ritardandoPlanSource": "model"
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
            "headline": "Ease into the slower chorus landing.",
            "focusSections": ["chorus-1"]
        }
    })
}

#[test]
fn project_contract_round_trips_ritardando_plan_provenance() {
    let payload = song_with_ritardando_plan();
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    let parsed = project_payload_from_content(&content)
        .expect("native project contract must accept shared ritardando-plan fields");
    let serialized = serde_json::to_value(parsed).expect("native project contract should serialize");

    assert_eq!(
        serialized["sections"][0]["roles"][0]["ritardandoPlan"],
        payload["sections"][0]["roles"][0]["ritardandoPlan"]
    );
    assert_eq!(
        serialized["sections"][0]["roles"][0]["ritardandoPlanSource"],
        json!("model")
    );
}

#[test]
fn project_contract_rejects_ritardando_plan_source_without_ritardando_plan() {
    let mut payload = song_with_ritardando_plan();
    payload["sections"][0]["roles"][0]
        .as_object_mut()
        .expect("role fixture should be an object")
        .remove("ritardandoPlan");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject provenance without the value it describes"
    );
}

#[test]
fn project_contract_rejects_invalid_ritardando_plan_copy_with_source() {
    for ritardando_plan in ["", "   ", "ease here\nthen hold", "ease here\rthen hold"] {
        let mut payload = song_with_ritardando_plan();
        payload["sections"][0]["roles"][0]["ritardandoPlan"] = json!(ritardando_plan);
        let content = serde_json::to_string(&payload).expect("fixture should serialize");

        assert!(
            project_payload_from_content(&content).is_err(),
            "native persisted contract must reject blank or multiline sourced ritardando-plan copy"
        );
    }
}

#[test]
fn project_contract_rejects_unknown_ritardando_plan_source() {
    let mut payload = song_with_ritardando_plan();
    payload["sections"][0]["roles"][0]["ritardandoPlanSource"] = json!("legacy");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject provenance outside model/user"
    );
}

use bandscope_desktop_core::project_payload_from_content;
use serde_json::{json, Value};

fn song_with_accelerando_plan() -> Value {
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
                    "notes": "Tempo stability corroborates the accelerando."
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
                        "harmonicExplanation": "The landing keeps the tonal floor clear.",
                        "cue": {
                            "kind": "transition",
                            "value": "Let the next downbeat arrive sooner."
                        },
                        "range": {
                            "lowestNote": "G#3",
                            "highestNote": "C#5"
                        },
                        "confidence": {
                            "level": "high",
                            "source": "model",
                            "notes": "Vocal stays while the tempo lifts."
                        },
                        "rehearsalPriority": "high",
                        "simplification": "Lean into the landing syllable.",
                        "setupNote": "Keep the attack short.",
                        "transpositionPlan": "Keep the landing shape a whole step lower if needed.",
                        "manualOverrides": [],
                        "overlapWarnings": [],
                        "transcription": [{
                            "pitch": "C#4",
                            "onset": 1.0,
                            "offset": 1.5,
                            "velocity": 0.8
                        }],
                        "practiceProgress": 50,
                        "accelerandoPlan": "Push this part from 80 BPM into 120 BPM; let the next downbeat arrive sooner.",
                        "accelerandoPlanSource": "model"
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
            "headline": "Push into the faster chorus landing.",
            "focusSections": ["chorus-1"]
        }
    })
}

#[test]
fn project_contract_round_trips_accelerando_plan_provenance() {
    let payload = song_with_accelerando_plan();
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    let parsed = project_payload_from_content(&content)
        .expect("native project contract must accept shared accelerando-plan fields");
    let serialized =
        serde_json::to_value(parsed).expect("native project contract should serialize");

    assert_eq!(
        serialized["sections"][0]["roles"][0]["accelerandoPlan"],
        payload["sections"][0]["roles"][0]["accelerandoPlan"]
    );
    assert_eq!(
        serialized["sections"][0]["roles"][0]["accelerandoPlanSource"],
        json!("model")
    );
}

#[test]
fn project_contract_rejects_accelerando_plan_source_without_accelerando_plan() {
    let mut payload = song_with_accelerando_plan();
    payload["sections"][0]["roles"][0]
        .as_object_mut()
        .expect("role fixture should be an object")
        .remove("accelerandoPlan");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject provenance without the value it describes"
    );
}

#[test]
fn project_contract_rejects_accelerando_plan_without_source() {
    let mut payload = song_with_accelerando_plan();
    payload["sections"][0]["roles"][0]
        .as_object_mut()
        .expect("role fixture should be an object")
        .remove("accelerandoPlanSource");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject accelerando-plan copy without provenance"
    );
}

#[test]
fn project_contract_rejects_invalid_accelerando_plan_copy_with_source() {
    for accelerando_plan in [
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
        "push here\nthen hold",
        "push here\rthen hold",
        "push here\u{0085}then hold",
        "push here\u{2028}then hold",
        "push here\u{2029}then hold",
    ] {
        let mut payload = song_with_accelerando_plan();
        payload["sections"][0]["roles"][0]["accelerandoPlan"] = json!(accelerando_plan);
        let content = serde_json::to_string(&payload).expect("fixture should serialize");

        assert!(
            project_payload_from_content(&content).is_err(),
            "native persisted contract must reject blank or multiline sourced accelerando-plan copy"
        );
    }
}

#[test]
fn project_contract_accepts_unicode_padded_single_line_accelerando_plan() {
    let mut payload = song_with_accelerando_plan();
    payload["sections"][0]["roles"][0]["accelerandoPlan"] = json!(
        "\u{FEFF} Push this part from 80 BPM into 120 BPM; let the next downbeat arrive sooner.\u{3000}"
    );
    let content = serde_json::to_string(&payload).expect("payload should serialize");

    assert!(project_payload_from_content(&content).is_ok());
}

#[test]
fn project_contract_rejects_unknown_accelerando_plan_source() {
    let mut payload = song_with_accelerando_plan();
    payload["sections"][0]["roles"][0]["accelerandoPlanSource"] = json!("legacy");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject provenance outside model/user"
    );
}

#[test]
fn project_contract_rejects_practice_progress_above_shared_bound() {
    let mut payload = song_with_accelerando_plan();
    payload["sections"][0]["roles"][0]["practiceProgress"] = json!(101);
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject practiceProgress above the shared 0..=100 bound"
    );
}

use bandscope_desktop_core::project_payload_from_content;
use serde_json::{json, Value};

fn song_with_fermata_plan() -> Value {
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
                    "notes": "An isolated beat-gap hold corroborates the fermata."
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
                            "value": "Wait for the cutoff before the next entrance."
                        },
                        "range": {
                            "lowestNote": "G#3",
                            "highestNote": "C#5"
                        },
                        "confidence": {
                            "level": "high",
                            "source": "model",
                            "notes": "Vocal stays through the held landing."
                        },
                        "rehearsalPriority": "high",
                        "simplification": "Lean into the landing syllable.",
                        "setupNote": "Keep the attack short.",
                        "manualOverrides": [],
                        "overlapWarnings": [],
                        "fermataPlan": "Hold this part through the extra 1 s; wait for the cutoff before the next entrance.",
                        "fermataPlanSource": "model"
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
            "headline": "Hold the chorus fermata until the cutoff.",
            "focusSections": ["chorus-1"]
        }
    })
}

#[test]
fn project_contract_round_trips_fermata_plan_provenance() {
    let payload = song_with_fermata_plan();
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    let parsed = project_payload_from_content(&content)
        .expect("native project contract must accept shared fermata-plan fields");
    let serialized = serde_json::to_value(parsed).expect("native project contract should serialize");

    assert_eq!(
        serialized["sections"][0]["roles"][0]["fermataPlan"],
        payload["sections"][0]["roles"][0]["fermataPlan"]
    );
    assert_eq!(
        serialized["sections"][0]["roles"][0]["fermataPlanSource"],
        json!("model")
    );
}

#[test]
fn project_contract_rejects_fermata_plan_source_without_fermata_plan() {
    let mut payload = song_with_fermata_plan();
    payload["sections"][0]["roles"][0]
        .as_object_mut()
        .expect("role fixture should be an object")
        .remove("fermataPlan");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject provenance without the value it describes"
    );
}

#[test]
fn project_contract_rejects_fermata_plan_without_source() {
    let mut payload = song_with_fermata_plan();
    payload["sections"][0]["roles"][0]
        .as_object_mut()
        .expect("role fixture should be an object")
        .remove("fermataPlanSource");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject fermata-plan copy without provenance"
    );
}

#[test]
fn project_contract_rejects_invalid_fermata_plan_copy_with_source() {
    for fermata_plan in ["", "   ", "hold here\nthen cut", "hold here\rthen cut"] {
        let mut payload = song_with_fermata_plan();
        payload["sections"][0]["roles"][0]["fermataPlan"] = json!(fermata_plan);
        let content = serde_json::to_string(&payload).expect("fixture should serialize");

        assert!(
            project_payload_from_content(&content).is_err(),
            "native persisted contract must reject blank or multiline sourced fermata-plan copy"
        );
    }
}

#[test]
fn project_contract_rejects_unknown_fermata_plan_source() {
    let mut payload = song_with_fermata_plan();
    payload["sections"][0]["roles"][0]["fermataPlanSource"] = json!("legacy");
    let content = serde_json::to_string(&payload).expect("fixture should serialize");

    assert!(
        project_payload_from_content(&content).is_err(),
        "native persisted contract must reject provenance outside model/user"
    );
}

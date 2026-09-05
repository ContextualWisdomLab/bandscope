use bandscope_desktop_core::project_payload_from_content;
use serde_json::{json, Value};

fn current_rehearsal_song() -> Value {
    json!({
        "id": "demo-song",
        "title": "Late Night Set",
        "tempo": 120,
        "sections": [
            {
                "id": "verse-1",
                "label": "verse",
                "groove": "Straight eighths with a late snare feel",
                "timeRange": { "start": 10, "end": 30 },
                "confidence": {
                    "level": "medium",
                    "source": "model",
                    "notes": "Double-check the pickup into the chorus."
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
                        "harmonicExplanation": "The bass holds the tonal floor through the pickup.",
                        "cue": {
                            "kind": "transition",
                            "value": "Hold through the pickup before the downbeat."
                        },
                        "range": { "lowestNote": "C#2", "highestNote": "E3" },
                        "confidence": {
                            "level": "medium",
                            "source": "model",
                            "notes": "Watch the slide into the turnaround."
                        },
                        "rehearsalPriority": "high",
                        "simplification": "Stay on roots if the chorus entrance gets muddy.",
                        "setupNote": "Keep the attack short so the verse breathes.",
                        "transpositionPlan": "Move the shape down a whole step if the singer changes key.",
                        "manualOverrides": [],
                        "overlapWarnings": [],
                        "transcription": [
                            { "pitch": "C#2", "onset": 10.0, "offset": 10.5, "velocity": 0.8 }
                        ],
                        "practiceProgress": 45
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
            "headline": "Start with the verse handoff and low-register overlap.",
            "focusSections": ["verse-1"]
        },
        "collaboration": {
            "syncMode": "local_only",
            "syncNote": "Keep rehearsal coordination on this device.",
            "assignments": [
                {
                    "id": "assign-bass",
                    "assignee": "Rhythm Section",
                    "summary": "Lock the pickup.",
                    "sectionId": "verse-1",
                    "roleId": "bass-guitar",
                    "status": "in_progress"
                }
            ],
            "comments": [
                {
                    "id": "comment-bass",
                    "author": "MD",
                    "body": "Keep the attack short.",
                    "sectionId": "verse-1",
                    "roleId": "bass-guitar",
                    "status": "open"
                }
            ],
            "approvals": [
                {
                    "id": "approval-bass",
                    "scope": "Verse rhythm pass",
                    "owner": "MD",
                    "status": "pending"
                }
            ]
        }
    })
}

#[test]
fn project_persistence_round_trips_current_shared_song_fields() {
    let content = serde_json::to_string(&current_rehearsal_song())
        .expect("current rehearsal song should serialize");

    let parsed = project_payload_from_content(&content)
        .expect("native project persistence must accept the current shared rehearsal song contract");
    let round_trip = serde_json::to_value(parsed)
        .expect("native project payload should serialize back to renderer JSON");

    assert_eq!(round_trip["tempo"], json!(120.0));
    assert_eq!(
        round_trip["sections"][0]["roles"][0]["harmonicExplanation"],
        json!("The bass holds the tonal floor through the pickup.")
    );
    assert_eq!(
        round_trip["sections"][0]["roles"][0]["transpositionPlan"],
        json!("Move the shape down a whole step if the singer changes key.")
    );
    assert_eq!(
        round_trip["sections"][0]["roles"][0]["transcription"][0]["pitch"],
        json!("C#2")
    );
    assert_eq!(
        round_trip["sections"][0]["roles"][0]["practiceProgress"],
        json!(45)
    );
    assert_eq!(
        round_trip["collaboration"]["assignments"][0]["roleId"],
        json!("bass-guitar")
    );
}

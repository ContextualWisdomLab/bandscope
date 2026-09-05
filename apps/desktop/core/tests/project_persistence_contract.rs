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
                        "manualOverrides": [
                            {
                                "field": "harmony",
                                "value": {
                                    "chord": "C#m7",
                                    "functionLabel": "vi pedal anchor",
                                    "source": "user"
                                },
                                "source": "user"
                            }
                        ],
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
    assert_eq!(round_trip["sections"][0]["roles"][0]["harmonicExplanation"], json!("The bass holds the tonal floor through the pickup."));
    assert_eq!(round_trip["sections"][0]["roles"][0]["transpositionPlan"], json!("Move the shape down a whole step if the singer changes key."));
    assert_eq!(round_trip["sections"][0]["roles"][0]["transcription"][0]["pitch"], json!("C#2"));
    assert_eq!(round_trip["sections"][0]["roles"][0]["practiceProgress"], json!(45));
    assert_eq!(round_trip["sections"][0]["roles"][0]["manualOverrides"][0]["source"], json!("user"));
    assert_eq!(round_trip["collaboration"]["assignments"][0]["roleId"], json!("bass-guitar"));
}

#[test]
fn project_persistence_rejects_invalid_shared_collaboration_states_and_progress() {
    let mut invalid_sync_mode = current_rehearsal_song();
    invalid_sync_mode["collaboration"]["syncMode"] = json!("cloud_now");
    assert!(project_payload_from_content(&invalid_sync_mode.to_string()).is_err());

    let mut invalid_assignment_status = current_rehearsal_song();
    invalid_assignment_status["collaboration"]["assignments"][0]["status"] = json!("done");
    assert!(project_payload_from_content(&invalid_assignment_status.to_string()).is_err());

    let mut invalid_comment_status = current_rehearsal_song();
    invalid_comment_status["collaboration"]["comments"][0]["status"] = json!("archived");
    assert!(project_payload_from_content(&invalid_comment_status.to_string()).is_err());

    let mut invalid_approval_status = current_rehearsal_song();
    invalid_approval_status["collaboration"]["approvals"][0]["status"] = json!("rejected");
    assert!(project_payload_from_content(&invalid_approval_status.to_string()).is_err());

    let mut invalid_practice_progress = current_rehearsal_song();
    invalid_practice_progress["sections"][0]["roles"][0]["practiceProgress"] = json!(101);
    assert!(project_payload_from_content(&invalid_practice_progress.to_string()).is_err());
}

#[test]
fn project_persistence_accepts_all_shared_closed_domain_tokens() {
    for label in [
        "intro",
        "verse",
        "pre-chorus",
        "chorus",
        "bridge",
        "outro",
        "tag",
        "pickup",
        "stop",
        "handoff",
    ] {
        let mut song = current_rehearsal_song();
        song["sections"][0]["label"] = json!(label);
        assert!(
            project_payload_from_content(&song.to_string()).is_ok(),
            "shared section label {label} should remain loadable"
        );
    }

    for level in ["low", "medium", "high"] {
        let mut section_song = current_rehearsal_song();
        section_song["sections"][0]["confidence"]["level"] = json!(level);
        assert!(project_payload_from_content(&section_song.to_string()).is_ok());

        let mut role_song = current_rehearsal_song();
        role_song["sections"][0]["roles"][0]["confidence"]["level"] = json!(level);
        assert!(project_payload_from_content(&role_song.to_string()).is_ok());
    }

    for source in ["model", "user"] {
        let mut confidence_song = current_rehearsal_song();
        confidence_song["sections"][0]["confidence"]["source"] = json!(source);
        assert!(project_payload_from_content(&confidence_song.to_string()).is_ok());

        let mut harmony_song = current_rehearsal_song();
        harmony_song["sections"][0]["roles"][0]["harmony"]["source"] = json!(source);
        assert!(project_payload_from_content(&harmony_song.to_string()).is_ok());
    }

    for role_type in ["instrument", "vocal", "hand"] {
        let mut song = current_rehearsal_song();
        song["sections"][0]["roles"][0]["roleType"] = json!(role_type);
        assert!(project_payload_from_content(&song.to_string()).is_ok());
    }

    for cue_kind in ["lyric", "count", "transition"] {
        let mut song = current_rehearsal_song();
        song["sections"][0]["roles"][0]["cue"]["kind"] = json!(cue_kind);
        assert!(project_payload_from_content(&song.to_string()).is_ok());
    }

    for priority in ["low", "medium", "high"] {
        let mut song = current_rehearsal_song();
        song["sections"][0]["roles"][0]["rehearsalPriority"] = json!(priority);
        assert!(project_payload_from_content(&song.to_string()).is_ok());
    }

    for format in ["cue-sheet", "chart-summary"] {
        let mut song = current_rehearsal_song();
        song["exportSummary"]["format"] = json!(format);
        assert!(project_payload_from_content(&song.to_string()).is_ok());
    }
}

#[test]
fn project_persistence_rejects_invalid_shared_closed_domains() {
    let mut invalid_section_label = current_rehearsal_song();
    invalid_section_label["sections"][0]["label"] = json!("solo");
    assert!(project_payload_from_content(&invalid_section_label.to_string()).is_err());

    let mut invalid_section_confidence_level = current_rehearsal_song();
    invalid_section_confidence_level["sections"][0]["confidence"]["level"] = json!("certain");
    assert!(project_payload_from_content(&invalid_section_confidence_level.to_string()).is_err());

    let mut invalid_section_confidence_source = current_rehearsal_song();
    invalid_section_confidence_source["sections"][0]["confidence"]["source"] = json!("imported");
    assert!(project_payload_from_content(&invalid_section_confidence_source.to_string()).is_err());

    let mut invalid_role_type = current_rehearsal_song();
    invalid_role_type["sections"][0]["roles"][0]["roleType"] = json!("guitar");
    assert!(project_payload_from_content(&invalid_role_type.to_string()).is_err());

    let mut invalid_harmony_source = current_rehearsal_song();
    invalid_harmony_source["sections"][0]["roles"][0]["harmony"]["source"] = json!("imported");
    assert!(project_payload_from_content(&invalid_harmony_source.to_string()).is_err());

    let mut invalid_cue_kind = current_rehearsal_song();
    invalid_cue_kind["sections"][0]["roles"][0]["cue"]["kind"] = json!("bar");
    assert!(project_payload_from_content(&invalid_cue_kind.to_string()).is_err());

    let mut invalid_role_confidence_level = current_rehearsal_song();
    invalid_role_confidence_level["sections"][0]["roles"][0]["confidence"]["level"] = json!("certain");
    assert!(project_payload_from_content(&invalid_role_confidence_level.to_string()).is_err());

    let mut invalid_rehearsal_priority = current_rehearsal_song();
    invalid_rehearsal_priority["sections"][0]["roles"][0]["rehearsalPriority"] = json!("urgent");
    assert!(project_payload_from_content(&invalid_rehearsal_priority.to_string()).is_err());

    let mut invalid_export_format = current_rehearsal_song();
    invalid_export_format["exportSummary"]["format"] = json!("pdf");
    assert!(project_payload_from_content(&invalid_export_format.to_string()).is_err());

    let mut invalid_override_field = current_rehearsal_song();
    invalid_override_field["sections"][0]["roles"][0]["manualOverrides"][0]["field"] = json!("tempo");
    assert!(project_payload_from_content(&invalid_override_field.to_string()).is_err());

    let mut invalid_override_source = current_rehearsal_song();
    invalid_override_source["sections"][0]["roles"][0]["manualOverrides"][0]["source"] = json!("model");
    assert!(project_payload_from_content(&invalid_override_source.to_string()).is_err());

    let mut invalid_override_value_source = current_rehearsal_song();
    invalid_override_value_source["sections"][0]["roles"][0]["manualOverrides"][0]["value"]["source"] = json!("model");
    assert!(project_payload_from_content(&invalid_override_value_source.to_string()).is_err());
}

#[test]
fn project_persistence_rejects_explicit_null_for_optional_shared_fields() {
    let mut null_collaboration = current_rehearsal_song();
    null_collaboration["collaboration"] = Value::Null;
    assert!(project_payload_from_content(&null_collaboration.to_string()).is_err());

    let mut null_score_attachments = current_rehearsal_song();
    null_score_attachments["scoreAttachments"] = Value::Null;
    assert!(project_payload_from_content(&null_score_attachments.to_string()).is_err());

    let mut null_assignment_role = current_rehearsal_song();
    null_assignment_role["collaboration"]["assignments"][0]["roleId"] = Value::Null;
    assert!(project_payload_from_content(&null_assignment_role.to_string()).is_err());

    let mut null_comment_role = current_rehearsal_song();
    null_comment_role["collaboration"]["comments"][0]["roleId"] = Value::Null;
    assert!(project_payload_from_content(&null_comment_role.to_string()).is_err());

    for field in ["harmonicExplanation", "transpositionPlan", "transcription"] {
        let mut null_role_field = current_rehearsal_song();
        null_role_field["sections"][0]["roles"][0][field] = Value::Null;
        assert!(project_payload_from_content(&null_role_field.to_string()).is_err());
    }
}
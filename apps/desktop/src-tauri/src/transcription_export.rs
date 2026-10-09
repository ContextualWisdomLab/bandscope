//! Native destination consent for the MIDI retained from a verified transcription.

use bandscope_desktop_core::{write_midi_atomically, TranscriptionExportState};
use rfd::FileDialog;
use std::path::Path;

/// Derive a portable default filename without granting authority from its source label.
fn default_midi_name(source_label: &str) -> String {
    let stem = Path::new(source_label)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("recording");
    let mut name = String::new();
    for character in stem.chars() {
        let character = if character.is_control()
            || matches!(
                character,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
            )
            || ('\u{202a}'..='\u{202e}').contains(&character)
            || ('\u{2066}'..='\u{2069}').contains(&character)
        {
            '_'
        } else {
            character
        };
        if name.len() + character.len_utf8() > 200 {
            break;
        }
        name.push(character);
    }
    let name = name.trim_matches(|character: char| character == '.' || character.is_whitespace());
    let device_name = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let reserved = matches!(device_name.as_str(), "con" | "prn" | "aux" | "nul")
        || (device_name.len() == 4
            && (device_name.starts_with("com") || device_name.starts_with("lpt"))
            && matches!(device_name.as_bytes()[3], b'1'..=b'9'));
    format!(
        "{}-draft.mid",
        if name.is_empty() || reserved {
            "recording"
        } else {
            name
        }
    )
}

/// Save the matching native draft to an OS-selected MIDI file and report actual completion.
#[tauri::command]
pub async fn save_transcription_midi(
    expected_midi_base64: String,
    state: tauri::State<'_, TranscriptionExportState>,
) -> Result<bool, String> {
    let lease = state.begin(&expected_midi_base64).map_err(str::to_string)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(destination) = FileDialog::new()
            .set_title("Save MIDI draft")
            .add_filter("MIDI", &["mid", "midi"])
            .set_file_name(default_midi_name(lease.source_label()))
            .save_file()
        else {
            return Ok(false);
        };
        if !destination
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                extension.eq_ignore_ascii_case("mid") || extension.eq_ignore_ascii_case("midi")
            })
        {
            return Err("transcription_export_invalid".into());
        }
        write_midi_atomically(&destination, lease.bytes()).map_err(str::to_string)?;
        Ok(true)
    })
    .await
    .map_err(|_| "transcription_export_failed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_names_are_portable_bounded_and_keep_recording_identity() {
        assert_eq!(
            default_midi_name("guitar phrase.wav"),
            "guitar phrase-draft.mid"
        );
        assert_eq!(
            default_midi_name("voice:<take>.flac"),
            "voice__take_-draft.mid"
        );
        assert_eq!(default_midi_name("CON.wav"), "recording-draft.mid");
        assert_eq!(default_midi_name("com1.part.wav"), "recording-draft.mid");
        assert_eq!(default_midi_name("... .wav"), "recording-draft.mid");
        assert_eq!(default_midi_name("take\u{202e}.wav"), "take_-draft.mid");
        assert!(default_midi_name(&format!("{}.wav", "녹음".repeat(100))).len() <= 210);
    }
}

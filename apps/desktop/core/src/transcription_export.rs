//! Export only the MIDI retained from a verified native transcription result.

use crate::TranscriptionDraft;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};

const MAX_MIDI_BYTES: usize = 256 * 1024;
const MAX_EXPECTED_BASE64_BYTES: usize = 350_000;
const EXPORT_INVALID: &str = "transcription_export_invalid";
const EXPORT_FAILED: &str = "transcription_export_failed";
static NEXT_TEMPORARY: AtomicU64 = AtomicU64::new(0);

struct CachedMidi {
    encoded: String,
    bytes: Vec<u8>,
    source_label: String,
}

#[derive(Default)]
struct ExportSlot {
    cached: Option<Arc<CachedMidi>>,
    active: bool,
}

/// Retain one native-verified draft and permit only one save dialog at a time.
#[derive(Clone, Default)]
pub struct TranscriptionExportState(Arc<Mutex<ExportSlot>>);

/// Keep the requested native MIDI stable while its destination dialog is open.
pub struct ExportLease {
    state: TranscriptionExportState,
    cached: Arc<CachedMidi>,
}

impl TranscriptionExportState {
    /// Replace the cached draft only after its model, bounds and MIDI structure pass.
    pub fn publish(&self, draft: &TranscriptionDraft) -> Result<(), &'static str> {
        draft.validate().map_err(|_| EXPORT_INVALID)?;
        let bytes = STANDARD
            .decode(&draft.midi_base64)
            .map_err(|_| EXPORT_INVALID)?;
        validate_midi(&bytes)?;
        let cached = CachedMidi {
            encoded: draft.midi_base64.clone(),
            bytes,
            source_label: draft.source_label.clone(),
        };
        self.0.lock().map_err(|_| EXPORT_FAILED)?.cached = Some(Arc::new(cached));
        Ok(())
    }

    /// Use the renderer value only to identify the already-verified native draft.
    pub fn begin(&self, expected_midi_base64: &str) -> Result<ExportLease, &'static str> {
        if expected_midi_base64.is_empty() || expected_midi_base64.len() > MAX_EXPECTED_BASE64_BYTES
        {
            return Err(EXPORT_INVALID);
        }
        let mut slot = self.0.lock().map_err(|_| EXPORT_FAILED)?;
        if slot.active {
            return Err("transcription_export_busy");
        }
        let cached = slot
            .cached
            .as_ref()
            .filter(|cached| cached.encoded == expected_midi_base64)
            .cloned()
            .ok_or("transcription_export_stale")?;
        slot.active = true;
        Ok(ExportLease {
            state: self.clone(),
            cached,
        })
    }

    /// Keep shutdown and competing native operations aware of an owned save dialog.
    pub fn is_active(&self) -> bool {
        self.0.lock().map(|slot| slot.active).unwrap_or(true)
    }
}

impl ExportLease {
    /// Return bytes decoded at native publication, never bytes supplied by the renderer.
    pub fn bytes(&self) -> &[u8] {
        &self.cached.bytes
    }

    /// Return the basename captured with the draft selected for this save request.
    pub fn source_label(&self) -> &str {
        &self.cached.source_label
    }
}

impl Drop for ExportLease {
    /// Release the save slot after its dialog and file operation have finished.
    fn drop(&mut self) {
        if let Ok(mut slot) = self.state.0.lock() {
            slot.active = false;
        }
    }
}

/// Admit bounded Standard MIDI Files with complete header and track chunks.
fn validate_midi(bytes: &[u8]) -> Result<(), &'static str> {
    if bytes.len() < 26 || bytes.len() > MAX_MIDI_BYTES || &bytes[..8] != b"MThd\0\0\0\x06" {
        return Err(EXPORT_INVALID);
    }
    let format = u16::from_be_bytes([bytes[8], bytes[9]]);
    let tracks = u16::from_be_bytes([bytes[10], bytes[11]]);
    let division = u16::from_be_bytes([bytes[12], bytes[13]]);
    if format > 1
        || !(1..=16).contains(&tracks)
        || (format == 0 && tracks != 1)
        || !(1..0x8000).contains(&division)
    {
        return Err(EXPORT_INVALID);
    }
    let mut offset = 14usize;
    for _ in 0..tracks {
        if bytes.len().saturating_sub(offset) < 8 || &bytes[offset..offset + 4] != b"MTrk" {
            return Err(EXPORT_INVALID);
        }
        let length = u32::from_be_bytes([
            bytes[offset + 4],
            bytes[offset + 5],
            bytes[offset + 6],
            bytes[offset + 7],
        ]) as usize;
        offset += 8;
        if length < 4 || length > bytes.len() - offset {
            return Err(EXPORT_INVALID);
        }
        offset += length;
        if &bytes[offset - 3..offset] != b"\xff\x2f\0" {
            return Err(EXPORT_INVALID);
        }
    }
    if offset != bytes.len() {
        return Err(EXPORT_INVALID);
    }
    Ok(())
}

struct TemporaryMidi(Option<PathBuf>);

impl Drop for TemporaryMidi {
    /// Remove an unpublished stage on every error path after its file handle closes.
    fn drop(&mut self) {
        if let Some(path) = &self.0 {
            let _ = fs::remove_file(path);
        }
    }
}

/// Reserve an unrelated same-directory stage without following or replacing a collision.
fn create_temporary(parent: &Path) -> Result<(TemporaryMidi, File), &'static str> {
    for _ in 0..64 {
        let serial = NEXT_TEMPORARY.fetch_add(1, Ordering::Relaxed);
        let path = parent.join(format!(
            ".bandscope-midi-{}-{serial}.tmp",
            std::process::id()
        ));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        match options.open(&path) {
            Ok(file) => return Ok((TemporaryMidi(Some(path)), file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(EXPORT_FAILED),
        }
    }
    Err(EXPORT_FAILED)
}

/// Synchronize a complete MIDI stage, then atomically replace the native-chosen file.
///
/// The caller must obtain the absolute destination from its native save dialog. No
/// renderer path is accepted by the command using this helper. The stage is in the
/// destination directory so publication does not cross filesystems; this does not
/// claim that a host crash preserves the directory's later rename operation.
pub fn write_midi_atomically(path: &Path, bytes: &[u8]) -> Result<(), &'static str> {
    validate_midi(bytes)?;
    if !path.is_absolute()
        || path.file_name().is_none()
        || !path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                extension.eq_ignore_ascii_case("mid") || extension.eq_ignore_ascii_case("midi")
            })
    {
        return Err(EXPORT_INVALID);
    }
    let parent = path.parent().ok_or(EXPORT_INVALID)?;
    let (mut temporary, mut file) = create_temporary(parent)?;
    let written = file.write_all(bytes).and_then(|()| file.sync_all());
    drop(file);
    written.map_err(|_| EXPORT_FAILED)?;
    fs::rename(temporary.0.as_ref().ok_or(EXPORT_FAILED)?, path).map_err(|_| EXPORT_FAILED)?;
    temporary.0 = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::BASIC_PITCH_MODEL_SHA256;
    use serde_json::json;
    use std::{sync::Barrier, thread};

    const MIDI: &[u8] = b"MThd\0\0\0\x06\0\0\0\x01\x01\xe0MTrk\0\0\0\x04\0\xff\x2f\0";

    /// Build the smallest valid draft without invoking an audio model.
    fn draft(bytes: &[u8]) -> TranscriptionDraft {
        serde_json::from_value(json!({
            "schemaVersion": 1,
            "sourceLabel": "recording.wav",
            "durationSeconds": 1,
            "model": {"name": "basic-pitch", "version": "0.4.0", "sha256": BASIC_PITCH_MODEL_SHA256},
            "notes": [],
            "midiBase64": STANDARD.encode(bytes),
            "warnings": []
        }))
        .unwrap()
    }

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        /// Isolate real file operations under a process-unique temporary directory.
        fn new() -> Self {
            let serial = NEXT_TEMPORARY.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "bandscope-midi-export-test-{}-{serial}",
                std::process::id()
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        /// Leave no test MIDI or staged source behind after verification.
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn export_requires_the_exact_cached_midi_and_a_bounded_request() {
        let state = TranscriptionExportState::default();
        let draft = draft(MIDI);
        assert_eq!(
            state.begin(&draft.midi_base64).err(),
            Some("transcription_export_stale")
        );
        for value in [String::new(), "A".repeat(MAX_EXPECTED_BASE64_BYTES + 1)] {
            assert_eq!(state.begin(&value).err(), Some(EXPORT_INVALID));
        }
        state.publish(&draft).unwrap();
        assert_eq!(
            state.begin(&(draft.midi_base64.clone() + " ")).err(),
            Some("transcription_export_stale")
        );
        let lease = state.begin(&draft.midi_base64).unwrap();
        assert_eq!(lease.bytes(), MIDI);
        assert_eq!(lease.source_label(), "recording.wav");
        assert!(state.is_active());
        drop(lease);
        assert!(!state.is_active());
    }

    #[test]
    fn malformed_publication_never_replaces_the_verified_native_cache() {
        let state = TranscriptionExportState::default();
        let valid = draft(MIDI);
        state.publish(&valid).unwrap();
        let mut invalid = vec![vec![], MIDI[..25].to_vec(), [MIDI, b"extra"].concat()];
        for index in [4, 8, 10, 12, 14, 18, 24, 25] {
            let mut bytes = MIDI.to_vec();
            bytes[index] ^= 0xff;
            invalid.push(bytes);
        }
        let mut oversized = vec![0; MAX_MIDI_BYTES + 1];
        oversized[..MIDI.len()].copy_from_slice(MIDI);
        invalid.push(oversized);
        for bytes in invalid {
            assert_eq!(state.publish(&draft(&bytes)), Err(EXPORT_INVALID));
        }
        let mut noncanonical = draft(MIDI);
        let suffix = noncanonical.midi_base64.len() - 2;
        noncanonical.midi_base64.replace_range(suffix.., "B=");
        assert_eq!(state.publish(&noncanonical), Err(EXPORT_INVALID));
        let mut wrong_model = draft(MIDI);
        wrong_model.model.sha256 = "0".repeat(64);
        assert_eq!(state.publish(&wrong_model), Err(EXPORT_INVALID));
        assert_eq!(state.begin(&valid.midi_base64).unwrap().bytes(), MIDI);
    }

    #[test]
    fn a_real_competing_save_is_busy_and_publication_preserves_the_active_snapshot() {
        let state = TranscriptionExportState::default();
        let first = draft(MIDI);
        state.publish(&first).unwrap();
        let acquired = Arc::new(Barrier::new(2));
        let release = Arc::new(Barrier::new(2));
        let worker_state = state.clone();
        let worker_acquired = acquired.clone();
        let worker_release = release.clone();
        let expected = first.midi_base64.clone();
        let worker = thread::spawn(move || {
            let lease = worker_state.begin(&expected).unwrap();
            worker_acquired.wait();
            worker_release.wait();
            (lease.bytes().to_vec(), lease.source_label().to_owned())
        });
        acquired.wait();
        assert!(state.is_active());
        assert_eq!(
            state.begin(&first.midi_base64).err(),
            Some("transcription_export_busy")
        );
        let mut second_bytes = MIDI.to_vec();
        second_bytes[9] = 1;
        let mut second = draft(&second_bytes);
        second.source_label = "next.flac".into();
        state.publish(&second).unwrap();
        release.wait();
        assert_eq!(
            worker.join().unwrap(),
            (MIDI.to_vec(), "recording.wav".into())
        );
        assert!(!state.is_active());
        assert_eq!(
            state.begin(&first.midi_base64).err(),
            Some("transcription_export_stale")
        );
        let next = state.begin(&second.midi_base64).unwrap();
        assert_eq!(next.bytes(), second_bytes);
        assert_eq!(next.source_label(), "next.flac");
    }

    #[test]
    fn an_atomic_save_creates_and_overwrites_the_chosen_file_without_stages() {
        let directory = TestDirectory::new();
        let destination = directory.0.join("draft.mid");
        write_midi_atomically(&destination, MIDI).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), MIDI);
        fs::write(&destination, b"previous file").unwrap();
        write_midi_atomically(&destination, MIDI).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), MIDI);
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 1);
    }

    #[test]
    fn failed_publication_removes_its_stage_and_preserves_the_destination() {
        let directory = TestDirectory::new();
        let destination = directory.0.join("existing-directory.mid");
        fs::create_dir(&destination).unwrap();
        fs::write(destination.join("preserved"), b"existing data").unwrap();
        assert_eq!(
            write_midi_atomically(&destination, MIDI),
            Err(EXPORT_FAILED)
        );
        assert_eq!(
            fs::read(destination.join("preserved")).unwrap(),
            b"existing data"
        );
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 1);
        assert_eq!(
            write_midi_atomically(&directory.0.join("missing/draft.mid"), MIDI),
            Err(EXPORT_FAILED)
        );
    }

    #[test]
    fn invalid_bytes_and_relative_destinations_do_not_create_a_file() {
        let directory = TestDirectory::new();
        assert_eq!(
            write_midi_atomically(&directory.0.join("invalid.mid"), b"not midi"),
            Err(EXPORT_INVALID)
        );
        assert_eq!(
            write_midi_atomically(Path::new("relative.mid"), MIDI),
            Err(EXPORT_INVALID)
        );
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 0);
    }

    #[test]
    fn an_invalid_extension_never_changes_the_chosen_or_appended_destination() {
        let directory = TestDirectory::new();
        for name in ["recording", "recording.wav"] {
            let selected = directory.0.join(name);
            fs::write(&selected, b"selected original").unwrap();
            let renamed = selected.with_extension("mid");
            fs::write(&renamed, b"unselected original").unwrap();
            assert_eq!(write_midi_atomically(&selected, MIDI), Err(EXPORT_INVALID));
            assert_eq!(fs::read(&selected).unwrap(), b"selected original");
            assert_eq!(fs::read(&renamed).unwrap(), b"unselected original");
        }
        assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 3);
    }
}

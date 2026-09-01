"""Apply the bounded PR1009 regression-first repair and remove no product authority."""

from __future__ import annotations

import re
import sys
from pathlib import Path

APP_PATH = Path("apps/desktop/src/App.tsx")
APP_TEST_PATH = Path("apps/desktop/src/App.localSelectionConcurrency.test.tsx")
CORE_PATH = Path("apps/desktop/core/src/lib.rs")


def replace_once(path: Path, old_text: str, new_text: str) -> None:
    """Replace one exact source fragment and fail closed on unexpected branch drift."""
    source_text = path.read_text(encoding="utf-8")
    if source_text.count(old_text) != 1:
        raise RuntimeError(f"expected exactly one repair target in {path}: {old_text[:80]!r}")
    path.write_text(source_text.replace(old_text, new_text), encoding="utf-8")


def add_regression_tests() -> None:
    """Add focused tests that fail on the current project/demo intake defects."""
    app_test = APP_TEST_PATH.read_text(encoding="utf-8")
    if "serializes project loading after source selection takes intake authority" not in app_test:
        app_test = app_test.replace(
            'import type { ProjectBootstrapSummary } from "@bandscope/shared-types";',
            'import { createDemoRehearsalSong, type ProjectBootstrapSummary } from "@bandscope/shared-types";',
            1,
        )
        insertion = r'''

  it("serializes project loading after source selection takes intake authority", async () => {
    let resolveSelection: ((value: SuccessfulLocalAudioSelection) => void) | undefined;
    analysisMocks.selectLocalAudioSource.mockImplementation(
      () =>
        new Promise<SuccessfulLocalAudioSelection>((resolve) => {
          resolveSelection = resolve;
        }),
    );
    analysisMocks.loadProject.mockResolvedValue(createDemoRehearsalSong());

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Use my own song" }));

    const openProject = screen.getByRole("button", { name: "Open Project" });
    await waitFor(() => expect(openProject).toBeDisabled());
    openProject.removeAttribute("disabled");
    fireEvent.click(openProject);
    expect(analysisMocks.loadProject).not.toHaveBeenCalled();

    resolveSelection?.({ ok: true, bootstrap: selectedBootstrap });
    await waitFor(() => expect(screen.getByText("selected-song.wav")).toBeTruthy());
  });

  it("serializes source selection after project loading takes intake authority", async () => {
    let resolveProject: ((value: ReturnType<typeof createDemoRehearsalSong>) => void) | undefined;
    analysisMocks.loadProject.mockImplementation(
      () =>
        new Promise<ReturnType<typeof createDemoRehearsalSong>>((resolve) => {
          resolveProject = resolve;
        }),
    );
    analysisMocks.selectLocalAudioSource.mockResolvedValue({ ok: true, bootstrap: selectedBootstrap });

    render(<App />);
    const openProject = screen.getByRole("button", { name: "Open Project" });
    const chooseLocalAudio = screen.getByRole("button", { name: "Choose local audio" });
    fireEvent.click(openProject);

    await waitFor(() => {
      expect(openProject).toBeDisabled();
      expect(chooseLocalAudio).toBeDisabled();
    });
    chooseLocalAudio.removeAttribute("disabled");
    fireEvent.click(chooseLocalAudio);
    expect(analysisMocks.selectLocalAudioSource).not.toHaveBeenCalled();

    resolveProject?.(createDemoRehearsalSong());
    await waitFor(() => expect(screen.getByText("Late Night Set")).toBeTruthy());
  });
'''
        close_index = app_test.rfind("\n});")
        if close_index < 0:
            raise RuntimeError("could not find concurrency describe terminator")
        app_test = app_test[:close_index] + insertion + app_test[close_index:]
        APP_TEST_PATH.write_text(app_test, encoding="utf-8")

    core_source = CORE_PATH.read_text(encoding="utf-8")
    helper_old = '''    fn write_sized_demo_wav(path: &Path, bytes: u64, riff: bool, wave: bool) {
        let mut data = vec![0u8; bytes as usize];
        if riff && wave && data.len() >= 44 {
            let data_len = data.len() as u32;
            data[0..4].copy_from_slice(b"RIFF");
            data[4..8].copy_from_slice(&(data_len - 8).to_le_bytes());
            data[8..12].copy_from_slice(b"WAVE");
            data[12..16].copy_from_slice(b"fmt ");
            data[16..20].copy_from_slice(&16u32.to_le_bytes());
            data[20..22].copy_from_slice(&1u16.to_le_bytes());
            data[22..24].copy_from_slice(&1u16.to_le_bytes());
            data[24..28].copy_from_slice(&44_100u32.to_le_bytes());
            data[28..32].copy_from_slice(&88_200u32.to_le_bytes());
            data[32..34].copy_from_slice(&2u16.to_le_bytes());
            data[34..36].copy_from_slice(&16u16.to_le_bytes());
            data[36..40].copy_from_slice(b"data");
            data[40..44].copy_from_slice(&(data_len - 44).to_le_bytes());
        }
        std::fs::write(path, data).expect("demo fixture should be written");
    }
'''
    helper_new = '''    fn write_sized_demo_wav(
        demo_audio_path: &Path,
        wav_size_bytes: u64,
        include_riff: bool,
        include_wave: bool,
    ) {
        let mut wav_bytes = vec![0u8; wav_size_bytes as usize];
        if include_riff && include_wave && wav_bytes.len() >= 44 {
            let wav_length = wav_bytes.len() as u32;
            wav_bytes[0..4].copy_from_slice(b"RIFF");
            wav_bytes[4..8].copy_from_slice(&(wav_length - 8).to_le_bytes());
            wav_bytes[8..12].copy_from_slice(b"WAVE");
            wav_bytes[12..16].copy_from_slice(b"fmt ");
            wav_bytes[16..20].copy_from_slice(&16u32.to_le_bytes());
            wav_bytes[20..22].copy_from_slice(&1u16.to_le_bytes());
            wav_bytes[22..24].copy_from_slice(&1u16.to_le_bytes());
            wav_bytes[24..28].copy_from_slice(&22_050u32.to_le_bytes());
            wav_bytes[28..32].copy_from_slice(&44_100u32.to_le_bytes());
            wav_bytes[32..34].copy_from_slice(&2u16.to_le_bytes());
            wav_bytes[34..36].copy_from_slice(&16u16.to_le_bytes());
            wav_bytes[36..40].copy_from_slice(b"data");
            wav_bytes[40..44].copy_from_slice(&(wav_length - 44).to_le_bytes());
        }
        std::fs::write(demo_audio_path, wav_bytes).expect("demo fixture should be written");
    }
'''
    if helper_old in core_source:
        core_source = core_source.replace(helper_old, helper_new, 1)

    if "demo_audio_validation_rejects_pcm_drift_duplicate_chunks_and_short_buffers" not in core_source:
        test_marker = '''    #[test]\n    fn demo_audio_validation_rejects_wrong_name_size_magic_and_missing_files() {'''
        regression = r'''    #[test]
    fn demo_audio_validation_rejects_pcm_drift_duplicate_chunks_and_short_buffers() {
        let root = unique_test_dir("demo-contract-reject");
        std::fs::create_dir_all(&root).expect("demo root should be created");
        let demo_audio_path = root.join(DEMO_AUDIO_FILE_NAME);

        write_sized_demo_wav(&demo_audio_path, DEMO_AUDIO_BYTES, true, true);
        let mut wrong_pcm =
            std::fs::read(&demo_audio_path).expect("valid demo fixture should be readable");
        wrong_pcm[24..28].copy_from_slice(&44_100u32.to_le_bytes());
        wrong_pcm[28..32].copy_from_slice(&88_200u32.to_le_bytes());
        std::fs::write(&demo_audio_path, wrong_pcm).expect("PCM drift fixture should be writable");
        assert!(validate_demo_audio_source(&demo_audio_path).is_err());

        let mut duplicate_chunks = vec![0u8; DEMO_AUDIO_BYTES as usize];
        let wav_length = duplicate_chunks.len() as u32;
        duplicate_chunks[0..4].copy_from_slice(b"RIFF");
        duplicate_chunks[4..8].copy_from_slice(&(wav_length - 8).to_le_bytes());
        duplicate_chunks[8..12].copy_from_slice(b"WAVE");
        for format_offset in [12usize, 36usize] {
            duplicate_chunks[format_offset..format_offset + 4].copy_from_slice(b"fmt ");
            duplicate_chunks[format_offset + 4..format_offset + 8]
                .copy_from_slice(&16u32.to_le_bytes());
            duplicate_chunks[format_offset + 8..format_offset + 10]
                .copy_from_slice(&1u16.to_le_bytes());
            duplicate_chunks[format_offset + 10..format_offset + 12]
                .copy_from_slice(&1u16.to_le_bytes());
            duplicate_chunks[format_offset + 12..format_offset + 16]
                .copy_from_slice(&22_050u32.to_le_bytes());
            duplicate_chunks[format_offset + 16..format_offset + 20]
                .copy_from_slice(&44_100u32.to_le_bytes());
            duplicate_chunks[format_offset + 20..format_offset + 22]
                .copy_from_slice(&2u16.to_le_bytes());
            duplicate_chunks[format_offset + 22..format_offset + 24]
                .copy_from_slice(&16u16.to_le_bytes());
        }
        duplicate_chunks[60..64].copy_from_slice(b"data");
        duplicate_chunks[64..68].copy_from_slice(&(wav_length - 68).to_le_bytes());
        std::fs::write(&demo_audio_path, duplicate_chunks)
            .expect("duplicate chunk fixture should be writable");
        assert!(validate_demo_audio_source(&demo_audio_path).is_err());

        let short_size = DEMO_AUDIO_BYTES - 2;
        write_sized_demo_wav(&demo_audio_path, short_size, true, true);
        let short_wav = std::fs::read(&demo_audio_path).expect("short fixture should be readable");
        assert!(!is_valid_demo_wav(&short_wav));

        let _ = std::fs::remove_dir_all(root);
    }

'''
        if test_marker not in core_source:
            raise RuntimeError("could not find demo rejection test marker")
        core_source = core_source.replace(test_marker, regression + test_marker, 1)
    CORE_PATH.write_text(core_source, encoding="utf-8")


def apply_production_repair() -> None:
    """Serialize workspace intake and enforce the generated demo WAV contract."""
    app_source = APP_PATH.read_text(encoding="utf-8")
    app_source = app_source.replace("sourceSelectionInFlightRef", "workspaceIntakeInFlightRef")
    if "const [isOpeningProject, setIsOpeningProject]" not in app_source:
        app_source = app_source.replace(
            '  const [isImporting, setIsImporting] = useState(false);\n',
            '  const [isImporting, setIsImporting] = useState(false);\n  const [isOpeningProject, setIsOpeningProject] = useState(false);\n',
            1,
        )
    old_load = '''  /** Documented. */
  const handleLoadProject = async () => {
    try {
      const song = await loadProject();
      setJobResult(song);
      setJobResultBootstrap(null);
      setJobError(null);
      setSelectedBootstrap(null);
      setSelectedSourceKind(null);
      setSelectionError(null);
      setSelectionErrorSource(null);
      setActiveAnalysisBootstrap(null);
      setJobStatus(null);
    } catch (e) {
      if (!isUserCancellation(e)) {
        setJobError(`${t("loadProjectFailedPrefix")}: ${safeErrorDetail(e, t("loadProjectFailedFallback"))}`);
      }
    }
  };
'''
    new_load = '''  /** Documented. */
  const handleLoadProject = async () => {
    if (analysisInFlight || isStarting || workspaceIntakeInFlightRef.current) {
      return;
    }

    workspaceIntakeInFlightRef.current = true;
    setIsOpeningProject(true);
    try {
      const song = await loadProject();
      setJobResult(song);
      setJobResultBootstrap(null);
      setJobError(null);
      setSelectedBootstrap(null);
      setSelectedSourceKind(null);
      setSelectionError(null);
      setSelectionErrorSource(null);
      setActiveAnalysisBootstrap(null);
      setJobStatus(null);
    } catch (e) {
      if (!isUserCancellation(e)) {
        setJobError(`${t("loadProjectFailedPrefix")}: ${safeErrorDetail(e, t("loadProjectFailedFallback"))}`);
      }
    } finally {
      workspaceIntakeInFlightRef.current = false;
      setIsOpeningProject(false);
    }
  };
'''
    if old_load not in app_source:
        raise RuntimeError("current handleLoadProject no longer matches reviewed defect")
    app_source = app_source.replace(old_load, new_load, 1)

    app_source = app_source.replace(
        "disabled={isImporting || isSelectingDemo || isSelectingLocal}",
        "disabled={isImporting || isSelectingDemo || isSelectingLocal || isOpeningProject}",
    )
    app_source = app_source.replace(
        "disabled={analysisInFlight || isStarting || isImporting || isSelectingDemo || isSelectingLocal}",
        "disabled={analysisInFlight || isStarting || isImporting || isSelectingDemo || isSelectingLocal || isOpeningProject}",
    )
    app_source = app_source.replace(
        "!isSelectingLocal ? (",
        "!isSelectingLocal &&\n                      !isOpeningProject ? (",
        1,
    )
    import_tail = '''                      isImporting ||
                      isSelectingDemo ||
                      isSelectingLocal
                    }'''
    if import_tail in app_source:
        app_source = app_source.replace(
            import_tail,
            '''                      isImporting ||
                      isSelectingDemo ||
                      isSelectingLocal ||
                      isOpeningProject
                    }''',
            1,
        )
    app_source = app_source.replace(
        "disabled={analysisInFlight || isStarting}\n                  variant=\"outline\"",
        "disabled={analysisInFlight || isStarting || isImporting || isSelectingDemo || isSelectingLocal || isOpeningProject}\n                  variant=\"outline\"",
        1,
    )
    start_tail = '''                    isImporting ||
                    isSelectingDemo ||
                    isSelectingLocal
                  }'''
    if start_tail in app_source:
        app_source = app_source.replace(
            start_tail,
            '''                    isImporting ||
                    isSelectingDemo ||
                    isSelectingLocal ||
                    isOpeningProject
                  }''',
            1,
        )
    APP_PATH.write_text(app_source, encoding="utf-8")

    core_source = CORE_PATH.read_text(encoding="utf-8")
    if "DEMO_AUDIO_SAMPLE_RATE_HZ" not in core_source:
        core_source = core_source.replace(
            "pub const DEMO_AUDIO_BYTES: u64 = 88244;\n",
            '''pub const DEMO_AUDIO_BYTES: u64 = 88244;
const DEMO_AUDIO_FORMAT_CODE: u16 = 1;
const DEMO_AUDIO_CHANNEL_COUNT: u16 = 1;
const DEMO_AUDIO_SAMPLE_RATE_HZ: u32 = 22_050;
const DEMO_AUDIO_BYTE_RATE: u32 = 44_100;
const DEMO_AUDIO_BLOCK_ALIGN_BYTES: u16 = 2;
const DEMO_AUDIO_BITS_PER_SAMPLE: u16 = 16;
const DEMO_AUDIO_FORMAT_CHUNK_BYTES: u32 = 16;
const DEMO_AUDIO_DATA_BYTES: u32 = DEMO_AUDIO_BYTES as u32 - 44;
''',
            1,
        )
    core_source = core_source.replace(
        "pub fn validate_demo_audio_source(path: &Path) -> Result<LocalAudioSourcePayload, String> {\n    let link_metadata =\n        std::fs::symlink_metadata(path)",
        "pub fn validate_demo_audio_source(demo_audio_path: &Path) -> Result<LocalAudioSourcePayload, String> {\n    let link_metadata =\n        std::fs::symlink_metadata(demo_audio_path)",
        1,
    )
    core_source = core_source.replace("    let canonical = path\n", "    let canonical = demo_audio_path\n", 2)
    core_source = core_source.replace(
        '''    let data = std::fs::read(&canonical).map_err(|_| DEMO_UNAVAILABLE_MESSAGE.to_string())?;
    if !is_valid_demo_wav(&data) {
        return Err(DEMO_UNAVAILABLE_MESSAGE.to_string());
    }

    Ok(LocalAudioSourcePayload {
        source_path: canonical.to_string_lossy().into_owned(),
        file_name: file_name.to_string(),
        extension,
        file_size_bytes: link_metadata.len(),
    })
''',
        '''    let wav_bytes =
        std::fs::read(&canonical).map_err(|_| DEMO_UNAVAILABLE_MESSAGE.to_string())?;
    if wav_bytes.len() as u64 != DEMO_AUDIO_BYTES || !is_valid_demo_wav(&wav_bytes) {
        return Err(DEMO_UNAVAILABLE_MESSAGE.to_string());
    }

    Ok(LocalAudioSourcePayload {
        source_path: canonical.to_string_lossy().into_owned(),
        file_name: file_name.to_string(),
        extension,
        file_size_bytes: wav_bytes.len() as u64,
    })
''',
        1,
    )
    validator_pattern = re.compile(
        r"fn is_valid_demo_wav\(data: &\[u8\]\) -> bool \{.*?\n\}\n\n/// Security Notes:",
        re.DOTALL,
    )
    validator_replacement = '''fn is_valid_demo_wav(wav_bytes: &[u8]) -> bool {
    if wav_bytes.len() != DEMO_AUDIO_BYTES as usize
        || &wav_bytes[0..4] != WAV_RIFF_MAGIC
        || &wav_bytes[8..12] != WAV_WAVE_MAGIC
        || u32::from_le_bytes([wav_bytes[4], wav_bytes[5], wav_bytes[6], wav_bytes[7]]) as usize
            != wav_bytes.len() - 8
        || &wav_bytes[12..16] != b"fmt "
        || u32::from_le_bytes([wav_bytes[16], wav_bytes[17], wav_bytes[18], wav_bytes[19]])
            != DEMO_AUDIO_FORMAT_CHUNK_BYTES
        || u16::from_le_bytes([wav_bytes[20], wav_bytes[21]]) != DEMO_AUDIO_FORMAT_CODE
        || u16::from_le_bytes([wav_bytes[22], wav_bytes[23]]) != DEMO_AUDIO_CHANNEL_COUNT
        || u32::from_le_bytes([wav_bytes[24], wav_bytes[25], wav_bytes[26], wav_bytes[27]])
            != DEMO_AUDIO_SAMPLE_RATE_HZ
        || u32::from_le_bytes([wav_bytes[28], wav_bytes[29], wav_bytes[30], wav_bytes[31]])
            != DEMO_AUDIO_BYTE_RATE
        || u16::from_le_bytes([wav_bytes[32], wav_bytes[33]]) != DEMO_AUDIO_BLOCK_ALIGN_BYTES
        || u16::from_le_bytes([wav_bytes[34], wav_bytes[35]]) != DEMO_AUDIO_BITS_PER_SAMPLE
        || &wav_bytes[36..40] != b"data"
        || u32::from_le_bytes([wav_bytes[40], wav_bytes[41], wav_bytes[42], wav_bytes[43]])
            != DEMO_AUDIO_DATA_BYTES
    {
        return false;
    }

    let derived_block_align = DEMO_AUDIO_CHANNEL_COUNT * (DEMO_AUDIO_BITS_PER_SAMPLE / 8);
    let derived_byte_rate = DEMO_AUDIO_SAMPLE_RATE_HZ * u32::from(derived_block_align);
    DEMO_AUDIO_BLOCK_ALIGN_BYTES == derived_block_align && DEMO_AUDIO_BYTE_RATE == derived_byte_rate
}

/// Security Notes:'''
    core_source, replacement_count = validator_pattern.subn(validator_replacement, core_source, count=1)
    if replacement_count != 1:
        raise RuntimeError("current demo WAV validator no longer matches reviewed defect")
    CORE_PATH.write_text(core_source, encoding="utf-8")


def main() -> int:
    """Run the requested repair phase."""
    if len(sys.argv) != 2 or sys.argv[1] not in {"tests", "production"}:
        raise SystemExit("usage: pr1009_current_findings.py {tests|production}")
    if sys.argv[1] == "tests":
        add_regression_tests()
    else:
        apply_production_repair()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

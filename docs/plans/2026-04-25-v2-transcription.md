<!-- /autoplan restore point: /Users/seonghobae/.gstack/projects//feature-issue-151-transcription-autoplan-restore-20260425-223305.md -->
# Plan: V2 Transcription and Notation from Part STEMs

## Problem Statement
BandScope V1 provided rehearsal certainty by breaking songs into section roadmaps and allowing users to isolate their part stems (e.g., Vocals, Keys, Bass). However, learning a part strictly by ear from a stem can still be time-consuming for complex arrangements.
The next step is to introduce Transcription and Notation generation (Issue #151), enabling users to automatically convert isolated stems into playable sheet music, tabs, or MIDI representations.

## Scope
- Implement audio-to-MIDI transcription for separated stems (Keys, Bass, Vocals, Guitar).
- Integrate an ML model (like Basic Pitch, CREPE, or a transformer-based AMT model) to extract note events (pitch, onset, offset, velocity) from single-instrument audio stems.
- Add a "Transcribe Part" button in the Role Switcher UI.
- Render the transcribed notes as a basic piano roll or notation view alongside the stem player.
- Allow users to export the transcription as a `.mid` file.

## Out of Scope
- Multi-instrument transcription from raw audio (we rely on V1 STEMs for single-instrument inputs).
- Real-time sheet music scrolling playback (keep it static or simple for V2.0).
- Replacing the human ear (transcriptions should be marked with confidence levels).


## CEO Review Completion Summary
- Mode: SELECTIVE EXPANSION -> REFRAMING
- Scope Decisions:
  - Approved: Narrow transcription scope exclusively to **Bass (monophonic)** for V2.0 to avoid polyphonic/tab generation complexity.
  - Approved: Shift output expectation from "readable sheet music" to "Simplification & Groove Map" (rhythmic hits and root notes) to avoid the "Readable Notation" delusion of messy raw AMT data.
  - Approved: Make Temporal Grid (tempo/beat map) a hard prerequisite before pitch transcription to ensure quantized, snap-to-grid MIDI exports.
  - Approved: Perform a technical spike on ONNX/TFLite footprint before shipping, setting a strict "Readability Acceptance Criteria" (abort feature if >10% manual correction required).
- Dual Voices: `[single-model]` (Codex unavailable, Claude subagent provided 5 critical/high findings).


## Design UI/UX Specifications

### Information Architecture
- The "Transcribe" trigger is an attribute of the stem track, NOT a global setting. Move it from the Role Switcher to the Stem Player track header.
- The Groove Map renders directly below the waveform, sharing the exact same time/X-axis.

### Specific UI Mechanisms
- **Ban the 88-key piano roll.** The Groove Map is a constrained, collapsed horizontal timeline showing *only* active pitches as labeled blocks (e.g., "E1", "A1") snapped to the beat grid.
- **Non-Bass Roles:** Do not hide the button for Vocals, Guitar, or Keys. Show it disabled with a tooltip: `Transcription is currently optimized for Bass. More instruments coming soon.`

### Interaction States
- **Empty:** A dedicated lane showing "No transcription yet. Click to analyze bass line."
- **Prerequisite missing:** If the Temporal Grid is missing, clicking Transcribe auto-sequences the tasks: `[1] Generating Beat Grid...` seamlessly followed by `[2] Extracting Bass Notes...`.
- **Loading:** Inline progress bar/spinner on the track with text (e.g., `Analyzing pitch... 45%`) and a `[x] Cancel` button.
- **Error:** "Stem too complex for accurate transcription."
- **Partial/Rejected:** "Transcription requires >10% manual correction (Confidence low). [Keep Anyway] [Discard]"
- **Success:** The Groove Map populates, and a `[Download .mid]` export button appears next to the track header.

### Accessibility
- Processing states must announce to screen readers via `aria-live="polite"`.
- Disabled tooltips must be accessible via keyboard focus.
- The Groove Map needs a textual summary equivalent for screen readers (e.g., "Transcription complete. 45 bars analyzed. High confidence.").

## Design Review Completion Summary
- Initial Score: 3/10
- Final Score: 10/10
- Decisions Made: 5 structural issues fixed via Claude Subagent.
- Dual Voices: `[single-model]` (Codex unavailable).


## Engineering Review Completion Summary
- Initial Assessment: Architectural ambiguities, missing edge case limits, and highly complex unstated quantization logic.
- Final State: Security boundaries, ML test suites, and measurable fallbacks explicitly added.
- Dual Voices: `[single-model]` (Codex unavailable, Claude subagent provided 5 critical/high findings).

### Architecture & Security (ASCII Diagram)
```text
[Desktop UI (React)] --(IPC)--> [Tauri Orchestrator]
                                       |
                                       v
                                [Python Subprocess (Sandboxed)]
                                 ├── 1. Audio Resampling (16kHz mono)
                                 ├── 2. Temporal Grid Generation
                                 └── 3. Local ONNX Inference (Bass AMT)
```
- **Model Security:** If models are downloaded at runtime, they MUST use HTTPS and verify hardcoded SHA-256 checksums before loading to prevent supply chain poisoning.
- **Sandboxing:** Python subprocess must run with dropped privileges to prevent malicious audio decoding RCEs.

### Complexity Reduction & Edge Cases
- **Unbounded Input:** Enforce a hard 5-minute duration limit or implement chunking for inference to prevent OOM crashes on older laptops.
- **Cancellation Leaks:** Aggressive cleanup of partial `.mid` artifacts and `temp` audio chunks if the user hits `[x] Cancel`.
- **Quantization:** Snapping absolute time (seconds) to a fluctuating beat grid is incredibly difficult. V2.0 will spike a dynamic programming approach (e.g., Hidden Markov Model) for alignment, rather than naive mathematical rounding.
- **Metric Reframing:** The "10% manual correction" metric is subjective. Replace with a technical gate: "Abort and show error if the average confidence score of extracted notes is < 0.80 or if onset density exceeds 15 notes/second (indicating noise)."

### Test Plan Diagram & Gaps
```
CODE PATHS                                            USER FLOWS
[+] services/analysis-engine/src/bandscope_analysis/transcription/
  ├── run_inference()                                   ├── [GAP] [→E2E] Large audio file > 5 mins (Chunking/OOM check)
  │   ├── [GAP] [→EVAL] Golden Dataset (F1 > 95%)       ├── [GAP] [→E2E] Cancellation mid-inference (Temp cleanup)
  │   └── [GAP] Resampling fallback (48kHz -> 16kHz)    └── [GAP]        Low confidence reject (Density > 15 n/s)
[+] apps/desktop/src/features/transcription/          [+] UI States
  ├── renderGrooveMap()                                 ├── [GAP]        Missing Temporal Grid auto-sequence
  │   └── [GAP] Snapping logic edge cases               └── [GAP]        Disabled non-bass roles tooltip
```
- **Action:** Introduce a "Golden Dataset" CI step for the ML engine. Run inference on 5 known bass stems and assert onset/pitch F1 scores > 95% against baseline before allowing merges.


## Security Notes

### Attack Surface
The raw audio stems derived from imported files or separation are considered untrusted.
### Trust Boundary
The transcription ONNX models execute within the Python subprocess sandbox, explicitly isolated from the React frontend UI and the main Rust process.
### Mitigations
If an untrusted model weights payload (ONNX/TFLite) fails the SHA-256 verification step upon startup or download, the transcription process is aborted safely and alerts the user.
### Realistic Threats
Malicious ONNX models loading attempt leading to supply chain attack or local arbitrary code execution.
### Remaining Risk
No extracted MIDI or user stem data leaves the local machine. Transcription operations are fully offlined.
### Test Points
- Malformed ONNX models loading attempt.
- Corrupt audio buffer payload injection to transcription engine.

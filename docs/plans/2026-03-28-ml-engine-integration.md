# ML Engine Integration Plan

## Overview
Now that the basic IPC and React/Python orchestrator boundaries are proven (Issue #26 epics), the next phase is replacing the hardcoded, instantaneous mock data with real digital signal processing (DSP) and Machine Learning (ML) inference.

This document outlines the MECE execution strategy to incrementally substitute mock systems with reality.

## Execution Tracks

### Track 1: Temporal Foundation (#105)
- **Goal**: Replace simple count-based anchors with a real tempo and beat grid.
- **Tech**: Add `librosa` or `soundfile` for robust decoding.
- **Output**: Real file ingestion and tempo/beat arrays.

### Track 2: Spectral & Stem Separation (#106) (IMPLEMENTED; RELEASE EVIDENCE OPEN)
- **Goal**: Deconstruct the mixed audio into isolated stems.
- **Tech**: Demucs 4.0.1 `htdemucs` running locally on CPU after model provisioning.
- **Output**: 4 discrete stems (vocals, bass, drums, other).
- **Validity**: The active known-stem branch adds production-path vocal SI-SDR improvement and stem
  assignment checks; see `docs/PRD.md`, `docs/TRD.md`, and ADR-0002.
- **Open release blockers**: model-rights/legal delivery decision, successful exact-candidate live
  evidence, threshold calibration, and supported-platform proof. Full-SHA verification before
  deserialization is implemented and regression-tested.

### Track 3: Harmonic & Pitch Pipelines (#107) (COMPLETED)

- **Goal**: Replace hardcoded `C#m7` strings with DSP-derived chord and pitch arrays.
- **Tech**: Chromagram extraction and Viterbi decoding for chords. YIN/pYIN for pitch ranges.
- **Output**: Accurate harmonic sequences tied to Track 1's beat grid.

### Track 4: Structural Graph Assembly (#108)
- **Goal**: Infer boundaries (Verse, Chorus) and detect which roles (stems) are playing.
- **Tech**: Self-similarity matrices and energy thresholding on the stems.
- **Output**: The true `PartGraph` and `Section` payloads.

### Track 5: Orchestration & UX (#109)
- **Goal**: Handle the fact that ML takes minutes, not milliseconds.
- **Tech**: Async progress callbacks, IPC streaming updates.
- **Output**: Responsive UI during long-running tasks.

## Security Notes

### Attack Surface
The integration of ML libraries like `librosa`, `torch`, and `demucs` exposes the desktop app to complex audio processing pipelines that parse potentially malformed user-provided audio files.

### Trust Boundary
The primary trust boundary is between the user's filesystem (audio files) and the Python local analysis engine. All input audio is untrusted.

### Mitigations
We restrict audio ingestion through `librosa`/`soundfile` using strict format constraints. Model
inference runs locally and under low privilege where possible. A trusted provisioning step must
place the exact inventoried model in the user cache; runtime never downloads a missing model. The
separator rejects symlinks, size drift, and full-SHA mismatch before deserializing the same verified
bytes; see ADR-0001.

### Test Points
- Loading truncated or corrupted WAV/MP3 files.
- Providing extremely large audio files to test OOM behavior.
- Validating that no external network calls occur during model loading, including when the cache is
  absent or invalid.

### Realistic Threats
- OOM (Out Of Memory) crashing the user's host OS during `demucs` execution.
- Arbitrary code execution (ACE) vulnerabilities within C-level parsing dependencies of `librosa`/`soundfile`.

### Remaining Risk
Large ML dependencies carry high vulnerability footprints. We depend on upstream patching for zero-days in C-level audio codec libraries.

1. **Supply Chain**: Must follow `docs/security/dependency-policy.md`. Large ML dependencies carry high vulnerability footprints.
2. **Execution**: Must gracefully handle lack of GPU/MPS, defaulting to CPU chunks without OOM-crashing the host OS.

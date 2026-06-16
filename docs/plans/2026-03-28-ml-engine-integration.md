# ML Engine Integration Plan

## Overview
Now that the basic IPC and React/Python orchestrator boundaries are proven (Issue #26 epics), the next phase is replacing the hardcoded, instantaneous mock data with real digital signal processing (DSP) and Machine Learning (ML) inference.

This document outlines the MECE execution strategy to incrementally substitute mock systems with reality.

## Execution Tracks

### Track 1: Temporal Foundation (#105)
- **Goal**: Replace simple count-based anchors with a real tempo and beat grid.
- **Tech**: Add `librosa` or `soundfile` for robust decoding.
- **Output**: Real file ingestion and tempo/beat arrays.

### Track 2: Spectral & Stem Separation (#106)
- **Goal**: Deconstruct the mixed audio into isolated stems.
- **Tech**: Integrate `demucs` (or a smaller alternative) running locally.
- **Output**: 4 or 6 discrete stems (vocals, bass, drums, other).
- **Implemented (2026-06)**: Local lightweight spectral model (HPSS + bounded NMF), chunked inference to bound memory use, canonical stem mapping (`vocals`, `bass`, `drums`, `other`), and opt-in model-weight download with allowlisted HTTPS + SHA-256 verification.

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
We will restrict audio ingestion through `librosa`/`soundfile` using strict format constraints. We will execute ML tasks locally, without reaching out to external networks, and run them under low privileges where possible.

### Test Points
- Loading truncated or corrupted WAV/MP3 files.
- Providing extremely large audio files to test OOM behavior.
- Validating that no external network calls occur during offline ML processing.

### Realistic Threats
- OOM (Out Of Memory) crashing the user's host OS during `demucs` execution.
- Arbitrary code execution (ACE) vulnerabilities within C-level parsing dependencies of `librosa`/`soundfile`.

### Remaining Risk
Large ML dependencies carry high vulnerability footprints. We depend on upstream patching for zero-days in C-level audio codec libraries.

1. **Supply Chain**: Must follow `docs/security/dependency-policy.md`. Large ML dependencies carry high vulnerability footprints.
2. **Execution**: Must gracefully handle lack of GPU/MPS, defaulting to CPU chunks without OOM-crashing the host OS.

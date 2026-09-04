# Section harmony known-progression accuracy lock

**Goal:** Prove the analysis engine recovers distinct section harmony from a
rehearsal-shaped take, not a single song-wide chord.

**Architecture:** `ChordRecognizer` emits time-stamped segments.
`summarize_section_harmony` overlaps those segments onto section windows. The
new tests synthesize C-major then G-major audio (and the reverse) and score
duration-weighted chord symbol recall against those true windows.

## Security Notes

### Attack surface

- Synthetic numpy audio arrays constructed in-process for pytest.

### Trust boundary

- Untrusted: production audio from user files and YouTube import.
- Trusted: fixture frequencies, section bounds, and recall threshold in the
  test module and `docs/doctoring/section-harmony-known-progression.md`.

### Mitigations

- No file reads, URL intake, subprocesses, or IPC.
- Threshold is a regression floor, not a claim that live masters are solved.

### Test points

- Verse C / chorus G main chords and ≥0.70 weighted recall.
- Reverse order keeps G on the opening window.

### Realistic threats

- A mocked recognizer can keep CI green while live section answers stay wrong.
- A song-wide majority chord can hide a chorus change and send the wrong lock-in cue.

### Remaining risk

- Dry triads are easier than mixed stems. Live-master recall stays a later
  gold-corpus lane and must not be faked with mocked recognizer output.

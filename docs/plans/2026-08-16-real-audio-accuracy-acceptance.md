# Real-audio accuracy acceptance (Tier 1)

**Goal:** Give BandScope a buyer-readable accuracy gate: decoded PCM from a
known WAV must recover the expected chord or tempo, with a versioned report.

**Architecture:** A new `bandscope_analysis.accuracy` package generates
license-clean fixtures, scores them with documented MIR metrics, and emits a
strict case-report schema. Tests write real WAV files and call production
`ChordRecognizer` and `TemporalAnalyzer` helpers. Stem separation stays out
of this slice.

**Tech Stack:** NumPy, soundfile, librosa beat tracking, pytest.

## Security Notes

### Attack surface

Generated WAV files, SHA-256 digests, decoded PCM arrays, and JSON-shaped
accuracy reports.

### Trust boundary

Untrusted: any on-disk fixture bytes and any parsed report mapping.
Trusted: in-repo generators, metric definitions, and registered floors.

### Mitigations

- No network and no shell interpolation.
- Checksum mismatch raises before C-major decode and before tempo scoring.
- Manifest parsing fails closed on missing or mistyped fields.
- Fixtures are short, synthetic, and license-clean.

### Test points

- Deterministic C major digest
- Duration-weighted C recall after file decode
- Silence on disk fails even when a C major array exists in memory
- 120 BPM Acc1 after file decode
- Checksum mismatch through both file evaluators
- Malformed report rejection
- Silence must not pass as C major

### Realistic threats

A tampered fixture or a missing digest could be scored as a pass and then
cited as release evidence.

### Logging and privacy

`TemporalAnalyzer` may log the fixture path. Tests use pytest `tmp_path`
names only. Case reports keep SHA-256, metric, and labels; they do not store
PCM.

### Remaining risk

Tier 1 does not cover Demucs stems, private commercial recordings, or
CPU/GPU numeric parity. Those remain later #770 tiers.

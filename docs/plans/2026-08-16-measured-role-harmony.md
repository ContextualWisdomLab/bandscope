# Measured role harmony from the other stem

**Goal:** When a buyer analyzes a known C major mix, keys and guitar must
show the measured chord, not leftover arrangement defaults.

**Architecture:** `RoleExtractor._build_roles` already receives the
`other`-stem chord as `vocal_chord`. This slice uses that label for
keys-left, keys-right, and acoustic-guitar whenever it is non-empty.
The no-stem demo path keeps `C#` / `Emaj7` / `Eb`.

**Tech Stack:** Existing `ChordRecognizer` on the `other` stem; no new
dependencies.

## Security Notes

### Attack surface

Decoded stem PCM, chord labels written into rehearsal role payloads, and
setup-note strings derived from those labels.

### Trust boundary

Untrusted: stem arrays and any chord symbol the recognizer emits.
Trusted: in-repo fixture generators and the fail-closed empty-stem path.

### Mitigations

- No network and no shell interpolation.
- Empty measured harmony keeps demo defaults instead of inventing a chord.
- Setup notes pass chord labels through `get_setup_note` as opaque strings.

### Test points

- No-stem demo still shows `C#` / `Emaj7` / `Eb`
- C major `other` stem surfaces `C` on keys-left, keys-right, and guitar
- Pipeline assembly matches the same labels
- File-decoded C major WAV still passes duration-weighted recall

### Realistic threats

A buyer could trust hardcoded `Emaj7` on keys-right as if the engine heard
it, then rehearse the wrong harmony.

### Remaining risk

Left/right-hand and guitar still share one `other` stem. Separate keyboard
or guitar stems, and per-section chord changes, remain later work.

# Register-overlap role wiring

**Goal:** Stop fabricating keyboard and vocal clash copy. Attach
FFT-derived register-overlap warnings to rehearsal roles per section so a
player can thin a crowded register before rehearsal.

**Architecture:** `detect_register_overlap` stays a pure in-memory
feature. `RoleExtractor` slices admitted stems to each section window,
formats honest accompaniment labels, and copies roles so warnings and
priority stay section-local.

**Tech Stack:** Python 3.12, numpy real FFT, pytest, existing role
contracts.

## Task

1. Keep heuristic extraction (no stems) at empty `overlapWarnings`.
2. Measure overlap only when every section has a matching boundary;
   missing or mismatched windows fail closed to no warnings.
3. Map `vocals` and `bass` to Lead Vocal and Bass Guitar. Keep mixed
   `other` in player-facing copy as accompaniment, but do not assign that
   evidence to Keyboard Left Hand, Keyboard Right Hand, or Acoustic Guitar.
4. Recalculate rehearsal priority from the section-local warnings.
5. Fail closed to no warnings when mapping throws.

## Security Notes

### Attack surface

- In-memory stem arrays and section boundary timestamps already admitted
  by canonical orchestration
- Role-warning strings rendered in the desktop WebView

### Trust boundary

- Python analysis engine -> shared rehearsal-role contract -> React
  workspace cards

### Mitigations

- No file I/O, network, or subprocess in overlap formatting
- Invalid windows, non-array stems, and mapping exceptions return empty
  warnings
- Copy stays derived from measured shares; mixed `other` is not renamed
  into a specific keyboard or guitar identity

### Test points

- Known 80 Hz bass+accompaniment verse versus 1 kHz chorus fixture
- Empty warnings when stems are absent or section windows are missing
- Mixed `other` overlap warns only the unambiguous stem-side role
- Mapping exception omits warnings without aborting extraction
- Invalid slice windows return empty arrays

### Realistic threats

- Oversized admitted audio already owned by `#781` / `#866`; this feature
  must not add a second sample or stem ceiling
- Warning text injection is not a new channel: strings are engine-generated
  from allowlisted stem and band names

### Remaining risk

- Four-stem `other` still cannot separate keys from guitar. Finer role
  identity needs a later source-separation or user-override path, not
  fabricated names. Presence mapping and demo fixtures now follow the
  same rule: mixed accompaniment does not activate or warn a named
  keyboard or guitar role.

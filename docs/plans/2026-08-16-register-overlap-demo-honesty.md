# Register-overlap demo and presence honesty

**Goal:** Stop the buyer-visible lie that mixed htdemucs `other` is
Keyboard Left Hand, Keyboard Right Hand, or Acoustic Guitar. Demo
fixtures and stem-activity mapping must use the same fail-closed
identity contract as measured overlap warnings.

**Architecture:** `map_stems_to_roles` maps only `vocals` and `bass` to
named roles. Shared-types, browser-fallback, and Rust contract fixtures
reuse engine next-action copy on unambiguous roles only.

**Tech Stack:** Python 3.12 activity mapper, TypeScript shared contracts,
React SectionRoadmap, Tauri serde fixtures.

## Task

1. Keep `other` from activating named keyboard or guitar roles.
2. Replace fabricated `Density warning` / `Melodic overlap` demo copy
   with measured-style next-action wording.
3. Leave keyboard-hand and guitar demo warnings empty.
4. Keep heuristic no-stem extraction unchanged.

## Security Notes

### Attack surface

- In-memory stem-activity booleans already admitted by orchestration
- Demo rehearsal-song strings rendered in the desktop WebView

### Trust boundary

- Python activity mapper -> shared rehearsal-role contract -> React
  workspace cards and Tauri serde fixtures

### Mitigations

- No file I/O, network, or subprocess in activity mapping
- Mixed `other` cannot authorize a named accompaniment role
- Demo copy is allowlisted next-action text, not a user-controlled path

### Test points

- `other`-only activity leaves keys and guitar inactive
- Extractor with bass+other keeps those roles out of `active_roles`
- Shared demo song rejects fabricated identity strings
- SectionRoadmap renders the honest bass next-action sentence

### Realistic threats

- Warning text injection is not a new channel: demo strings are
  repository fixtures, and engine copy stays allowlisted
- Presence under-claiming (accompaniment plays but no named card) is
  preferred to over-claiming three false parts

### Remaining risk

- Four-stem separation still cannot offer a dedicated accompaniment
  role card. Add that role only with a later contract, not by renaming
  `other` into keys or guitar.

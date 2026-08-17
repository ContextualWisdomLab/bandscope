# Stem Lab role-lane honesty

**Goal:** Give the Stem Lab navigation a real rehearsal destination that names the parts to isolate, without inventing playable stem files.

**Architecture:** Stem Lab reads the existing `song -> section -> role` contract and collapses roles into display-unique isolation lanes. Playback stays out of scope until a local stem-file contract exists.

**Tech Stack:** React 19, shared-types, Vitest, Storybook, Korean/English locales, CSS design tokens.

## Security Notes

### Attack surface

- Sidebar navigation and a display-only Stem Lab surface
- Role names, ranges, section labels, and overlap warnings already present in the analyzed song object

### Trust boundary

- User Input Boundary: the song object is untrusted analysis output rendered in WebView
- Storage Boundary: no new stem file, cache, or path API is introduced
- Process / IPC Boundary: no new desktop command, file picker, or audio decoder

### Mitigations

- Do not add generic file or playback APIs
- Do not render caller-supplied HTML; copy is locale-controlled or plain text from typed fields
- Keep next-action copy honest: lanes are isolation targets, not proof a stem file exists
- Leave YouTube, model download, and export paths unchanged

### Test points

- Empty-state next action before analysis
- Demo-song lanes show real role names, ranges, and merged rehearsal priority
- First-seen section labels and range notes are trimmed before display
- Navigation is enabled without a `coming soon` dead end
- Korean and English locale keys stay paired

### Realistic threats

- A fake Play control would train players to click a control that cannot isolate audio
- Inventing a stem path field here would create an unvalidated file-read surface

### Remaining risk

- Host-local stem playback remains a later, allowlisted desktop capability
- Mapped or network audio locality stays outside this UI leaf

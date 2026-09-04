# Tonight's first count-in click

## Decision

The ready rehearsal map plays a local Web Audio click for a trusted song tempo so a player can count in, then check tonight's first range. This is not song playback, stem isolation, or MIR tempo detection.

## Authority

- Trusted click tempo is a finite `song.tempo` in 20–400 BPM already stored on the rehearsal song.
- Count-in length is four beats unless a later meter field is admitted through the shared contract.
- Missing, non-finite, or out-of-range tempo fails closed to an ear-count next action.

## Trust boundary

- Untrusted input: runtime song roots, `tempo`, and section labels.
- Local synthesis only: `AudioContext` oscillators. No files, URLs, subprocesses, IPC, model artifacts, or persistence.
- Missing `AudioContext` is unavailable, not a crash, and still names the next ear-count action.

## Primary standard

W3C. (2024). *Web Audio API 1.1*. World Wide Web Consortium. https://www.w3.org/TR/2024/WD-webaudio-1.1-20241105/

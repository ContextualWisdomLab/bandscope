# Tonight's tap tempo

## Decision

When the ready rehearsal map has no trusted song tempo, the player taps a steady groove (at least four times) to measure a session BPM, then counts in at that tempo and checks tonight's first range. This is not MIR tempo detection, song playback, stem isolation, or a write to `song.tempo`.

## Authority

- A stored tempo is trusted when `song.tempo` is finite and positive under the shared song contract. That hides the tap control so a session cannot override analysis; the narrower 20–400 BPM bound applies only to newly measured taps.
- A session reading needs four taps, a median interval, integer BPM still inside 20–400, and a fastest/slowest interval ratio of at most 2×.
- A pause longer than 3500 ms starts a new window. Malformed clocks and prior state fail closed.

## Trust boundary

- Untrusted input: runtime song roots, `tempo`, tap timestamps, and prior tap state.
- Session memory only. No files, URLs, subprocesses, IPC, model artifacts, or persistence.
- This does not invent a click engine. The next action is to count in at the measured BPM, then check the first range.

## Primary standard

International Organization for Standardization. (2013). *ISO 80000-3:2013 Quantities and units — Part 3: Space and time* (seconds as the time unit for frequency). https://www.iso.org/standard/31888.html

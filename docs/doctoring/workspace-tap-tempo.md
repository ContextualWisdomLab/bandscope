# Tonight's tap tempo

## Decision

When the ready rehearsal map has no trusted song tempo, the player taps a steady groove (at least four times) to measure a session BPM, then counts in at that tempo and checks tonight's first range. This is not MIR tempo detection, song playback, stem isolation, or a write to `song.tempo`.

## Authority

- A stored tempo is trusted when `song.tempo` is finite and positive under the shared song contract. That hides the tap control so a session cannot override analysis; the narrower 20–400 BPM bound applies only to newly measured taps.
- A session reading needs four taps, the median of the bounded history's intervals, and integer BPM still inside 20–400. The median limits the influence of a rushed, late, or paused tap; malformed clocks and prior state fail closed.

## Trust boundary

- Untrusted input: runtime song roots, `tempo`, tap timestamps, and prior tap state.
- Session memory only. No files, URLs, subprocesses, IPC, model artifacts, or persistence.
- This does not invent a click engine. The next action is to count in at the measured BPM, then check the first range.

## Primary standard

International Organization for Standardization. (2019). *ISO 80000-3:2019 Quantities and units — Part 3: Space and time* (current edition; reviewed and confirmed in 2023). https://www.iso.org/standard/64974.html

Kaya, E., & Henry, M. J. (2022). Reliable estimation of internal oscillator properties from a novel, fast-paced tapping paradigm. *Scientific Reports, 12*, 20466. https://doi.org/10.1038/s41598-022-24453-6

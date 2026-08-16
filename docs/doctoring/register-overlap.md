# Register-overlap doctoring

BandScope density warnings are a rehearsal cue, not a studio mix verdict.
They answer: *in this section, which pitched parts share a register so a
player should thin, simplify, or listen for a cue before the room starts.*

## Analysis target

Warnings follow the `song -> section -> role` hierarchy in
`ARCHITECTURE.md`. A song-wide FFT over mixed stems would hide the verse
that is muddy and the chorus that is already clear. Section windows reuse
the same boundary list that drives stem activity, so overlap is a
time-local observation rather than an atomistic song average.

Four-stem separation (`vocals`, `bass`, `drums`, `other`) cannot honestly
name Keyboard Left Hand versus Acoustic Guitar. The mixed `other` stem is
labeled accompaniment. Inventing a keyboard clash from that stem is a
product lie. The same honesty applies to presence: `map_stems_to_roles`
must not mark Keyboard Left Hand, Keyboard Right Hand, or Acoustic Guitar
active just because mixed `other` has energy. Browser-fallback and shared
demo fixtures use the same next-action copy the engine emits, and they
never attach that copy to a named keyboard or guitar role.

Section slicing is fail-closed on invalid temporal evidence. Start/end
bounds and sample rate must be finite, the sample rate must be positive,
and the end must follow the start. The derived sample positions
`start_sec * sample_rate` and `end_sec * sample_rate` must also remain
finite before integer conversion; individually finite values can still
overflow when scaled together. Invalid values return empty stem windows
rather than reaching sample-index conversion, raising from NaN/Infinity or
an overflowed product, or falling back to whole-song overlap. This preserves
the contract that absent or malformed section authority produces no density
warning.

## Psychoacoustic and MIR basis

Auditory scene analysis treats concurrent sources as streams that compete
when they occupy the same spectral region (Bregman, 1990). Simultaneous
masking and critical-band overlap explain why two pitched parts in one
register become hard to hear and hard to lock (Moore, 2012; Fastl &
Zwicker, 2007). Equal-loudness contours (ISO, 2023) are not used as a
loudness meter here; they justify treating low, mid, and high registers as
perceptually different work for a band rather than as interchangeable FFT
bins.

Music-information-retrieval practice extracts spectral energy
distributions as timbre and texture descriptors (Tzanetakis & Cook, 2002;
Peeters, 2004). BandScope uses a three-band magnitude-squared real FFT
share, then reports a pair only when both pitched stems occupy the same
band above a finite threshold. Drums stay unpitched because broadband
transients do not mark a rehearsal register.

Temporal structure uses the same section boundaries as novelty-based form
analysis already present in the engine (Foote, 2000; Paulus et al., 2010).
That keeps overlap aligned with the roadmap a player actually rehearses.
If stems arrive without a matching boundary for every section, the
extractor emits no overlap warning rather than averaging the whole song.

## What the player should do next

Copy is action-first: name the crowded register, name the two sides, and
tell the player to thin one part in *this* section. It does not declare a
correct voicing.

## Security and test boundary

Overlap analysis operates on already-admitted in-memory arrays. It adds no
file, network, subprocess, model, database, or IPC authority. Direct tests
cover finite and non-finite section/sample-rate inputs, finite inputs whose
scaled sample-index products overflow, silent or malformed stems, threshold
validation, section-local slicing, mixed-`other` identity, and de-duplicated
next-action warning copy.

## References

Bregman, A. S. (1990). *Auditory scene analysis: The perceptual
organization of sound*. The MIT Press.

Fastl, H., & Zwicker, E. (2007). *Psychoacoustics: Facts and models*
(3rd ed.). Springer. https://doi.org/10.1007/978-3-540-68888-4

Foote, J. (2000). Automatic audio segmentation using a measure of audio
novelty. In *Proceedings of the IEEE International Conference on
Multimedia and Expo* (Vol. 1, pp. 452–455). IEEE.
https://doi.org/10.1109/ICME.2000.869637

International Organization for Standardization. (2023). *Acoustics —
Normal equal-loudness-level contours* (ISO 226:2023).

Moore, B. C. J. (2012). *An introduction to the psychology of hearing*
(6th ed.). Brill.

Paulus, J., Müller, M., & Klapuri, A. (2010). Audio-based music structure
analysis. In *Proceedings of the 11th International Society for Music
Information Retrieval Conference* (pp. 625–630). ISMIR.

Peeters, G. (2004). *A large set of audio features for sound description
(similarity and classification) in the CUIDADO project* (Technical
report). IRCAM.

Tzanetakis, G., & Cook, P. (2002). Musical genre classification of audio
signals. *IEEE Transactions on Speech and Audio Processing, 10*(5),
293–302. https://doi.org/10.1109/TSA.2002.800560

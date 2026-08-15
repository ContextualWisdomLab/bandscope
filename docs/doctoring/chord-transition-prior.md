# Chord-transition prior evidence

## Status

**Active Draft PR evidence.** This record documents the chord-transition correctness repair developed on PR #732. It is not protected-`develop` shipped truth until the implementation is merged and revalidated on the protected branch.

## Buyer-visible problem

BandScope smooths frame-level chord evidence with a 25-state major/minor/no-chord HMM before emitting rehearsal chord segments. The transition matrix therefore influences which chord label survives when acoustic evidence is ambiguous. A wrong harmonic prior can turn a plausible rehearsal progression into an unrelated chord change even when the frame observations themselves are sound.

The existing relative-key calculation was reversed:

- a major chord root used `+3` semitones for its relative minor target; and
- a minor chord root used `+9` semitones for its relative major target.

In pitch-class arithmetic that maps C major toward D♯ minor instead of A minor, and A minor toward F♯ major instead of C major. The corrected invariant is:

- major root → relative minor root: `+9 mod 12` semitones;
- minor root → relative major root: `+3 mod 12` semitones.

The repair changes only the relation used to populate the existing heuristic transition prior. It does not change the 24-major/minor-plus-no-chord vocabulary, observation model, Viterbi algorithm, Rust/NumPy parity boundary, filesystem/network authority, or persistence format.

## Research rationale

Lee and Slaney (2006) established supervised-HMM automatic chord recognition as a sequence-decoding problem in which transition probabilities are part of the model rather than presentation-only metadata. Masada and Bunescu (2019) likewise identify chord-transition information as useful harmonic-syntax evidence and note that transition distributions depend on tonal context. Gotham et al. (2023) provide a large, reproducible functional-harmony meta-corpus suitable for measuring repertoire-dependent transition behavior instead of assuming that chord transitions are equiprobable.

These sources support two engineering conclusions. First, a transition-prior defect is an accuracy defect because the prior participates directly in decoding. Second, the current hand-authored prior should be treated as a bounded baseline rather than a universal model of harmony: future accuracy work should estimate or calibrate transition probabilities against documented corpora and stratify by musical context instead of silently increasing heuristic complexity.

## Test-first verification contract

The regression test names musically recognizable relative pairs and compares them with the exact unrelated pairs favored by the old formula:

- `C → Am` must have greater transition probability than `C → D#m`;
- `Am → C` must have greater transition probability than `Am → F#`.

This catches the old formula in both directions without depending on an implementation constant such as the raw `related_prob`. The production correction is then one bounded pitch-class formula change. Because both the native Rust Viterbi path and the NumPy reference consume the same Python-built transition matrix, the relation is shared across the two numerical paths and remains subject to the repository's exact Rust-to-NumPy parity tests.

## Accuracy follow-up

A commercial-quality next step is corpus-backed calibration rather than additional unvalidated hand rules. Candidate evaluation should compare the current heuristic prior with learned/key-conditioned priors on an openly documented chord corpus and report sequence metrics such as chord-symbol recall/weighted chord symbol recall together with transition-specific confusion. Any learned prior must retain deterministic fixtures for common progressions and must not reduce the existing native/reference numerical parity or fail-closed behavior.

## References

Gotham, M., Micchi, G., López, N. N., & Sailor, M. (2023). When in Rome: A meta-corpus of functional harmony. *Transactions of the International Society for Music Information Retrieval, 6*(1), 150–166. https://doi.org/10.5334/tismir.165

Lee, K., & Slaney, M. (2006). Automatic chord recognition from audio using an HMM with supervised learning. In *Proceedings of the 7th International Conference on Music Information Retrieval (ISMIR 2006)* (pp. 133–137). University of Victoria. https://ismir.net/conferences/ismir-2006/

Masada, K., & Bunescu, R. C. (2019). Chord recognition in symbolic music: A segmental CRF model, segment-level features, and comparative evaluations on classical and popular music. *Transactions of the International Society for Music Information Retrieval, 2*(1), 1–13. https://doi.org/10.5334/tismir.18

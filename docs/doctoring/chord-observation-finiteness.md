# Chord observation finiteness

## Status

**Active Draft PR evidence.** This record documents the observation-probability robustness contract on PR #732. It is not protected-`develop` shipped truth until the implementation is merged and revalidated on the protected branch.

## Buyer-visible problem

The chord HMM consumes per-frame observation probabilities. A single non-finite chromagram bin, template-similarity score, or RMS value turns the corresponding Viterbi column into `NaN`. The decoder then emits an arbitrary or empty rehearsal chord where the player needed either a labeled chord or an honest unknown frame.

Missing metadata and invalid metadata are different events:

- missing similarity or RMS is unknown evidence and must stay neutral;
- non-finite similarity invalidates the whole frame and must fall back to a uniform chord distribution;
- non-finite RMS or chromagram variance is unknown, not evidence of silence.

The next action for a player is unchanged: read the surviving chord label, or treat a neutralized frame as “listen again” rather than as a forced no-chord cut.

## Research rationale

Rabiner (1989) defines HMM decoding over valid observation probabilities; a non-finite column is outside that model. Lee and Slaney (2006) treat frame-level chord observations as the input to Viterbi, so observation integrity is an accuracy precondition rather than a presentation detail. Mauch and Dixon (2010) likewise keep the observation model separate from the transition prior, which is why this repair stays inside probability construction and does not change the 25-state vocabulary or the Rust production decoder.

## Test-first verification contract

- a frame with any non-finite similarity stays finite and column-normalized;
- that frame uses a uniform 24-chord fallback and does not raise the no-chord state above the chord mass;
- non-finite RMS or chromagram variance does not satisfy the silence thresholds;
- the vectorized implementation matches an independent framewise scalar oracle on the same corrupt inputs;
- `recognize()` still forwards the full audio array to the harmonic separator, so duration policy stays upstream.

## References

Lee, K., & Slaney, M. (2006). Automatic chord recognition from audio using an HMM with supervised learning. In *Proceedings of the 7th International Conference on Music Information Retrieval (ISMIR 2006)* (pp. 133–137). University of Victoria. https://ismir.net/conferences/ismir-2006/

Mauch, M., & Dixon, S. (2010). Approximate note transcription for the improved identification of difficult chords. In *Proceedings of the 11th International Society for Music Information Retrieval Conference (ISMIR 2010)* (pp. 135–140). International Society for Music Information Retrieval. https://ismir.net/conferences/ismir-2010/

Rabiner, L. R. (1989). A tutorial on hidden Markov models and selected applications in speech recognition. *Proceedings of the IEEE, 77*(2), 257–286. https://doi.org/10.1109/5.18626

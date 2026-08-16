# Section harmony known-progression accuracy

Next action: keep verse and chorus as separate harmony answers. Do not let a
song-wide chord track replace the `song -> section -> role` contract. Run
`uv run --project services/analysis-engine pytest tests/test_section_harmony_audio_accuracy.py`
before claiming a recognizer or section-summary change is rehearsal-ready.

## Why this lock exists

Players copy from the recording. If the engine hears a C-major verse and a
G-major chorus and then prints one song-level chord, the room wastes the first
pass arguing about the form. Duration-weighted chord symbol recall against
annotated windows is the evaluation unit used in automatic chord estimation
reviews (Harte et al., 2005; McVicar et al., 2014). Fujishima (1999) established
chroma-template matching as the baseline this engine still uses.

The lock synthesizes a dry two-section take (C major, then G major, and the
reverse order) so CI does not depend on a copyrighted master. The true
parameters are the section windows and triad roots. The estimate must recover
each section's main chord and keep weighted recall at or above 0.70.

For evidence integrity, matching recognizer intervals are clipped to each true
section window and unioned before matched duration is accumulated. Duplicate
or overlapping estimates therefore cannot count the same annotated time twice
or inflate recall above the actual fraction of section time recovered.

## Held values

- Sample rate: 22050 Hz
- Section length: 4.0 s
- Minimum duration-weighted recall: 0.70
- Canonical roots: `C` then `G`, and `G` then `C`
- Minor labels (`Cm`, `Gm`) must not satisfy a major window
- Overlapping matching estimates count only the union of covered section time

## References

Fujishima, T. (1999). Realtime chord recognition of musical sound: A system
using Common Lisp Music. In *Proceedings of the International Computer Music
Conference* (pp. 464–467). International Computer Music Association.

Harte, C., Sandler, M., Abdallah, S., & Gómez, E. (2005). Symbolic
representation of musical chords: A proposed syntax for text annotations. In
*Proceedings of the 6th International Conference on Music Information Retrieval*
(pp. 66–71).

McVicar, M., Santos-Rodríguez, R., Ni, Y., & De Bie, T. (2014). Automatic chord
estimation from audio: A review of the state of the art. *IEEE/ACM Transactions
on Audio, Speech, and Language Processing, 22*(2), 556–575.
https://doi.org/10.1109/TASLP.2013.2294580

## Security Notes

- Attack surface: in-memory float audio arrays and recognizer segment timings
  only. The lock does not read user files, URLs, or subprocess output.
- Trust boundary: synthetic fixtures and annotated section windows are trusted
  test input. Production recognizer output remains untrusted evidence until it
  is scored against those annotations.
- Mitigations: no file I/O, no network, no shell; major/minor labels remain
  distinct; matching intervals are unioned before duration accumulation so
  duplicate-time evidence cannot create a false high score. Failures stay
  inside pytest.
- Test points: `test_duration_weighted_symbol_recall_unions_duplicate_time`,
  `test_section_harmony_recovers_verse_c_then_chorus_g`, and
  `test_section_harmony_keeps_later_c_off_the_opening_window`.

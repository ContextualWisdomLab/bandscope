# Functional-label accuracy preregistration contract

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228  
Parent: `docs/traceability/mir/structure-feature-noninferiority.md`

## Problem

The structure noninferiority registration originally named functional-label accuracy as `mirex2025.frame_level_accuracy` and later froze a BandScope-selected 100 ms frame size. That was still not a reproducible implementation identity. The MIREX task page describes frame-level ACC conceptually and gives 10 ms or 100 ms as examples, but the current official `ismir-mirex/mirex-evaluation` repository contains the executable MIREX 2025 reproduction used as the stronger authority for evaluator behavior.

At `ismir-mirex/mirex-evaluation@b9fa0b0b32e2145af31f35830f78fc9d09a4301b`, `music_structure_analysis/eval_script.py::calculate_accuracy` uses a default `frame_hop` of 0.2 seconds. It creates frame times with `np.arange(0, gt_duration, frame_hop)`, advances a segment while `t >= segment_end`, and counts all reference-grid frames in the denominator. Therefore the former 100 ms registration did not reproduce the current official evaluator and left the exact time-grid authority implicit.

## Decision

Schema v1 now requires the `functional_label_accuracy` registration to contain, in addition to its noninferiority margin:

- `implementation = ismir-mirex/mirex-evaluation@b9fa0b0b32e2145af31f35830f78fc9d09a4301b:music_structure_analysis.eval_script.calculate_accuracy`;
- `frame_size_seconds = 0.2`;
- `frame_grid_contract_version = 1.0`;
- `annotation_contract_version = 1.0`;
- `label_mapping_contract_version = 1.0`.

`frame_grid_contract_version = 1.0` means the MIREX 2025 reproduction semantics at that pinned upstream commit:

- the grid origin is 0 seconds;
- frame points are `0.0, 0.2, 0.4, ...` while the point is strictly less than the ground-truth duration;
- an exact segment-end boundary belongs to the following segment because the evaluator advances while `t >= segment_end`;
- a final partial 200 ms span contributes a frame when its starting grid point is still below the ground-truth duration;
- every reference-grid frame contributes to the denominator;
- a frame contributes to the numerator only when the reference and prediction labels match and the reference label is not `other`.

This closes the previously open frame-grid decision. The 200 ms value is not inferred from the prose examples on the MIREX wiki; it is bound to the executable standardized-evaluation source and its exact commit.

## Annotation and label-mapping boundary

`annotation_contract_version = 1.0` remains implemented by `scripts/research/parse_structure_functional_annotations.py`. It consumes the already-admitted read-only annotation snapshot and parses BandScope-local UTF-8 `start<TAB>end<TAB>label` rows into exact rational boundaries. This local TSV is not the MIREX submission transport syntax.

The normalized segmentation must start at 0.0, preserve source order, contain strictly positive segments with no gaps or overlaps, and end exactly at `decoded_frames / sample_rate_hz`. The parser never reopens a corpus path or repairs malformed evidence.

`label_mapping_contract_version = 1.0` remains a fail-closed identity mapping at the acceptance boundary. The admitted normalized annotation bytes must already contain one of:

`intro`, `verse`, `chorus`, `bridge`, `inst`, `outro`, `silence`.

The official evaluator's raw-label preprocessing is broader: it case-folds labels, applies substring mappings such as `solo` → `inst`, and maps otherwise unknown labels to `other`; `other` reference frames remain in the ACC denominator but cannot contribute to the numerator. BandScope does not run that mutable normalization after preregistration. If a source corpus needs the official mapping, that transformation must be reviewed and applied before preregistration, and the resulting normalized annotation bytes receive their own `annotation_sha256`.

This separation is deliberate. The pinned upstream evaluator is authoritative for ACC time-grid and scoring semantics, while BandScope's content-addressed corpus boundary prevents label-mapping decisions from changing after candidate results are visible.

The MIREX task page also continues to expose a vocabulary inconsistency: descriptive prose includes `other`, while the operational seven-label output list includes `silence`. The local v1 annotation contract therefore does not guess between them at run time. A different mapping policy requires a new mapping-contract version and preregistration digest.

## RED → GREEN lineage

The predecessor branch froze 100 ms but left the official implementation identity and frame-grid behavior unresolved. Fresh inspection of the current standardized evaluator at `b9fa0b0b32e2145af31f35830f78fc9d09a4301b` showed that its MIREX 2025 reproduction uses a 200 ms hop with explicit `np.arange` and segment-boundary behavior.

RED `6c20500bf31be88cd145f30fe7355a915066bdfc` changed the focused policy test to require the exact upstream commit/function identity, `frame_size_seconds = 0.2`, and `frame_grid_contract_version = 1.0`; the predecessor validator rejected that registration and still accepted the stale generic 100 ms contract.

GREEN `0f1e3e732154ff0ea94beb5a60e5702ed46c2453` changed the closed-world validator contract to the pinned official evaluator and 200 ms grid. Fixture alignment `86e6be0b41547ecd14b4f837ff6c88cf8f770b0b` and `02c73b1fff55def189bed8fe2d34d4b5ee83cb0a` moved the shared evidence and corpus-admission registrations onto the same contract instead of leaving successful tests on the stale 100 ms shape.

The earlier immutable parser lineage remains valid: parser RED `cc4a166cc9e1496cd562f7d79b9ffa30f6ca19c2` → GREEN `0ee4a6aed49c8f001da451ca63c5f20e52832f5c`, with authority correction `52b6c7362baa00151f908a24cadbb1efeddd2101` separating the BandScope TSV representation from the MIREX submission format.

## Constraints and rejected alternatives

Keeping 100 ms merely because the MIREX wiki lists it as an example was rejected. The executable standardized evaluator is more specific and currently uses 200 ms for the MIREX 2025 reproduction.

Keeping only a symbolic `mirex2025.frame_level_accuracy` implementation name was rejected because it cannot identify the code revision or distinguish future evaluator changes.

Using `mir_eval.util.intervals_to_samples` for ACC was rejected for this contract. It is a useful MIR utility, but the current official MIREX evaluator implements ACC with its own `np.arange` grid and pointer traversal; substituting another grid would no longer be exact evaluator parity.

Automatically normalizing labels during the acceptance run was rejected. Mapping `verse1`, `solo`, mixed case, or unknown labels after corpus bytes are frozen would reintroduce post-result freedom over the dependent variable. Source-vocabulary normalization belongs before preregistration and is content-addressed through `annotation_sha256`.

Parsing annotations inside resource admission was rejected. Resource admission owns byte identity and immutable handoff; Signal-MIR owns scientific interpretation and measurement.

## Claim boundary and next work

This contract now freezes the ACC evaluator identity, 200 ms grid, boundary-point behavior, final-partial-frame behavior, annotation interpretation, and label-mapping boundary. It does not yet implement the BandScope runner that must demonstrate parity with the pinned evaluator on admitted normalized annotations, approve the corpus or noninferiority margins, derive aggregate/paired uncertainty, or justify a production CQT → STFT switch.

The next scientific slice is an executable parity-tested ACC runner that consumes the exact admitted PCM/annotation snapshots and reproduces the pinned evaluator semantics without reopening workstation paths or performing post-preregistration label mapping. Production acceptance still requires rights-cleared real decoded audio, independently reviewed normalized annotations, preregistered aggregation and paired uncertainty, paired CQT/STFT execution on the same admitted signal/runtime identity, and current-head release evidence.

Synthetic annotation fixtures remain unit evidence only and are not counted as production scientific acceptance.

## References

MIREX. (2026). *Music Structure Analysis*. International Music Information Retrieval Systems Evaluation Laboratory. https://music-ir.org/mirex/wiki/2026:Music_Structure_Analysis

MIREX Evaluation contributors. (2026). *music_structure_analysis/eval_script.py* (commit `b9fa0b0b32e2145af31f35830f78fc9d09a4301b`). GitHub. https://github.com/ismir-mirex/mirex-evaluation/blob/b9fa0b0b32e2145af31f35830f78fc9d09a4301b/music_structure_analysis/eval_script.py

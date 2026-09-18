# Functional-label accuracy preregistration contract

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228  
Parent: `docs/traceability/mir/structure-feature-noninferiority.md`

## Problem

The structure noninferiority registration originally named functional-label accuracy as `mirex2025.frame_level_accuracy` and later froze a BandScope-selected 100 ms frame size. That was still not a reproducible implementation identity. The MIREX task page describes frame-level ACC conceptually and gives 10 ms or 100 ms as examples, but the current official `ismir-mirex/mirex-evaluation` repository contains the executable MIREX 2025 reproduction used as the stronger authority for evaluator behavior.

At `ismir-mirex/mirex-evaluation@b9fa0b0b32e2145af31f35830f78fc9d09a4301b`, `music_structure_analysis/eval_script.py::calculate_accuracy` uses a default `frame_hop` of 0.2 seconds. It creates frame times with `np.arange(0, gt_duration, frame_hop)`, advances a segment while `t >= segment_end`, and counts all reference-grid frames in the denominator. Therefore the former 100 ms registration did not reproduce the current official evaluator and left the exact time-grid authority implicit.

Even after the evaluator and annotation parser were pinned, a second reproducibility gap remained: the ACC adapter was not connected to the corpus-admission callback. A later experiment runner could therefore have reopened local audio or annotation paths, decoded again, or supplied different PCM to the baseline and candidate lanes while still producing syntactically valid metric receipts.

## Decision

Schema v1 requires the `functional_label_accuracy` registration to contain, in addition to its noninferiority margin:

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

This closes the frame-grid decision. The 200 ms value is not inferred from prose examples on the MIREX wiki; it is bound to the executable standardized-evaluation source and its exact commit.

## Annotation and label-mapping boundary

`annotation_contract_version = 1.0` is implemented by `scripts/research/parse_structure_functional_annotations.py`. It consumes the already-admitted read-only annotation snapshot and parses BandScope-local UTF-8 `start<TAB>end<TAB>label` rows into exact rational boundaries. This local TSV is not the MIREX submission transport syntax.

The normalized segmentation must start at 0.0, preserve source order, contain strictly positive segments with no gaps or overlaps, and end exactly at `decoded_frames / sample_rate_hz`. The parser never reopens a corpus path or repairs malformed evidence.

`label_mapping_contract_version = 1.0` is a fail-closed identity mapping at the acceptance boundary. The admitted normalized annotation bytes must already contain one of:

`intro`, `verse`, `chorus`, `bridge`, `inst`, `outro`, `silence`.

The official evaluator's raw-label preprocessing is broader: it case-folds labels, applies substring mappings such as `solo` → `inst`, and maps otherwise unknown labels to `other`; `other` reference frames remain in the ACC denominator but cannot contribute to the numerator. BandScope does not run that mutable normalization after preregistration. If a source corpus needs the official mapping, that transformation must be reviewed and applied before preregistration, and the resulting normalized annotation bytes receive their own `annotation_sha256`.

This separation is deliberate. The pinned upstream evaluator is authoritative for ACC time-grid and scoring semantics, while BandScope's content-addressed corpus boundary prevents label-mapping decisions from changing after candidate results are visible.

The MIREX task page also continues to expose a vocabulary inconsistency: descriptive prose includes `other`, while the operational seven-label output list includes `silence`. The local v1 annotation contract therefore does not guess between them at run time. A different mapping policy requires a new mapping-contract version and preregistration digest.

## Executable evaluator adapter

`scripts/research/evaluate_structure_functional_accuracy.py` owns the repository-side adapter for the preregistered normalized seven-label subset. It does not read files, map source labels, or duplicate the parser's `FunctionalSegment` value object. It accepts the parser-owned structural contract, validates continuous full-duration normalized segmentations, uses NumPy's 200 ms `arange` grid and the pinned evaluator's `t >= segment_end` pointer semantics, and returns track-level ACC plus frame counts and frame times.

The adapter deliberately rejects `other` at its input boundary because `other` is not part of the preregistered normalized corpus vocabulary. This is not a claim that the official evaluator lacks `other`; it means upstream raw-label mapping must be completed before preregistration so the acceptance run cannot change labels after results are visible.

## Exact admitted-track paired consumer

`scripts/research/evaluate_admitted_structure_track.py` now implements the functional-ACC consumer for `verify_structure_corpus.py`'s in-process `track_consumer` boundary. It receives only the already-verified track ID, immutable canonical PCM memoryview, immutable annotation snapshot, and registered sample rate. It does not receive or reopen workstation paths.

For each admitted track it:

- requires the PCM and annotation handoffs to be read-only contiguous memoryviews;
- derives `decoded_frames` from the canonical mono-float32 byte length and the exact duration as `decoded_frames / sample_rate_hz`;
- parses the reference segmentation from the admitted annotation bytes with the v1 parser;
- invokes the preregistered baseline and candidate segmentation lanes on the **same PCM memoryview object**, sample rate, and exact duration;
- evaluates both outputs with the pinned 200 ms functional-ACC adapter;
- records path-free evidence containing the track ID, PCM SHA-256, annotation SHA-256, frame/sample-rate identity, and baseline/candidate ACC frame counts;
- rejects duplicate measurement of the same track ID rather than letting one registered item inflate paired evidence.

The segmentation callbacks intentionally do not receive `track_id`. The measurement boundary therefore does not offer a built-in track-specific dispatch key that could select a different algorithm after corpus identity is known. This does not prove that arbitrary caller code is scientifically valid; the eventual baseline and candidate segmenter implementations still have to be pinned by the preregistration and reviewed before real-audio execution.

This consumer is research measurement infrastructure, not a production feature switch. It does not select the corpus, choose noninferiority margins, implement aggregation or uncertainty, alter `sections/segmenter.py`, or count synthetic fixtures as scientific acceptance.

## RED → GREEN lineage

The predecessor branch froze 100 ms but left the official implementation identity and frame-grid behavior unresolved. Fresh inspection of the current standardized evaluator at `b9fa0b0b32e2145af31f35830f78fc9d09a4301b` showed that its MIREX 2025 reproduction uses a 200 ms hop with explicit `np.arange` and segment-boundary behavior.

RED `6c20500bf31be88cd145f30fe7355a915066bdfc` changed the focused policy test to require the exact upstream commit/function identity, `frame_size_seconds = 0.2`, and `frame_grid_contract_version = 1.0`; the predecessor validator rejected that registration and still accepted the stale generic 100 ms contract.

GREEN `0f1e3e732154ff0ea94beb5a60e5702ed46c2453` changed the closed-world validator contract to the pinned official evaluator and 200 ms grid. Fixture alignment `86e6be0b41547ecd14b4f837ff6c88cf8f770b0b` and `02c73b1fff55def189bed8fe2d34d4b5ee83cb0a` moved the shared evidence and corpus-admission registrations onto the same contract instead of leaving successful tests on the stale 100 ms shape.

Evaluator RED `5cffef1a5db37b700ee7a27012c0f8324855665f` added executable parity cases for the pinned upstream identity, exact-boundary advancement, exclusion of a frame at exact track duration, inclusion of a trailing partial span when its grid point is below duration, and fail-closed normalized labels. GREEN `e72b29565a6d906a9955907656cbae97cffa471a` implemented the adapter. Consolidation `c84c0acdf25159f9aa066e21f9420d9fdf72c50a` / `fe3ed61a3b1926af6b39b6302d6f857979f9bccc` removed a duplicate segment value object so the evaluator consumes the parser-owned segment contract instead.

The immutable parser lineage remains parser RED `cc4a166cc9e1496cd562f7d79b9ffa30f6ca19c2` → GREEN `0ee4a6aed49c8f001da451ca63c5f20e52832f5c`, with authority correction `52b6c7362baa00151f908a24cadbb1efeddd2101` separating the BandScope TSV representation from the MIREX submission format.

Admitted-track integration RED `b42297e2300d3f9b085206ccfc796fd8bb7713b6` requires both measurement lanes to receive the exact same read-only PCM handoff, binds evidence to PCM/annotation hashes, rejects malformed or mutable PCM before either segmenter executes, and rejects duplicate track measurement. GREEN `a3bfbe2b4e76b62ba3446241bdfb467841bdaa93` implements that paired consumer without changing production segmentation.

## Constraints and rejected alternatives

Keeping 100 ms merely because the MIREX wiki lists it as an example was rejected. The executable standardized evaluator is more specific and currently uses 200 ms for the MIREX 2025 reproduction.

Keeping only a symbolic `mirex2025.frame_level_accuracy` implementation name was rejected because it cannot identify the code revision or distinguish future evaluator changes.

Using `mir_eval.util.intervals_to_samples` for ACC was rejected for this contract. It is a useful MIR utility, but the current official MIREX evaluator implements ACC with its own `np.arange` grid and pointer traversal; substituting another grid would no longer be exact evaluator parity.

Automatically normalizing labels during the acceptance run was rejected. Mapping `verse1`, `solo`, mixed case, or unknown labels after corpus bytes are frozen would reintroduce post-result freedom over the dependent variable. Source-vocabulary normalization belongs before preregistration and is content-addressed through `annotation_sha256`.

Parsing annotations inside resource admission was rejected. Resource admission owns byte identity and immutable handoff; Signal-MIR owns scientific interpretation and measurement.

Reopening or re-decoding the corpus separately for CQT and STFT was rejected. Paired measurement must consume the same immutable admitted PCM identity; otherwise a feature comparison can be confounded by decode or local-file drift.

Copying the PCM into independent baseline/candidate input buffers at this boundary was rejected. Both lanes now receive the same read-only memoryview object, making input identity explicit while preventing mutation through the consumer API.

Computing an aggregate or confidence interval in the admitted-track consumer was rejected. Aggregation and paired uncertainty remain unapproved scientific decisions and must be preregistered before candidate results are visible.

## Security Notes

- The consumer adds no filesystem, subprocess, network, model-download, or generic execution capability.
- PCM and annotation material are accepted only as immutable in-process views from resource admission; malformed shape or mutability fails before either measurement lane executes.
- Durable functional evidence contains content digests and measurement values, not workstation paths or raw licensed audio.
- The injected segmentation callables remain a code-review boundary. Real-audio execution must use preregistered repository-owned implementations; arbitrary runtime plugin loading is not introduced here.

## Claim boundary and next work

This contract now freezes the ACC evaluator identity, 200 ms grid, boundary-point behavior, final-partial-frame behavior, annotation interpretation, label-mapping boundary, repository-owned adapter, and the exact admitted-track paired functional-ACC handoff. It still does not implement the actual paired CQT/STFT segmentation lanes, the remaining recognized boundary/repetition metrics, approved aggregation/paired uncertainty, corpus/margin approval, or a production CQT → STFT switch.

The next causal scientific slice is to implement repository-owned baseline/candidate structure-measurement lanes over this same admitted PCM boundary and add the recognized boundary/deviation/repetition metrics without changing production behavior. Aggregation and paired uncertainty must then be reviewed and preregistered before any rights-cleared real-corpus candidate result is inspected.

Production acceptance still requires rights-cleared real decoded audio, independently reviewed normalized annotations, paired CQT/STFT execution on the same admitted signal/runtime identity, recognized track-level metrics, approved aggregate/CI evidence, current-head protected checks, and independent review.

Synthetic fixtures exercise only the measurement contract and are not production scientific acceptance.

## References

MIREX. (2026). *Music Structure Analysis*. International Music Information Retrieval Systems Evaluation Laboratory. https://music-ir.org/mirex/wiki/2026:Music_Structure_Analysis

MIREX Evaluation contributors. (2026). *music_structure_analysis/eval_script.py* (commit `b9fa0b0b32e2145af31f35830f78fc9d09a4301b`). GitHub. https://github.com/ismir-mirex/mirex-evaluation/blob/b9fa0b0b32e2145af31f35830f78fc9d09a4301b/music_structure_analysis/eval_script.py

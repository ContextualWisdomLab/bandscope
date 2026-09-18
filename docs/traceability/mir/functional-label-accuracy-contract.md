# Functional-label accuracy preregistration contract

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228  
Parent: `docs/traceability/mir/structure-feature-noninferiority.md`

## Problem

The structure noninferiority registration previously identified functional-label accuracy only as `mirex2025.frame_level_accuracy`. That name is not a complete measurement contract. The MIREX 2025 task describes frame-level ACC by converting system and ground-truth segmentations to a time series at a fine temporal resolution and gives 10 ms or 100 ms as examples; it does not fix one unique frame size. The same task also requires source dataset labels to be mapped to a target functional vocabulary before evaluation.

Without freezing the frame grid and annotation/mapping interpretation before candidate results exist, two otherwise identical result receipts could report different ACC values while both claiming the same preregistered metric identity. That is post-result measurement freedom, not reproducible evidence.

## Decision

Schema v1 now requires the `functional_label_accuracy` metric registration to contain all of the following in addition to its noninferiority margin:

- `implementation = mirex2025.frame_level_accuracy`;
- `frame_size_seconds = 0.1`;
- `annotation_contract_version = 1.0`;
- `label_mapping_contract_version = 1.0`.

The 100 ms frame grid is a BandScope preregistration choice, not a claim that MIREX mandates 100 ms. MIREX 2025 explicitly gives both 10 ms and 100 ms as examples. BandScope selects 100 ms before results because the same experiment already preregisters a 100 ms frame size for `mir_eval.segment.pairwise`; using one fixed temporal grid avoids an otherwise unnecessary second discretization convention in this experiment.

`annotation_contract_version = 1.0` is implemented by `scripts/research/parse_structure_functional_annotations.py`. The parser consumes only the read-only annotation snapshot already admitted by the corpus boundary. Version 1 uses a BandScope-local UTF-8 normalized TSV with exactly three fields per segment: `start<TAB>end<TAB>label`. This is **not** the MIREX 2025 submission-file syntax: the MIREX task specifies a text/JSON-parsable list of per-track segment predictions. BandScope's local TSV is a deliberately simpler frozen corpus-annotation representation that preserves the same start/end/label semantics before evaluation.

Times are parsed as finite decimal values into exact rational boundaries rather than binary floating-point approximations. The normalized segmentation must start at 0.0, preserve source order, have strictly positive segment duration, contain no gaps or overlaps, and end exactly at `decoded_frames / sample_rate_hz`. The parser never reopens a corpus path or repairs malformed evidence.

`label_mapping_contract_version = 1.0` uses a fail-closed identity mapping at the measurement boundary. Normalized annotations presented to ACC must already use exactly one of these seven lowercase labels:

`intro`, `verse`, `chorus`, `bridge`, `inst`, `outro`, `silence`.

No case folding, stemming, prefix stripping (`verse1` → `verse`), synonym mapping (`solo` → `inst`), or catch-all remapping is allowed inside the acceptance run. If a rights-cleared source corpus uses another vocabulary, its mapping must be reviewed and applied before preregistration; the resulting normalized annotation bytes receive their own `annotation_sha256` and therefore become part of the frozen corpus identity.

This deliberately avoids silently resolving an ambiguity in the current MIREX 2025 page: its narrative description mentions an `other` category, while its operational output-format section says submitted labels must be one of `intro`, `verse`, `chorus`, `bridge`, `inst`, `outro`, or `silence`. BandScope v1 follows the operational output-format list and rejects `other` rather than guessing how it should map. If the scientific review later adopts another mapping, that requires a new mapping-contract version and a new preregistration digest before results are inspected.

Corpus admission intentionally does not parse or rewrite annotations. Resource admission owns byte identity and immutable handoff; Signal-MIR owns interpretation and measurement. The future experiment runner must call the versioned parser on the admitted read-only annotation view and then evaluate both CQT and STFT against that same parsed evidence.

## RED → GREEN lineage

RED `6f19315d0092004499fea7e581e1f00cc6d021c1` added a focused policy test requiring functional-label ACC to freeze frame resolution plus annotation and label-mapping contract versions. The predecessor validator rejected those fields as unregistered and still accepted the older under-specified metric shape.

GREEN `03b26bf203c4784029f75296d308eed644d7a5eb` makes those three fields mandatory closed-world configuration for `functional_label_accuracy`. Fixture alignment `4936cefd1a2b13fcd75a25e0d622ca4ce0ba9373` and `1839586fb1446f28654494c154182b1c415ab757` updates the shared evidence and corpus-admission registrations so successful tests exercise the new contract rather than bypassing it.

Parser RED `cc4a166cc9e1496cd562f7d79b9ffa30f6ca19c2` defines the executable v1 interpretation contract: exact three-column local TSV, exact rational boundaries, continuous full-duration coverage, registered labels only, finite times, and read-only input. GREEN `0ee4a6aed49c8f001da451ca63c5f20e52832f5c` implements that contract without adding label normalization, filesystem access, metric computation, or scientific threshold logic. Authority correction `52b6c7362baa00151f908a24cadbb1efeddd2101` removes the inaccurate implication that this local TSV is the MIREX 2025 submission format while retaining the same executable semantics.

The focused regressions require missing preregistration fields and post-hoc changes to the 100 ms frame, annotation contract version, or label mapping contract version to fail validation, and they reject mapping freedom such as `Verse`, `verse1`, `solo`, or `other` at the parser boundary.

## Open evaluator decision: frame-grid sampling semantics

Freezing `frame_size_seconds = 0.1` is necessary but not yet sufficient to implement ACC. MIREX 2025 does not specify the exact sample-point convention at segment boundaries or how a final partial 100 ms interval is represented. Current `mir_eval.util.intervals_to_samples` is a relevant implementation reference: it exposes `offset=0`, `sample_size=0.1`, creates sample times from zero, and uses `floor(max_interval / sample_size)` samples. That behavior is authoritative for that utility, but the MIREX 2025 task page does not state that ACC is computed by this exact helper.

An exploratory RED `73ddb084c6e7279f4fc3d92ee9c8d0c8edf50071` tried to add `frame_grid_contract_version` before the evaluator convention itself had been selected. Ordinary descendant `cd069263a947a762a1cc66e8f85bfee7368180a8` restored the current schema rather than invent a version number with no defined semantics. No force-push or history rewrite was used.

Before the recognized ACC runner is implemented, the scientific contract must explicitly choose and test at least: grid origin/offset, sample-point placement at exact segment boundaries, treatment of a final partial frame, and whether BandScope follows `mir_eval.util.intervals_to_samples` exactly or another reviewed evaluator convention. Only then should a frame-grid contract version enter the registration digest. This is a deliberate unresolved scientific prerequisite, not permission for the runner to choose defaults after seeing results.

## Constraints and rejected alternatives

Leaving frame resolution to the eventual runner was rejected because the same segment intervals can produce different frame-count weighting at 10 ms and 100 ms. A result receipt would then not identify one reproducible ACC statistic.

Treating the MIREX task name as sufficient label-mapping authority was rejected because the current task page itself contains conflicting target-vocabulary prose. A scientific gate cannot depend on an implicit interpretation of that inconsistency.

Automatically normalizing labels during the acceptance run was rejected. Mapping `verse1`, `solo`, `fade-out`, mixed case, or unknown labels after the corpus is frozen gives the runner post-hoc freedom over the dependent variable. Normalization belongs before preregistration and is content-addressed through the annotation digest.

Parsing annotation bytes inside corpus admission was rejected. Resource admission owns byte identity and immutable handoff; metric interpretation belongs to the Signal-MIR measurement runner. Combining them would blur the bounded-context boundary and make a byte-admission receipt look like scientific acceptance.

Using binary floating-point as the annotation-boundary authority was rejected. Decimal source timestamps are converted to exact rational values, while decoded duration is represented exactly as `decoded_frames / sample_rate_hz`; this makes gap/overlap and full-duration checks deterministic rather than tolerance-dependent.

Copying the MIREX submission envelope into local corpus annotations was rejected. Submission transport syntax and local preregistered annotation storage solve different problems; the scientific contract is the segment boundaries, labels, normalization, and evaluation semantics, all of which remain explicitly bound here.

## Claim boundary

This contract freezes how a future BandScope runner must interpret functional-label annotation evidence and the selected 100 ms resolution. It does not yet freeze the ACC sample-grid convention described above, establish that the chosen corpus is sufficiently broad, approve the current synthetic unit-test margins, prove that 100 ms is optimal for every MIR task, or justify a production CQT→STFT switch. Production acceptance still requires the frame-grid decision, rights-cleared real decoded audio, independently reviewed normalized annotations, an implemented recognized metric runner consuming the exact admitted PCM/annotation snapshots, preregistered aggregation and paired uncertainty, and current-head release evidence.

The parser tests use synthetic annotation strings only to verify the interpretation boundary. They are unit evidence and are not counted as production scientific acceptance.

## References

MIREX. (2025). *Music Structure Analysis*. International Music Information Retrieval Systems Evaluation Laboratory. https://music-ir.org/mirex/wiki/2025:Music_Structure_Analysis

mir_eval contributors. (n.d.). *mir_eval.util.intervals_to_samples*. https://github.com/mir-evaluation/mir_eval/blob/main/mir_eval/util.py

MIREX. (2025). *Music Structure Analysis Results*. International Music Information Retrieval Systems Evaluation Laboratory. https://music-ir.org/mirex/wiki/2025:Music_Structure_Analysis_Results

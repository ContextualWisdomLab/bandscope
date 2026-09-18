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

`annotation_contract_version = 1.0` means the scientific runner must interpret the admitted annotation snapshot as an ordered functional segmentation in seconds. After parsing, the normalized representation must start at 0.0, preserve source segment order, contain finite non-negative boundaries, have no overlaps or gaps between adjacent segments, and cover the admitted decoded track duration. The parser implementation remains part of the exact registered source commit and lock/runtime identity. Corpus admission itself intentionally does not parse or rewrite annotations; it only binds the immutable admitted bytes. A future runner must reject annotation bytes that cannot satisfy this semantic contract rather than repairing them after candidate results are visible.

`label_mapping_contract_version = 1.0` uses a fail-closed identity mapping at the measurement boundary. Normalized annotations presented to ACC must already use exactly one of these seven lowercase labels:

`intro`, `verse`, `chorus`, `bridge`, `inst`, `outro`, `silence`.

No case folding, stemming, prefix stripping (`verse1` → `verse`), synonym mapping (`solo` → `inst`), or catch-all remapping is allowed inside the acceptance run. If a rights-cleared source corpus uses another vocabulary, its mapping must be reviewed and applied before preregistration; the resulting normalized annotation bytes receive their own `annotation_sha256` and therefore become part of the frozen corpus identity.

This deliberately avoids silently resolving an ambiguity in the current MIREX 2025 page: its narrative description mentions an `other` category, while its operational output-format section says submitted labels must be one of `intro`, `verse`, `chorus`, `bridge`, `inst`, `outro`, or `silence`. BandScope v1 follows the operational output-format list and rejects `other` rather than guessing how it should map. If the scientific review later adopts another mapping, that requires a new mapping-contract version and a new preregistration digest before results are inspected.

## RED → GREEN lineage

RED `6f19315d0092004499fea7e581e1f00cc6d021c1` added a focused policy test requiring functional-label ACC to freeze frame resolution plus annotation and label-mapping contract versions. The predecessor validator rejected those fields as unregistered and still accepted the older under-specified metric shape.

GREEN `03b26bf203c4784029f75296d308eed644d7a5eb` makes those three fields mandatory closed-world configuration for `functional_label_accuracy`. Fixture alignment `4936cefd1a2b13fcd75a25e0d622ca4ce0ba9373` and `1839586fb1446f28654494c154182b1c415ab757` updates the shared evidence and corpus-admission registrations so successful tests exercise the new contract rather than bypassing it.

The focused regression also requires missing fields and post-hoc changes to the 100 ms frame, annotation contract version, or label mapping contract version to fail validation.

## Constraints and rejected alternatives

Leaving frame resolution to the eventual runner was rejected because the same segment intervals can produce different frame-count weighting at 10 ms and 100 ms. A result receipt would then not identify one reproducible ACC statistic.

Treating the MIREX task name as sufficient label-mapping authority was rejected because the current task page itself contains conflicting target-vocabulary prose. A scientific gate cannot depend on an implicit interpretation of that inconsistency.

Automatically normalizing labels during the acceptance run was rejected. Mapping `verse1`, `solo`, `fade-out`, mixed case, or unknown labels after the corpus is frozen gives the runner post-hoc freedom over the dependent variable. Normalization belongs before preregistration and is content-addressed through the annotation digest.

Changing corpus admission to parse annotations was rejected. Resource admission owns byte identity and immutable handoff; metric interpretation belongs to the Signal-MIR measurement runner. Combining them would blur the bounded-context boundary and make a byte-admission receipt look like scientific acceptance.

## Claim boundary

This contract freezes how a future BandScope runner must interpret functional-label ACC evidence. It does not establish that the chosen corpus is sufficiently broad, that the current synthetic unit-test margins are scientifically approved, that 100 ms is optimal for every MIR task, or that a production CQT→STFT switch is justified. Production acceptance still requires rights-cleared real decoded audio, independently reviewed normalized annotations, an implemented recognized metric runner consuming the exact admitted PCM/annotation snapshots, preregistered aggregation and paired uncertainty, and current-head release evidence.

## References

MIREX. (2025). *Music Structure Analysis*. International Music Information Retrieval Systems Evaluation Laboratory. https://music-ir.org/mirex/wiki/2025:Music_Structure_Analysis

MIREX. (2025). *Music Structure Analysis Results*. International Music Information Retrieval Systems Evaluation Laboratory. https://music-ir.org/mirex/wiki/2025:Music_Structure_Analysis_Results

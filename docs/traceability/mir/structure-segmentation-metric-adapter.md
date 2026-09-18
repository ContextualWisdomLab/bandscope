# Structure segmentation metric adapter

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228  
Parent: `docs/traceability/mir/structure-feature-noninferiority.md`

## Problem

The noninferiority registration names `mir_eval.segment.detection`, `mir_eval.segment.deviation`, and `mir_eval.segment.pairwise`, but a function name alone is not a reproducible scientific implementation identity. Boundary detection changes materially with `window`, `beta`, and especially `trim`; pairwise grouping changes with `frame_size` and `beta`. Leaving those arguments at library defaults would let a future environment or caller alter the dependent variable without changing the registration digest.

There is also an authority distinction that must not be blurred. The official `ismir-mirex/mirex-evaluation` MIREX-2025 reproduction at commit `b9fa0b0b32e2145af31f35830f78fc9d09a4301b` implements ACC and HR.5/HR3 itself. Its hit-rate function includes start/end boundaries and is not the same implementation as `mir_eval.segment.detection`, which uses one-to-one boundary matching and exposes an explicit `trim` option. BandScope already chose `mir_eval` for the recognized boundary/deviation/repetition measures; therefore its scores must not be described as numerically identical to the official MIREX HR.5/HR3 table merely because the tolerance names are the same.

## Decision

`scripts/research/evaluate_structure_segmentation_metrics.py` is the repository-owned adapter for the currently selected recognized metrics. It requires installed distribution identity `mir_eval==0.8.2` and calls the public API with every result-affecting argument explicit:

- boundary precision/recall/F at 0.5 s: `mir_eval.segment.detection(window=0.5, beta=1.0, trim=True)`;
- boundary precision/recall/F at 3.0 s: `mir_eval.segment.detection(window=3.0, beta=1.0, trim=True)`;
- bidirectional median boundary deviation: `mir_eval.segment.deviation(trim=True)`;
- repetition/grouping precision/recall/F: `mir_eval.segment.pairwise(frame_size=0.1, beta=1.0)`.

`trim=True` is deliberate. The normalized BandScope segment contract already guarantees a boundary at 0 and exact full-track coverage. Counting those shared endpoints as boundary hits would reward two invariants supplied by the adapter contract rather than the model's ability to locate internal rehearsal structure. `mir_eval` documents those endpoints as the typical reason to enable trimming.

The adapter validates both segmentations as continuous from zero with positive segment durations and requires exactly the same total duration. It does not repair gaps, overlaps, duration drift, or malformed labels. It returns only finite bounded scores and non-negative deviations.

## RED → GREEN

RED `3cdf045fc48b64cc8340dc7c7ba71ae44f07c2db` added a focused contract before the adapter existed. The regression requires exact 0.5 s/3.0 s detection calls with `beta=1.0` and `trim=True`, trimmed deviation, 100 ms pairwise grouping, dependency-version fail-closed behavior, and rejection of malformed segmentation geometry.

GREEN `e570c414eb8cbc76beec4be7c4424814a09d3694` added the metric adapter. Follow-up `93df1d4b1b617bdfa1d2f62d720656d10a67fa97` isolated installed-distribution version evidence from the fake test backend so unit tests do not pretend that a locally injected test double is package provenance.

These are source-level TDD commits. They are not hosted scientific acceptance and do not show a rights-cleared corpus result.

## Constraints and rejected alternatives

Using the official MIREX 2025 `calculate_hit_rate` while continuing to label the registration as `mir_eval.segment.detection` was rejected. They have different matching semantics and would make the registration false.

Leaving `trim=False` at the mir_eval default was rejected for the BandScope noninferiority decision because the guaranteed start/end markers would dilute the internal-boundary signal, especially on tracks with few sections.

Reimplementing mir_eval formulas in BandScope was rejected. The adapter owns argument selection, validation, and evidence normalization, not a fork of the recognized metric library.

Adding an unpinned `mir_eval>=...` dependency was rejected. Scientific execution must bind the exact reviewed version rather than accepting a later package with the same API surface.

## Current limitation and next causal step

The main registration validator still records generic `mir_eval.segment.*` implementation strings and the analysis-engine lock does not yet carry an exact `mir_eval==0.8.2` research-runtime dependency. Therefore the new adapter is **not yet admissible for the rights-cleared experiment**. Before any candidate real-audio result is inspected, the canonical registration schema and runtime identity must bind:

- mir_eval version 0.8.2;
- detection `beta=1.0` and `trim=True` for both registered windows;
- deviation implementation plus `trim=True`;
- pairwise `frame_size=0.1` and `beta=1.0`;
- the exact locked dependency identity used by the experiment runtime.

After that schema/runtime repair, this adapter can be wired into the same admitted-track CQT/STFT consumer that already produces functional ACC. Aggregation and paired uncertainty remain a later preregistered decision and must still be frozen before candidate outcomes are inspected.

## Security Notes

The adapter receives normalized in-memory segments only. It adds no filesystem, network, subprocess, model-download, credential, or generic plugin path. The private test seam replaces the module loader only inside focused tests; production execution resolves the installed `mir_eval` distribution and rejects any version other than 0.8.2 before metric calls.

## References

Raffel, C., McFee, B., Humphrey, E. J., Salamon, J., Nieto, O., Liang, D., & Ellis, D. P. W. (2014). *mir_eval: A transparent implementation of common MIR metrics*. Proceedings of the 15th International Society for Music Information Retrieval Conference.

mir-evaluation contributors. (2026). *mir_eval 0.8.2: segment evaluation API*. https://mir-eval.readthedocs.io/latest/api/segment.html

MIREX Evaluation contributors. (2026). *Music Structure Analysis evaluation script* (commit `b9fa0b0b32e2145af31f35830f78fc9d09a4301b`). https://github.com/ismir-mirex/mirex-evaluation/blob/b9fa0b0b32e2145af31f35830f78fc9d09a4301b/music_structure_analysis/eval_script.py

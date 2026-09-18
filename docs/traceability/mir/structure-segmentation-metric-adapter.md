# Structure segmentation metric adapter

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228  
Parent: `docs/traceability/mir/structure-feature-noninferiority.md`

## Problem

The noninferiority registration names `mir_eval.segment.detection`, `mir_eval.segment.deviation`, and `mir_eval.segment.pairwise`, but a function name alone is not a reproducible scientific implementation identity. Boundary detection changes with `window`, `beta`, and `trim`; pairwise grouping changes with `frame_size` and `beta`. A second gap existed after the adapter was introduced: the repository did not bind the exact `mir_eval` distribution artifact, and the admitted-track consumer still emitted functional ACC without the recognized boundary/deviation/repetition measurements.

There is also an authority distinction that must not be blurred. The official `ismir-mirex/mirex-evaluation` MIREX-2025 reproduction at commit `b9fa0b0b32e2145af31f35830f78fc9d09a4301b` implements ACC and HR.5/HR3 itself. Its hit-rate function is not the same implementation as `mir_eval.segment.detection`. BandScope's selected mir_eval measures therefore must not be described as numerically identical to the official MIREX HR.5/HR3 table merely because the tolerances have the same names.

## Decision

`scripts/research/evaluate_structure_segmentation_metrics.py` remains the repository-owned adapter for the selected recognized metrics. It requires installed distribution identity `mir_eval==0.8.2` and calls the public API with every result-affecting argument explicit:

- boundary precision/recall/F at 0.5 s: `mir_eval.segment.detection(window=0.5, beta=1.0, trim=True)`;
- boundary precision/recall/F at 3.0 s: `mir_eval.segment.detection(window=3.0, beta=1.0, trim=True)`;
- bidirectional median boundary deviation: `mir_eval.segment.deviation(trim=True)`;
- repetition/grouping precision/recall/F: `mir_eval.segment.pairwise(frame_size=0.1, beta=1.0)`.

`trim=True` is deliberate. The normalized BandScope segment contract guarantees a boundary at zero and exact full-track coverage. Counting those shared endpoints would reward invariants supplied by the adapter contract rather than the model's ability to locate internal rehearsal structure.

The adapter validates both segmentations as continuous from zero with positive segment durations and requires the same total duration. It does not repair gaps, overlaps, duration drift, or malformed labels. It returns only finite bounded scores and non-negative deviations.

## Research runtime identity

The production analysis dependency graph is not widened for this scientific adapter. `services/analysis-engine/requirements-structure-metrics.lock` is a research-only overlay that is installed after the frozen analysis-engine environment with `--no-deps`. It identifies one direct wheel only:

- package/version: `mir_eval==0.8.2`;
- wheel SHA-256: `114cda33d8e17408c170598e0b36ed0d71ff4a2fee8eaf9e165b58ecf1c87170`;
- upstream source commit: `mir-evaluation/mir_eval@8db0b3812e2032544c1fc00d02d4256cab043f3d`;
- PyPI Sigstore transparency entry: `174236906`.

PyPI publishes that wheel through Trusted Publishing and records the same source commit, subject digest, and transparency entry in its provenance attestation. The repository verifier does not perform network access or install anything. `scripts/research/verify_structure_metric_runtime_lock.py` accepts only the exact reviewed lock text, returns its SHA-256 identity, and separately requires the installed distribution version to be exactly `0.8.2` before recognized metrics can execute.

The direct wheel is deliberately installed with `--no-deps`. Its scientific purpose is to add the metric implementation, not to resolve or mutate the already-frozen production numerical stack. Missing prerequisites therefore fail at the research-environment construction step instead of causing an independent dependency solve.

## Admitted-track evidence path

`PairedFunctionalAccuracyTrackConsumer.for_registered_cqt_stft_hypothesis()` now binds the exact research lock identity at construction and the canonical CQT then STFT lanes. On each admitted track it still sends the same immutable PCM memoryview, sample rate, exact duration, and admitted annotation-derived reference segmentation through both lanes.

Before any boundary/deviation/repetition score is emitted, the consumer re-verifies the installed `mir_eval` distribution and the lock artifact. If the lock hash has changed since experiment binding, the run fails before recognized metrics are appended. Baseline and candidate metrics are then evaluated against the same in-memory reference segmentation and copied into immutable path-free evidence together with the research-lock SHA-256.

Directly constructed consumers can remain functional-ACC-only for focused unit boundaries; the canonical registered CQT/STFT factory is the scientific path that binds the recognized metric adapter and runtime identity. Synthetic fixtures exercise this contract only and do not count as scientific acceptance.

## RED → GREEN lineage

Adapter RED `3cdf045fc48b64cc8340dc7c7ba71ae44f07c2db` required mir_eval 0.8.2, detection at 0.5 s and 3.0 s with `beta=1.0, trim=True`, `deviation(trim=True)`, pairwise grouping at `frame_size=0.1, beta=1.0`, dependency drift failure, and malformed-geometry rejection. GREEN `e570c414eb8cbc76beec4be7c4424814a09d3694` added the adapter; `93df1d4b1b617bdfa1d2f62d720656d10a67fa97` separated installed-distribution evidence from the fake backend used by unit tests.

Runtime-lock RED `37f3549d15acb33f397245a88da16dcd8e274cf7` required an exact reviewed artifact identity and fail-closed installed-version/artifact drift behavior. GREEN `8b495913bd6b7fe66f2855afb6fc5d095ae8433d` added the verifier and `23388320e3d536c3d220546c4a857389c83182f9` added the direct-wheel research lock. `59c271f64f2fac893025f4a9cd0d3741fff25865` split immutable lock-identity loading from installed-environment verification so experiment construction can bind the artifact identity without pretending the package is already installed.

Admitted-track RED `fbb7c1d7f605aabcc36d4bc651b9b4c6c1b39f0d` requires canonical CQT/STFT evidence to bind the runtime-lock digest, evaluate both lanes against the same reference segmentation, and stop before metric execution when the installed distribution drifts. GREEN `773ffd2913f933726b8bf9b890d955189e0e8c5d` wires the reviewed adapter and runtime verifier into the existing admitted-track consumer without changing any production CQT default.

These commits are source-level TDD and contract evidence. Hosted current-head checks and rights-cleared real-audio scientific acceptance remain separate requirements.

## Constraints and rejected alternatives

Using the official MIREX 2025 `calculate_hit_rate` while continuing to label the registration as `mir_eval.segment.detection` was rejected because the algorithms have different matching semantics.

Leaving `trim=False` at the mir_eval default was rejected because guaranteed start/end markers would dilute the internal-boundary signal, especially on tracks with few sections.

Reimplementing mir_eval formulas in BandScope was rejected. BandScope owns argument selection, validation, artifact identity, and evidence normalization, not a fork of the recognized metric library.

Adding `mir_eval` to the production analysis dependency set was rejected for this research-only measurement. It would widen the buyer runtime for a preregistration tool and let the scientific adapter influence production dependency resolution. The direct no-dependency overlay keeps that boundary explicit.

Using a mutable `mir_eval>=...` requirement, package index lookup at experiment time, or an unhashed wheel was rejected. Any of those would permit the scientific implementation to drift without changing source.

Computing aggregate scores or confidence intervals inside the admitted-track consumer was rejected. Those remain separate preregistered scientific decisions and must be frozen before candidate outcomes are inspected.

## Current limitation and next causal step

The runtime artifact and admitted-track recognized-metric path now exist, but the main registration digest still records generic `mir_eval.segment.*` strings and does not yet include the research-lock SHA-256 or the complete adapter arguments. **The rights-cleared CQT/STFT experiment remains inadmissible until that registration schema is repaired.** Source-level wiring must not be used as a reason to inspect candidate corpus outcomes early.

The next causal slice is therefore to bind the exact research-lock identity and complete detection/deviation/pairwise semantics into the canonical registration digest, update all registration fixtures/admission contracts together, and only then freeze the aggregate/paired-uncertainty implementation. Rights-cleared real-audio execution follows those preregistration steps, not the reverse.

## Security Notes

The adapter and verifier receive normalized in-memory values and a bounded local lock file. They add no model download, credentials, generic plugin loading, or package installation at metric execution. The lock verifier performs no network access. Durable track evidence contains content digests, scalar metrics, and the runtime-lock digest, not workstation paths or licensed audio bytes.

## References

Raffel, C., McFee, B., Humphrey, E. J., Salamon, J., Nieto, O., Liang, D., & Ellis, D. P. W. (2014). *mir_eval: A transparent implementation of common MIR metrics*. Proceedings of the 15th International Society for Music Information Retrieval Conference.

mir-evaluation contributors. (2025). *mir_eval 0.8.2*. PyPI. https://pypi.org/project/mir-eval/0.8.2/

MIREX Evaluation contributors. (2026). *Music Structure Analysis evaluation script* (commit `b9fa0b0b32e2145af31f35830f78fc9d09a4301b`). https://github.com/ismir-mirex/mirex-evaluation/blob/b9fa0b0b32e2145af31f35830f78fc9d09a4301b/music_structure_analysis/eval_script.py

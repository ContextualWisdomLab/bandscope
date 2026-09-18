# Structure feature noninferiority gate

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225  
Production baseline: `chroma_cqt` in `sections/segmenter.py`

## Decision

The earlier `chroma_cqt` → `chroma_stft` optimization is not a production change until a preregistered, rights-cleared real-audio experiment shows that the candidate is noninferior on rehearsal-relevant structure quality and materially faster on the same corpus and runtime identity.

The repository owns a result-admission boundary in `scripts/research/validate_structure_noninferiority.py`. The validator does **not** calculate MIR metrics and does not choose scientific margins or an uncertainty procedure. It freezes the reviewed experiment contract, including its claim boundary, binds a result receipt to that contract by canonical SHA-256, requires one explicit success-or-failure receipt per registered track, and applies the registered aggregate confidence-interval decision rules only when the complete corpus produced measurements. Metric computation and uncertainty estimation remain separate scientific measurement steps.

The canonical public validator is now a metric-aware façade over the unchanged base decision/result policy in `validate_structure_noninferiority_base.py`. Its SHA-256 binds both the validated registration data and repository-owned structure-metric semantics: the exact research metric-lock digest plus all result-affecting `mir_eval.segment.detection`, `segment.deviation`, and `segment.pairwise` arguments. A receipt carrying only the former registration-JSON digest is rejected. This closes a scientific identity gap without asking each experiment author to duplicate immutable adapter constants in registration JSON.

This keeps a performance result from silently changing the corpus, thresholds, feature identities, metric implementation/runtime, uncertainty procedure, runtime, or permitted interpretation after the measurements are visible.

## Registered inputs

A registration is valid only when it records all of the following before the result is evaluated:

- baseline `chroma_cqt` and candidate `chroma_stft`;
- a rights-cleared real-audio corpus with stable track IDs, content-unique audio SHA-256 identities, annotation SHA-256, rights basis, and provenance URI;
- exact source commit and `uv.lock` identity plus Python, librosa, NumPy, sample rate, channel count, and host profile;
- the caller-selected metric thresholds and the pinned MIREX functional-ACC evaluator commit/function, 200 ms frame-grid contract v1, and versioned annotation/label-mapping semantics;
- the paired-uncertainty procedure identity, confidence level, resample count, and random seed;
- a non-empty claim boundary stating the population/runtime scope to which a passing result may be applied.

The registration digest additionally binds the repository-owned segmentation-metric contract. The bound contract includes the SHA-256 of `services/analysis-engine/requirements-structure-metrics.lock`, detection windows 0.5 s and 3.0 s with `beta=1.0, trim=True`, deviation with `trim=True`, and pairwise grouping with `frame_size=0.1, beta=1.0`. `test_structure_metric_preregistration_contract.py` cross-checks those digest constants against the executable adapter and runtime-lock owners so the metadata cannot silently diverge while focused tests remain green.

Schema v1 is closed-world not only at the registration top level but also for the hypothesis object, every registered metric configuration, every corpus-track object, and the runtime object. Extra fields are not treated as harmless annotations: an unregistered pilot-selection flag, metric weight, corpus-selection marker, or cache/runtime hint changes what reviewers may infer was preregistered, so it fails admission instead of silently entering the evidence artifact. The claim boundary is itself a required top-level registration field and therefore participates in the canonical registration SHA-256.

`experiment_id` is a semantic label, while the registration SHA-256 is the exact evidence identity. The validator compares the registration and result experiment IDs after the same required-text normalization, but the canonical hash preserves the validated registration representation inside a closed envelope together with the immutable repository-owned structure-metric contract. This prevents an otherwise valid registration with surrounding whitespace from becoming impossible to reference while keeping byte-distinct registrations and metric-contract revisions cryptographically distinct.

The validator requires a 95% confidence level because the current result schema is explicitly `ci95`; it does not prescribe which scientifically defensible paired procedure must produce that interval. The procedure identifier, resample count, and seed are part of the preregistration digest so they cannot be changed after results are seen. `paired-track-bootstrap-v1` and the numeric values used in unit tests are policy fixtures only, not an approved BandScope production analysis plan.

The validator requires `source_uri` to be an explicit non-`file:` URI. Absolute, relative, drive-relative, and `file:` filesystem forms are rejected as provenance authorities. A benchmark may remain private when licensing requires that, but the receipt must identify the licensed material without leaking the workstation path that happened to hold it.

Track IDs are labels, not independent scientific units by themselves. Schema v1 rejects duplicate `audio_sha256` values across distinct track IDs so the same audio bytes cannot be counted repeatedly as apparent corpus breadth or independent paired observations. A scientifically justified repeated-item or clustered design would require an explicit preregistered dependence model and a schema revision rather than aliasing one recording under several IDs.

This guard is also consistent with recent MIR dataset-quality work. Choi et al. (2025) show that duplicated music items can make evaluation unreliable through leakage and motivate explicit de-duplication in a large music benchmark. Their study is on symbolic MIDI and therefore does **not** establish BandScope's audio-structure independence assumptions; it supports the narrower engineering rule that duplicate content identity must not silently masquerade as distinct evaluation evidence.

The current minimum of two tracks is only a technical guard against treating one timing sample as a corpus. It is **not** a scientific sample-size claim. Corpus breadth, genre/instrumentation coverage, annotation quality, independence/dependence structure, and a defensible power/uncertainty plan remain part of the experiment review before a production switch can be accepted.

Schema v1 does not contain a preregistered dropout, exclusion, or missing-track policy. Therefore every registered track must complete both baseline and candidate measurement for an acceptance PASS. A measurement failure is still evidence: its track ID remains in registered corpus order, appears in `failed_tracks`, and uses a closed failed-track receipt containing only `track_id` rather than invented MIR or latency values. Any non-empty `failed_tracks` list makes the acceptance decision fail. Because an aggregate or confidence interval computed after such a failure would necessarily summarize an unregistered complete-case subset, schema v1 also requires `aggregate`, `paired_delta_ci95`, and `p95_latency_ratio_ci95` to be JSON `null` whenever `failed_tracks` is non-empty. Conversely, omitting baseline/candidate measurements without declaring the same track failed is rejected. A future tolerance for failed or excluded tracks requires a reviewed preregistration rule and schema revision rather than post-result omission.

## Metrics

BandScope uses the MIREX Music Structure Analysis task and its standardized evaluator repository as the functional-structure reference point. The registered quality gate requires:

| Evidence | Registered implementation / convention | Decision use |
| --- | --- | --- |
| Boundary precision/recall/F at 0.5 s | `mir_eval.segment.detection(window=0.5, beta=1.0, trim=True)` | F noninferiority |
| Boundary precision/recall/F at 3.0 s | `mir_eval.segment.detection(window=3.0, beta=1.0, trim=True)` | F noninferiority |
| Boundary median deviation, both directions | `mir_eval.segment.deviation(trim=True)` | Report per track and aggregate |
| Functional-label accuracy | `ismir-mirex/mirex-evaluation@b9fa0b0...:music_structure_analysis.eval_script.calculate_accuracy`; 0.2 s grid; frame-grid v1; annotation v1; label-mapping v1 | Noninferiority |
| Repetition/group consistency precision/recall/F | `mir_eval.segment.pairwise(frame_size=0.1, beta=1.0)` | F noninferiority |
| Latency | paired p50/p95 on the registered host | p95 ratio superiority |
| Peak memory | peak RSS on the registered host | Report per track and aggregate |

The selected mir_eval calls execute only under the content-addressed research overlay whose exact lock SHA-256 is part of the canonical registration digest. The runtime verifier separately requires the installed distribution to be `mir_eval==0.8.2` before these metrics run. Full artifact provenance and adapter semantics are recorded in `docs/traceability/mir/structure-segmentation-metric-adapter.md`.

The MIREX task page describes frame-level ACC conceptually and gives finer resolutions as examples, but the current official `ismir-mirex/mirex-evaluation` MIREX-2025 reproduction is more specific: at commit `b9fa0b0b32e2145af31f35830f78fc9d09a4301b`, `calculate_accuracy` uses a 0.2 s hop, `np.arange(0, gt_duration, frame_hop)`, and advances a segment when a frame point is greater than or equal to the segment end. BandScope therefore pins that exact evaluator identity and frame-grid contract rather than selecting 100 ms from prose examples. The local annotation mapping remains preregistered and content-addressed before evaluation; raw-label normalization is not allowed to drift after candidate results are visible. The detailed contract is recorded in `docs/traceability/mir/functional-label-accuracy-contract.md`, and `scripts/research/evaluate_structure_functional_accuracy.py` is the repository-owned adapter for the normalized seven-label subset.

`mir_eval.segment.detection` uses one-to-one boundary matching within the selected tolerance; `mir_eval.segment.deviation` reports the median nearest-boundary deviations in both directions; `mir_eval.segment.pairwise` measures structural grouping agreement. These are different questions and must not be collapsed into one score.

Result receipts must carry the reported precision and recall alongside F for the boundary and repetition measures. The admission validator recomputes the harmonic mean and rejects an internally inconsistent P/R/F triplet. This does not replace the recognized metric implementation; it prevents a malformed receipt from claiming a metric value that its own reported components cannot support.

The published MIREX 2025 result table reports the MusicFM baseline at ACC 0.705, HR.5 0.644, and HR3 0.710. Those values are useful external context, **not** BandScope's noninferiority margins. A margin is a product/scientific decision about acceptable loss relative to BandScope's own current baseline on the registered corpus. It must be fixed before examining candidate results.

## Decision rule

For each quality metric `m`, let `Δm = candidate - baseline`. The result passes that quality criterion only when the lower bound of the registered paired 95% confidence interval satisfies:

`lower_CI95(Δm) >= -noninferiority_margin(m)`

For p95 latency, let `r = candidate_p95 / baseline_p95`. The result passes the speed criterion only when the **upper** bound of the paired 95% interval satisfies:

`upper_CI95(r) <= maximum_candidate_ratio`

The result receipt must repeat the preregistered uncertainty plan and claim boundary exactly. On a complete run, the validator also requires the aggregate point delta/ratio to lie inside the supplied interval. Favorable point estimates therefore cannot hide an uncertainty interval that crosses a preregistered boundary, the uncertainty method cannot be swapped after the result is known, and a narrow experiment cannot be relabeled as evidence for a wider population or runtime after measurement.

Because schema v1 has no preregistered exclusion policy, a non-empty `failed_tracks` list fails before aggregate decision rules are evaluated. The failed run preserves track-level diagnostic identity but must carry `null` aggregate and CI summaries, so a complete-case subset cannot masquerade as the preregistered whole-corpus analysis.

The repository does not currently contain approved numeric margins or an approved production corpus/uncertainty procedure. Unit-test values are synthetic policy fixtures only and must never be cited as production acceptance thresholds or scientific design decisions.

## Result receipt

A result receipt must contain the exact metric-aware registration digest, exact uncertainty plan, exact corpus order, one ordered track receipt per registered track, failed-track IDs, and the exact preregistered claim boundary. A successful complete run additionally carries aggregate measurements, paired 95% intervals for every gated quality metric, and a paired p95-latency-ratio interval. A successful track receipt contains `track_id`, `baseline`, and `candidate`; a track listed in `failed_tracks` contains only `track_id`, preserving the failure without manufacturing scores that were never measured. When any track fails, the three aggregate/CI fields remain present in the closed top-level schema but their values must be JSON `null`.

Schema v1 treats the result envelope, each per-track receipt, and the aggregate envelope as closed-world objects. A top-level post-result field such as an unregistered p-value, a per-track `selected_for_aggregate` flag, or aggregate-side selection metadata is rejected rather than ignored. The same rule already applies inside each baseline/candidate measurement object. This prevents a producer from attaching an unreviewed post-hoc selection or inferential claim to an otherwise accepted receipt and having that field travel with the admitted evidence artifact.

Each successful per-track and aggregate baseline/candidate measurement is a closed-world receipt: it must contain exactly the registered quality fields plus the reporting-only precision/recall, boundary-deviation, latency, and peak-RSS fields. Missing fields and additional post-hoc measurement fields both fail admission. A declared failed track is the only per-track exception and is instead closed to exactly `track_id`; attaching partial or invented measurement fields to that failed receipt is rejected. This prevents a result producer from filling a real measurement failure with synthetic values merely to satisfy the evidence schema.

The receipt is rejected when a track is omitted/reordered, missing measurements are not paired with an explicit failed-track declaration, a failed receipt carries measurement fields, a failed run carries non-null aggregate/CI summaries, the uncertainty plan differs, the claim boundary differs, a required metric is absent, an unregistered envelope or measurement field is added, a boundary/repetition P/R/F triplet is internally inconsistent, a value is non-finite, a confidence interval does not contain its aggregate point estimate, or the metric-aware registration hash differs. A structurally valid receipt with one or more known failed tracks is retained for diagnosis with null aggregate summaries and evaluates to `passed=false` under schema v1. A passing receipt therefore means the preregistered decision rule passed for the complete registered corpus, metric contract, uncertainty procedure, runtime, and claim boundary. It does not generalize automatically to other genres, codecs, sample rates, machines, annotation regimes, or statistical procedures.

The validator still does not recompute aggregate statistics or confidence intervals from per-track evidence. During review, a min/max range consistency heuristic was briefly encoded as a RED and then removed before production code changed because it would smuggle an unapproved assumption about aggregation into schema v1. Macro means, weighted means, micro-aggregated precision/recall/F and pooled latency summaries do not share one universally valid range relationship. The correct next step is to preregister the aggregation procedure and implement it in the experiment runner, not to infer a statistical method inside an admission validator after the fact.

## Machine-readable evidence admission

Registration and result JSON are evidence, not trusted configuration. CLI admission is bounded to 2 MiB per file, reads from one already-open regular-file descriptor, requires UTF-8 and standards-compliant finite JSON values, and rejects duplicate object keys instead of accepting last-key-wins semantics. These controls prevent ambiguous evidence identities and bound memory use before scientific validation begins.

The JSON `source_uri` value remains provenance metadata only; it is never dereferenced by this validator. It must use an explicit non-file URI scheme; absolute, relative, drive-relative, and `file:` filesystem forms are rejected. Audio and annotation bytes are not opened by the evidence validator and are bound to the registration through SHA-256 identities supplied by the experiment process. Audio content identity must also be unique within schema-v1 corpus membership; a second track ID carrying the same `audio_sha256` fails admission.

## Reproducibility sequence

1. Review the rights basis, corpus composition, distinct audio-content identities, feature hypothesis, metric contract, pinned functional-ACC evaluator/grid/annotation/mapping contract, host profile, numeric margins, aggregation procedure, paired-uncertainty procedure, and claim boundary **before** running the candidate. Freeze the procedure identifier, confidence level, resample count, random seed, and claim boundary in the registration. If repeated recordings, clustering, source-label normalization, or any failure/exclusion tolerance is scientifically required, define and version that dependence/mapping/exclusion policy before measurement rather than remapping or omitting observations after results are visible.
2. Serialize the registration and run `python scripts/research/validate_structure_noninferiority.py <registration.json>` to obtain its canonical metric-aware SHA-256. The digest includes the validated registration plus the repository-owned structure metric lock/argument contract; it is not a hash of the registration JSON alone.
3. Run baseline and candidate on the same decoded track identities and host profile. Functional ACC must consume the admitted normalized annotation through `scripts/research/evaluate_structure_functional_accuracy.py` and preserve the pinned 200 ms MIREX grid semantics; it must not reopen corpus paths or remap labels after preregistration. Boundary/deviation/repetition metrics must use the registered research lock and explicit adapter semantics. The experiment runner must compute the approved aggregation and paired uncertainty procedure from the complete measured-track evidence rather than accepting caller-authored aggregate numbers as scientific authority. Record recognized MIR metrics, p50/p95 latency, and peak RSS for successful tracks. If a registered track cannot produce a baseline/candidate measurement, preserve its ordered `track_id` receipt, add that exact ID to `failed_tracks`, and set the aggregate plus both CI summary fields to JSON `null`; do not invent metric values or compute a complete-case aggregate from the surviving tracks. Only a complete run records aggregate outputs and paired uncertainty using the preregistered procedure.
4. Put the metric-aware registration digest, identical uncertainty-plan fields, and identical claim boundary in the result receipt, then run `python scripts/research/validate_structure_noninferiority.py <registration.json> <result.json>`. A receipt carrying only the former registration-JSON digest is rejected. Under schema v1, any recorded failed track keeps the diagnostic receipt valid but makes acceptance fail closed before aggregate decision rules; undeclared missing measurements, non-null post-failure summaries, and claim-boundary drift are rejected.
5. Preserve the registration, metric-aware digest contract, result receipt, corpus/annotation hashes, exact source commit, lock hash, aggregation implementation identity, uncertainty procedure, and claim boundary together. A production feature switch requires this evidence plus normal code review and protected-head checks.

No step authorizes committing licensed audio to Git. Rights-cleared means BandScope has the necessary evaluation right; redistribution is a separate permission.

## Security Notes

- Audio and annotation files are untrusted inputs to the future experiment runner. This validator reads bounded JSON evidence only and does not open audio, execute subprocesses, make network requests, or follow paths from the registration.
- Evidence JSON is limited to 2 MiB, must be a regular file read through one open descriptor, must decode as UTF-8, and rejects duplicate keys plus non-standard `NaN`/`Infinity` constants.
- `source_uri` is evidence metadata, not an instruction to fetch content. Local absolute, relative, drive-relative, and `file:` forms are rejected; an explicit non-file URI scheme is required so transient workstation paths cannot become provenance authority or leak into review artifacts.
- Audio and annotation SHA-256 values bind measurements to bytes without embedding media in the result receipt; duplicate audio SHA-256 values under different track IDs are rejected so one recording cannot be silently counted multiple times.
- Invalid/non-finite measurements, corpus drift, duplicate audio content identity, functional-label evaluator/grid/annotation/mapping drift, segmentation metric-lock/argument drift, uncertainty-plan drift, claim-boundary drift, registration drift, undeclared missing measurements, measurement-bearing failed receipts, non-null aggregate/CI summaries after any failed track, unregistered registration/hypothesis/metric/corpus/runtime/result/track/aggregate/measurement fields, inconsistent P/R/F triplets, post-hoc metric additions, and unregistered failed-track exclusion fail closed.
- The validator does not claim that SHA-256 proves licensing, annotation validity, scientific adequacy, independence beyond exact-byte uniqueness, aggregate derivation, or that the registered statistical procedure is appropriate. Rights and scientific review remain separate gates.

## References

Buisson, M., McFee, B., Essid, S., & Crayencour, H. C. (2024). Self-supervised learning of multi-level audio representations for music segmentation. *IEEE/ACM Transactions on Audio, Speech, and Language Processing, 32*, 2141–2152. https://doi.org/10.1109/TASLP.2024.3379894

Choi, E., Kim, H., Ryu, J., Nam, J., & Jeong, D. (2025). *On the de-duplication of the Lakh MIDI dataset* [Conference paper]. International Society for Music Information Retrieval Conference. https://doi.org/10.5281/zenodo.17811316

Kim, T., & Nam, J. (2023). All-in-one metrical and functional structure analysis with neighborhood attentions on demixed audio. In *2023 IEEE Workshop on Applications of Signal Processing to Audio and Acoustics (WASPAA)* (pp. 1–5). IEEE. https://doi.org/10.1109/WASPAA58266.2023.10248148

MIREX. (2025). *Music Structure Analysis*. https://music-ir.org/mirex/wiki/2025:Music_Structure_Analysis

MIREX. (2025). *Music Structure Analysis Results*. https://music-ir.org/mirex/wiki/2025:Music_Structure_Analysis_Results

MIREX. (2026). *Music Structure Analysis*. https://music-ir.org/mirex/wiki/2026:Music_Structure_Analysis

MIREX Evaluation contributors. (2026). *music_structure_analysis/eval_script.py* (commit `b9fa0b0b32e2145af31f35830f78fc9d09a4301b`). GitHub. https://github.com/ismir-mirex/mirex-evaluation/blob/b9fa0b0b32e2145af31f35830f78fc9d09a4301b/music_structure_analysis/eval_script.py

mir_eval contributors. (n.d.). *mir_eval.segment: Structural segmentation evaluation*. https://github.com/mir-evaluation/mir_eval/blob/main/mir_eval/segment.py

Wang, J.-C., Hung, Y.-N., & Smith, J. B. L. (2022). To catch a chorus, verse, intro, or anything else: Analyzing a song with structural functions. In *ICASSP 2022—2022 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)* (pp. 416–420). IEEE. https://arxiv.org/abs/2205.14700

# Structure feature noninferiority gate

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228  
Production baseline: `chroma_cqt` in `sections/segmenter.py`

## Decision

The earlier `chroma_cqt` → `chroma_stft` optimization is not a production change until a preregistered, rights-cleared real-audio experiment shows that the candidate is noninferior on rehearsal-relevant structure quality and materially faster on the same corpus and runtime identity.

The repository owns the registration/result-admission boundary in `scripts/research/validate_structure_noninferiority.py`, the CQT/STFT admitted-PCM lanes in `scripts/research/measure_structure_feature_lanes.py`, recognized metric adapters, the isolated performance producer in `scripts/research/measure_structure_lane_resources.py`, and the paired aggregation/uncertainty implementation in `scripts/research/aggregate_structure_noninferiority.py`. Corpus admission, quality measurement, performance measurement, aggregation, uncertainty estimation, and result admission remain separate scientific boundaries, but every result-affecting semantic is bound into one metric-aware registration digest before candidate results may be inspected.

The canonical public validator is a metric-aware façade over the historical base decision/result policy in `validate_structure_noninferiority_base.py`. Its SHA-256 binds the validated registration together with repository-owned metric runtime/adapters, the `isolated-single-shot-v1` performance contract, and aggregation/uncertainty semantics. A receipt carrying only the former registration-JSON digest is rejected.

This prevents a favorable result from silently changing the corpus, thresholds, feature identities, metric implementation/runtime, timing/RSS method, aggregation weighting, bootstrap procedure, runtime, or permitted interpretation after measurements are visible.

## Registered inputs

A registration is valid only when it records all of the following before the result is evaluated:

- baseline `chroma_cqt` and candidate `chroma_stft`;
- a rights-cleared real-audio corpus with stable track IDs, content-unique audio SHA-256 identities, annotation SHA-256, rights basis, and provenance URI;
- exact source commit and `uv.lock` identity plus Python, librosa, NumPy, sample rate, channel count, and host profile;
- caller-selected noninferiority/speed thresholds and the pinned MIREX functional-ACC evaluator commit/function, 200 ms frame-grid contract v1, and versioned annotation/label-mapping semantics;
- the paired-bootstrap procedure identity, 95% confidence level, resample count, and random seed;
- a non-empty claim boundary stating the population/runtime scope to which a passing result may be applied.

The registration digest additionally binds repository-owned scientific implementation constants. It fixes the SHA-256 of `services/analysis-engine/requirements-structure-metrics.lock`, detection windows 0.5 s and 3.0 s with `beta=1.0, trim=True`, deviation with `trim=True`, pairwise grouping with `frame_size=0.1, beta=1.0`, the complete `isolated-single-shot-v1` performance measurement contract, and the complete `macro-track-v1` / `paired-track-bootstrap-v1` aggregation and uncertainty semantics. Focused contract tests cross-check those constants against the executable owners so metadata drift fails before real-audio execution.

Schema v1 is closed-world at the registration top level and inside the hypothesis, metric, corpus-track, runtime, result, per-track, aggregate, and measurement objects. Extra fields are not treated as harmless annotations: an unregistered pilot-selection flag, metric weight, corpus-selection marker, cache/runtime hint, p-value, or post-hoc selection marker changes what reviewers may infer was preregistered and therefore fails admission.

`experiment_id` is a semantic label; the metric-aware registration SHA-256 is the exact evidence identity. `source_uri` must be an explicit non-`file:` provenance URI. Licensed benchmark material may remain private, but a workstation path is not scientific provenance.

Track IDs are labels, not independent scientific units by themselves. Schema v1 rejects duplicate `audio_sha256` values across different track IDs so one recording cannot silently count as multiple independent observations. A scientifically justified repeated-item or clustered design requires a preregistered dependence model and schema revision.

The current minimum of two tracks is only a technical guard against a one-item corpus. It is not a scientific sample-size claim. Corpus breadth, genre/instrumentation coverage, annotation quality, independence/dependence structure, and an adequate uncertainty plan remain experiment-review questions before a production switch can be accepted.

Schema v1 has no dropout, exclusion, or missing-track policy. Every registered track must complete baseline and candidate quality plus the preregistered performance measurement for an acceptance PASS. Any non-empty `failed_tracks` list makes acceptance fail; aggregate and confidence-interval fields must then be JSON `null` so a complete-case subset cannot masquerade as the preregistered corpus.

## Metrics and measurement contracts

BandScope uses the MIREX Music Structure Analysis task and its standardized evaluator repository as the functional-structure reference point.

| Evidence | Registered implementation / convention | Decision use |
| --- | --- | --- |
| Boundary precision/recall/F at 0.5 s | `mir_eval.segment.detection(window=0.5, beta=1.0, trim=True)` | F noninferiority |
| Boundary precision/recall/F at 3.0 s | `mir_eval.segment.detection(window=3.0, beta=1.0, trim=True)` | F noninferiority |
| Boundary median deviation, both directions | `mir_eval.segment.deviation(trim=True)` | Report per track and aggregate |
| Functional-label accuracy | `ismir-mirex/mirex-evaluation@b9fa0b0...:music_structure_analysis.eval_script.calculate_accuracy`; 0.2 s grid; frame-grid v1; annotation v1; label-mapping v1 | Noninferiority |
| Repetition/group consistency precision/recall/F | `mir_eval.segment.pairwise(frame_size=0.1, beta=1.0)` | F noninferiority |
| Latency | `isolated-single-shot-v1`: fresh subprocess per observation, 0 warmups, 20 trials/lane/track, alternating lane order, `perf_counter_ns()` around repository segmenter only, NumPy linear p50/p95 | p95 ratio superiority |
| Peak memory | `isolated-single-shot-v1`: process-lifetime peak RSS, macOS `ru_maxrss`, Windows `PeakWorkingSetSize`, maximum across 20 trials | Report/capacity evidence |

The selected mir_eval calls execute only under the content-addressed research overlay whose exact lock SHA-256 participates in the registration digest. The runtime verifier separately requires the installed distribution to be `mir_eval==0.8.2` before recognized segmentation metrics run. Full artifact provenance and adapter semantics are recorded in `docs/traceability/mir/structure-segmentation-metric-adapter.md`.

The current official `ismir-mirex/mirex-evaluation` MIREX-2025 reproduction at commit `b9fa0b0b32e2145af31f35830f78fc9d09a4301b` uses a 0.2 s functional-ACC hop, `np.arange(0, gt_duration, frame_hop)`, and advances a segment when a frame point is greater than or equal to its end. BandScope pins that executable evaluator identity and grid rather than choosing a frame size from prose examples. Source-label normalization must occur before preregistration and is bound by the admitted annotation SHA-256; it cannot change after candidate results are visible.

Result receipts carry precision and recall alongside F for boundary and repetition measures. Admission recomputes the harmonic mean and rejects inconsistent P/R/F triplets. That integrity check does not replace the recognized metric implementation.

### Latency and peak RSS

`isolated-single-shot-v1` is documented in `docs/traceability/mir/structure-performance-measurement-contract.md`. Every observation starts a fresh process to avoid inheriting feature-lane or allocator state from the other observation. The parent passes the already-admitted immutable PCM snapshot to the child before the timer starts. `perf_counter_ns()` measures only the repository-owned structure-segmentation call; process startup and input transport are harness overhead and are not claimed as algorithm latency.

There are no same-process warm-up iterations. A cache-hot benchmark path is not assumed to represent the buyer's first analysis of a song. Twenty observations per lane are a preregistered engineering sampling plan rather than a claim of universal tail-latency precision. Trial order alternates CQT→STFT and STFT→CQT to reduce deterministic order bias; the exact host/runtime profile and claim boundary still own OS-wide cache, thermal, frequency, and scheduling limitations.

Peak RSS deliberately covers the entire worker lifetime, including interpreter/runtime and PCM input resident before the timer. macOS uses `getrusage(RUSAGE_SELF).ru_maxrss` with the Apple-documented KiB conversion; Windows uses `GetProcessMemoryInfo(...).PeakWorkingSetSize` in bytes. The contract fails closed on unsupported platforms instead of pretending those APIs have cross-platform-equivalent units.

The canonical admitted-track consumer binds the quality and performance producers to the same PCM memoryview identity, sample rate, and exact `decoded_frames / sample_rate_hz` duration. Synthetic or monkeypatched fixtures exercise machinery only and do not count as scientific acceptance.

Published MIREX scores are external context, not BandScope noninferiority margins. Acceptable quality loss and required latency improvement remain product/scientific decisions that must be fixed before candidate measurement.

## Aggregation and paired uncertainty

`aggregate_structure_noninferiority.py` owns the frozen `macro-track-v1` / `paired-track-bootstrap-v1` procedure. The registered track pair is the sampling unit; baseline and candidate observations for a track are never separated during resampling.

The aggregate is deliberately macro-oriented rather than duration weighted:

- every registered track has equal weight for quality and latency summaries;
- boundary and repetition F are recomputed as the harmonic mean of macro precision and macro recall rather than averaging per-track F directly;
- boundary-deviation summaries are macro track means;
- functional-label ACC is the macro track mean;
- p50 and p95 latency are macro track means;
- peak RSS is the maximum observed per-track peak, not a mean.

For uncertainty, each bootstrap replicate samples `registered_track_count` paired track indices with replacement. The implementation uses `numpy.random.Generator(PCG64)` with the preregistered seed. The 95% interval is the 0.025 and 0.975 empirical quantile of the bootstrap statistic using NumPy's `linear` quantile method. Quality intervals are formed for candidate-minus-baseline macro statistics; the latency interval is formed for the candidate/baseline macro p95 ratio. The registration accepts 1,000 through 100,000 resamples for this procedure, with the exact count and seed included in the registration digest.

This is a percentile-bootstrap interval, not a symmetric interval around the observed statistic. Its endpoints are quantiles of the bootstrap distribution and can be asymmetric; the observed aggregate statistic is therefore not required to lie between those endpoints. Hall (1988) treats the percentile family as a bootstrap-quantile construction and documents that bootstrap interval methods can have materially different coverage and positioning properties.

The historical base validator predates the frozen percentile procedure and still contains an obsolete point-containment invariant. The metric-aware façade handles only those containment errors with a private validation projection. The stored receipt, track measurements, aggregate values, and interval bounds are not modified. Public result admission independently recomputes `macro-track-v1` aggregate values and both `paired-track-bootstrap-v1` interval objects from the complete stored track array plus the preregistered uncertainty plan, and requires exact equality. The RED→GREEN lineage is recorded in `docs/traceability/mir/structure-result-receipt-binding.md`.

The procedure being executable and preregisterable does not by itself establish that a particular corpus size, resample count, seed, margin, or claim boundary is scientifically adequate. A different bootstrap method, dependence model, or aggregation weighting requires a new versioned contract before candidate results are inspected.

## Decision rule

For each quality metric `m`, let `Δm = candidate - baseline`. The quality criterion passes only when:

`lower_CI95(Δm) >= -noninferiority_margin(m)`

For p95 latency, let `r = candidate_p95 / baseline_p95`. The speed criterion passes only when:

`upper_CI95(r) <= maximum_candidate_ratio`

The decision is based on preregistered interval bounds, not on whether the interval contains the observed point estimate. A favorable point estimate cannot hide an interval that crosses the registered threshold, and an unfavorable interval cannot be repaired by choosing another seed, resample count, aggregation rule, timing method, or claim boundary after results are known.

Because schema v1 has no exclusion policy, any failed track fails before aggregate decision rules are evaluated. Failed runs preserve ordered diagnostic track identity but carry null aggregate/CI summaries.

Synthetic unit-test values are policy fixtures only. They are not production margins, corpus evidence, or a power justification.

## Result receipt

A result receipt contains the exact metric-aware registration digest, exact uncertainty plan, exact corpus order, one ordered track receipt per registered track, failed-track IDs, and the exact preregistered claim boundary. A complete successful run additionally carries aggregate measurements, paired 95% intervals for each gated quality metric, and a paired p95-latency-ratio interval.

Each successful per-track and aggregate baseline/candidate measurement is a closed-world receipt containing exactly the registered quality fields plus reporting precision/recall, boundary deviation, p50/p95 latency, and peak RSS. Those performance fields are valid scientific evidence only when produced by the canonical admitted-track path bound to `isolated-single-shot-v1`; the schema's numeric validation alone is not treated as provenance.

The receipt is rejected when a track is omitted or reordered; missing measurements are not paired with an explicit failed-track declaration; a failed receipt carries measurements; a failed run carries non-null aggregate/CI summaries; the uncertainty plan or claim boundary differs; required metrics are absent; unregistered fields appear; a P/R/F triplet is inconsistent; values are non-finite; interval bounds are malformed; the aggregate or CI values differ from canonical recomputation; or the metric-aware registration digest differs. Percentile intervals are not rejected merely because an observed aggregate point lies outside them.

The admission validator does not trust caller-authored aggregate/CI values as scientific authority. It invokes the repository-owned paired aggregator over the complete stored track set and preregistered uncertainty plan, then exact-matches all stored aggregate and interval values against that deterministic output. Review still has to establish the upstream scientific validity of the per-track measurements, corpus, numeric thresholds, host/runtime profile, and claim boundary; those questions are not proved by recomputing a receipt.

## Machine-readable evidence admission

Registration and result JSON are evidence, not trusted configuration. CLI admission is bounded to 2 MiB per file, reads from one already-open regular-file descriptor, requires UTF-8 and standards-compliant finite JSON values, and rejects duplicate object keys rather than accepting last-key-wins behavior.

`source_uri` is provenance metadata only and is never dereferenced by the validator. Audio and annotation bytes are not opened by result admission and are bound to the experiment through SHA-256 identities supplied by corpus admission.

## Reproducibility sequence

1. Review rights basis, corpus composition, distinct audio identities, feature hypothesis, metric contract, functional-ACC grid/mapping, `isolated-single-shot-v1`, host profile, numeric margins, `macro-track-v1` aggregation, `paired-track-bootstrap-v1` resample count/seed, and claim boundary before candidate execution. If clustering, repeated recordings, alternative label mapping, a different performance method, or any exclusion tolerance is scientifically required, version that policy before measurement.
2. Serialize the registration and run `python scripts/research/validate_structure_noninferiority.py <registration.json>` to obtain the metric-aware SHA-256. The digest includes validated registration data plus repository-owned quality-metric, performance-measurement, and aggregation/uncertainty contracts.
3. Admit the rights-cleared corpus once, then run CQT and STFT quality lanes on the same decoded PCM/reference segmentation and run `isolated-single-shot-v1` on that same admitted PCM identity. Functional ACC preserves the pinned 200 ms MIREX grid; boundary/deviation/repetition use the pinned research runtime; latency/RSS use the pinned subprocess/timer/native-memory contract.
4. Feed the complete ordered track measurements to `aggregate_structure_noninferiority.py`. Do not hand-author aggregate values or confidence intervals. If any registered track fails, preserve the failure receipt and emit null aggregate/CI summaries instead of a complete-case result.
5. Put the metric-aware registration digest, identical uncertainty fields, corpus order, and claim boundary in the result receipt, then run `python scripts/research/validate_structure_noninferiority.py <registration.json> <result.json>`. Admission recomputes aggregate and both interval objects from the stored tracks and rejects any mismatch before returning a decision.
6. Preserve registration, metric-aware digest contract, result receipt, corpus/annotation hashes, exact source/lock identities, performance-contract identity, aggregation implementation identity, uncertainty plan, host profile, and claim boundary together. A production feature switch requires this evidence plus normal independent review and protected-head checks.

No step authorizes committing licensed audio to Git. Evaluation rights and redistribution rights remain separate.

## Security Notes

- Audio and annotation are untrusted inputs. Corpus admission owns file/decode boundaries; result admission reads bounded JSON only.
- Evidence JSON is limited to 2 MiB, must be a regular file read through one open descriptor, must decode as UTF-8, and rejects duplicate keys plus non-standard `NaN`/`Infinity` constants.
- `source_uri` is evidence metadata, not a fetch instruction; local filesystem forms are rejected.
- Audio/annotation SHA-256 values bind measurements to bytes without embedding media; duplicate audio content identity under different track IDs is rejected.
- The performance worker receives only admitted PCM through stdin and closed-world numeric/feature arguments. It uses `sys.executable`, the repository-owned worker path, an argument array, and `shell=False`; it adds no generic exec, URL, network, or plugin surface.
- Worker non-zero exit, stderr, malformed receipt, unsupported platform, invalid timer/RSS, metric/runtime drift, aggregation/uncertainty drift, aggregate/CI recomputation drift, claim-boundary drift, registration drift, failed-receipt fabrication, and inconsistent P/R/F triplets fail closed.
- The percentile compatibility projection exists only inside result validation and never rewrites the stored scientific receipt or CI bounds; canonical-summary binding compares the original stored receipt.
- SHA-256 does not prove licensing, annotation validity, corpus adequacy, independence beyond exact-byte uniqueness, measurement-method adequacy, or statistical appropriateness. Rights and scientific review remain separate gates.

## References

Buisson, M., McFee, B., Essid, S., & Crayencour, H. C. (2024). Self-supervised learning of multi-level audio representations for music segmentation. *IEEE/ACM Transactions on Audio, Speech, and Language Processing, 32*, 2141–2152. https://doi.org/10.1109/TASLP.2024.3379894

Choi, E., Kim, H., Ryu, J., Nam, J., & Jeong, D. (2025). *On the de-duplication of the Lakh MIDI dataset* [Conference paper]. International Society for Music Information Retrieval Conference. https://doi.org/10.5281/zenodo.17811316

Hall, P. (1988). Theoretical comparison of bootstrap confidence intervals. *The Annals of Statistics, 16*(3), 927–953. https://doi.org/10.1214/aos/1176350933

Kim, T., & Nam, J. (2023). All-in-one metrical and functional structure analysis with neighborhood attentions on demixed audio. In *2023 IEEE Workshop on Applications of Signal Processing to Audio and Acoustics (WASPAA)* (pp. 1–5). IEEE. https://doi.org/10.1109/WASPAA58266.2023.10248148

MIREX. (2025). *Music Structure Analysis*. https://music-ir.org/mirex/wiki/2025:Music_Structure_Analysis

MIREX. (2025). *Music Structure Analysis Results*. https://music-ir.org/mirex/wiki/2025:Music_Structure_Analysis_Results

MIREX. (2026). *Music Structure Analysis*. https://music-ir.org/mirex/wiki/2026:Music_Structure_Analysis

MIREX Evaluation contributors. (2026). *music_structure_analysis/eval_script.py* (commit `b9fa0b0b32e2145af31f35830f78fc9d09a4301b`). GitHub. https://github.com/ismir-mirex/mirex-evaluation/blob/b9fa0b0b32e2145af31f35830f78fc9d09a4301b/music_structure_analysis/eval_script.py

mir_eval contributors. (n.d.). *mir_eval.segment: Structural segmentation evaluation*. https://github.com/mir-evaluation/mir_eval/blob/main/mir_eval/segment.py

NumPy Developers. (2026). *numpy.quantile*. https://numpy.org/doc/stable/reference/generated/numpy.quantile.html

Python Software Foundation. (2026). *time — Time access and conversions*. Python 3.14 documentation. https://docs.python.org/3/library/time.html#time.perf_counter

Apple Inc. (2004). *getrusage(2) — get information about resource utilization*. Mac OS X manual pages. https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/getrusage.2.html

Microsoft. (2024). *Process memory usage information*. Windows App Development documentation. https://learn.microsoft.com/windows/win32/psapi/process-memory-usage-information

Wang, J.-C., Hung, Y.-N., & Smith, J. B. L. (2022). To catch a chorus, verse, intro, or anything else: Analyzing a song with structural functions. In *ICASSP 2022—2022 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)* (pp. 416–420). IEEE. https://arxiv.org/abs/2205.14700

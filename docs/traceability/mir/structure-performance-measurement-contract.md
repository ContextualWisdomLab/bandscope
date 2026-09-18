# Structure performance measurement contract

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228  
Parent: `docs/traceability/mir/structure-feature-noninferiority.md`

## Problem

The structure noninferiority result schema already carries per-track `p50_latency_seconds`, `p95_latency_seconds`, and `peak_rss_mib`, and the canonical aggregator uses those fields for latency comparison and maximum peak-RSS reporting. Before this change, however, no repository-owned producer defined how those numbers were obtained. A syntactically valid receipt could therefore use arbitrary warm-up counts, timer boundaries, process scopes, quantile construction, or resident-memory definitions while still passing schema validation.

That is not sufficient for a production decision between `chroma_cqt` and `chroma_stft`. Performance evidence must be fixed before candidate results are observed, must consume the same admitted decoded PCM identity as the quality comparison, and must avoid a cache-warmed benchmark path that is unlike a user's first analysis of a song.

## Decision

`isolated-single-shot-v1` is the only preregistered structure performance contract in schema v1. Its complete semantics are owned by `scripts/research/measure_structure_lane_resources.py` and copied into `STRUCTURE_METRIC_CONTRACT["performance_measurement"]`, so they participate in the metric-aware registration SHA-256.

The contract is:

- supported evidence platforms: macOS (`darwin`) and Windows (`win32`);
- warm-up trials: 0;
- measured trials: 20 per feature lane and per admitted track;
- each observation runs in a fresh Python subprocess;
- paired trial order alternates CQT→STFT, then STFT→CQT, by trial index;
- latency clock: `time.perf_counter_ns()`;
- latency scope: only the repository-owned `repository_structure_segmenter(feature)` call;
- worker startup and parent→child PCM transfer are excluded from latency;
- latency summaries: p50 and p95 via NumPy `quantile(..., method="linear")`;
- memory metric: process peak resident set size over the worker's entire lifetime, including the PCM input resident in the child;
- per-lane track-level `peak_rss_mib`: maximum observed process peak RSS across the 20 trials.

Twenty observations are a preregistered engineering sampling plan, not a claim that twenty observations estimate an asymptotic tail distribution. The production decision still uses the registered paired track-level bootstrap across the rights-cleared corpus; the within-track repetitions create the frozen p50/p95 performance summary supplied to that higher-level procedure.

## Timer boundary

Python documents `perf_counter()` as a performance counter with the highest available resolution for short durations and states that it is monotonic in CPython; `perf_counter_ns()` returns the same clock as integer nanoseconds and avoids float precision loss. The worker therefore records `perf_counter_ns()` immediately before and after the one repository-owned structure-segmentation call.

Process launch, interpreter startup, imports, and PCM transfer are not included in the latency value because those costs are invariant experiment harness overhead rather than the feature-representation computation under comparison. They are not silently removed from memory evidence: peak RSS is process-lifetime evidence and therefore includes interpreter/runtime state and the PCM input already resident before the timer starts.

## No warm-up path

The contract deliberately performs zero same-process warm-up iterations. Reusing one process for repeated warm-up and measured calls could retain allocator state, imported-library caches, FFT plans, page cache effects, or other state that is not guaranteed on a buyer's first analysis. Each observation instead starts from a fresh worker process.

This does not claim that operating-system file cache, CPU frequency, thermal state, or other host-wide state is perfectly reset between trials. Those factors remain part of the exact host/runtime profile and claim boundary that must be frozen before real-corpus execution. Alternating lane order limits deterministic order bias but does not erase host-state variance.

## Peak RSS semantics

On macOS, the worker reads `getrusage(RUSAGE_SELF).ru_maxrss`. Apple's `getrusage(2)` documentation defines `ru_maxrss` as maximum resident set size and documents the value in kilobytes, so the implementation converts KiB to MiB by dividing by 1024.

On Windows, the worker calls `GetProcessMemoryInfo` and uses `PROCESS_MEMORY_COUNTERS.PeakWorkingSetSize`. Microsoft documents the working set as physical memory mapped into the process address space and exposes both current and peak working-set size. The implementation converts bytes to MiB.

Linux is intentionally not admitted for `isolated-single-shot-v1`. Python's `resource` API is Unix-specific and `ru_maxrss` unit conventions are platform-dependent; adding Linux would require a separately reviewed platform contract rather than silently treating all `getrusage` values as equivalent.

## Exact admitted-track binding

`PairedFunctionalAccuracyTrackConsumer.for_registered_cqt_stft_hypothesis()` binds the performance evaluator and `isolated-single-shot-v1` contract identity together with the canonical CQT/STFT quality lanes. For each admitted track the resource measurement receives the same immutable PCM memoryview, sample rate, and exact `decoded_frames / sample_rate_hz` duration already used for quality evidence.

The resource worker is not given a corpus path, URL, track ID, arbitrary command, or feature selected by external text. The feature identity is closed-world (`cqt` or `stft`), stdin contains only the already-admitted PCM bytes, and subprocess launch uses an argument array with `shell=False`.

The scientific receipt records the contract identity plus baseline/candidate p50, p95, peak RSS, and measured-trial count. A caller cannot bind a performance evaluator without a contract identity, and the canonical consumer rejects a result whose contract ID or measured-trial count differs from the preregistered owner.

## RED → GREEN lineage

- RED `6fcc9e96eba9e6a9c3b3deed19b40a54e6c33ade` required a repository-owned measurement contract, alternating paired order, exact linear p50/p95 construction, maximum RSS, and immutable PCM/duration admission.
- GREEN `0b80bc22adadaf4998b562dbf5fcd94a0492ba5a` implemented `isolated-single-shot-v1` with fresh subprocesses, `perf_counter_ns`, Darwin `ru_maxrss`, Windows `PeakWorkingSetSize`, and fail-closed worker receipts.
- Registration binding `3877adc806229b08a07fbbd00c38b8809e595163` added the complete performance contract to the metric-aware registration digest.
- RED `bf905c74cfdd24f67708e5acf6619832b69737f2` required canonical admitted-track evidence to contain the exact performance contract and baseline/candidate summaries.
- GREEN `f06f1dc059a461037ca95fd55e0c7b49e6ccb2f4` bound the canonical CQT/STFT consumer to the performance producer and same admitted PCM identity.
- Contract fixture `a05c345a23910e0e0c48f327ded8ea1a8d09bb9a` cross-checks registration metadata against the executable performance owner.
- Hygiene repair `6d49d7a54672eda000d94682c2040915f6b4657e` removed an unused typing import before hosted lint evidence.
- Focused-test alignment `11c59ade85b1866e550edec2ea26cb185670c9ab` prevents the recognized-metric unit boundary from accidentally launching platform performance workers; the dedicated performance tests own that contract.

## Rejected alternatives

**Time the existing parent-process quality call.** Rejected because both lanes would inherit process/import/allocation state from earlier scientific work and each other, obscuring a reproducible first-analysis comparison.

**Warm the segmenter or feature computation before measurement.** Rejected because it would preferentially measure a cache-hot state that the buyer path does not guarantee.

**Include subprocess startup and PCM transport in algorithm latency.** Rejected because the experiment question is whether STFT changes the structure-analysis computation relative to CQT. Harness launch/transport costs are common orchestration overhead. They remain visible in process-lifetime RSS and must be kept out of claims about end-to-end application startup.

**Use one cross-platform `ru_maxrss` conversion.** Rejected because RSS units and APIs are platform-specific. The contract names the OS API and conversion explicitly and fails closed elsewhere.

**Use average RSS or a sampled polling thread.** Rejected because average sampling introduces sampling cadence as another scientific choice and can miss short peaks. The native process peak counters directly provide the resource ceiling relevant to buyer capacity risk.

**Use fewer measured trials when a track is expensive.** Rejected because data-dependent or operator-dependent trial reduction would change the estimator after corpus identity is known. An execution that cannot complete the preregistered count is a failed track under the existing no-exclusion policy.

## Security Notes

- Input remains local-only and path-free after corpus admission.
- Subprocess invocation uses `sys.executable`, the repository-owned worker path, exact numeric arguments, `shell=False`, and stdin PCM bytes; no generic execution surface is introduced.
- Any non-zero exit, worker stderr, malformed JSON, unexpected receipt field, unsupported platform, invalid timer, or invalid RSS value fails the scientific measurement.
- Raw licensed audio and workstation paths are not emitted in durable performance evidence.
- This contract adds no telemetry or network-dependent runtime path.

## Claim boundary and remaining work

This contract closes the missing canonical producer for per-track p50/p95 latency and peak RSS. It does not establish that STFT is faster, that either lane meets a product latency target, or that twenty within-track repetitions make p95 a universal tail-latency estimate.

Before rights-cleared real-audio execution, reviewers still must freeze the concrete corpus membership and representativeness, numeric quality noninferiority margins, maximum candidate latency ratio, exact bootstrap resample count and seed, exact host/runtime profile, and claim boundary. Candidate results must not be inspected before those choices are frozen.

Production default selection remains a separate change after the complete registered experiment passes. Synthetic and monkeypatched fixtures validate the measurement machinery only; they are not scientific acceptance evidence.

## References

Python Software Foundation. (2026). *time — Time access and conversions: time.perf_counter() and time.perf_counter_ns()*. Python 3.14 documentation. https://docs.python.org/3/library/time.html#time.perf_counter

Apple Inc. (2004). *getrusage(2) — get information about resource utilization*. Mac OS X manual pages. https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/getrusage.2.html

Microsoft. (2024). *Process memory usage information*. Windows App Development documentation. https://learn.microsoft.com/windows/win32/psapi/process-memory-usage-information

NumPy Developers. (2026). *numpy.quantile*. NumPy reference. https://numpy.org/doc/stable/reference/generated/numpy.quantile.html

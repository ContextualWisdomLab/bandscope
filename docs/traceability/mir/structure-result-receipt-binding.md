# Structure result receipt binding

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228  
Parent: `docs/traceability/mir/structure-feature-noninferiority.md`

## Problem

The preregistered result schema requires one ordered measurement receipt per registered track and separately requires aggregate measurements plus paired confidence intervals. Two integrity boundaries matter:

1. the per-track JSON must come from the exact admitted quality/performance evidence rather than being retyped by an experiment caller; and
2. aggregate and confidence-interval values must come from those stored track receipts through the repository-owned `macro-track-v1` / `paired-track-bootstrap-v1` implementation.

Before the aggregate repair, admission validated track receipts and summary fields independently. A syntactically valid receipt could therefore retain registered track evidence while carrying a favorable hand-authored aggregate or percentile interval. After the latency/RSS producer was added, a narrower upstream gap remained: the canonical admitted-track consumer held the complete functional-ACC, recognized segmentation metrics, and performance evidence in memory, but the repository did not own the conversion from that object to the closed schema-v1 `baseline` / `candidate` measurement objects. An experiment caller could still independently retype those numbers before aggregation.

## Decision

### Track-level receipt production

`evaluate_admitted_structure_track.py::noninferiority_track_receipt()` is the canonical adapter from admitted Signal-MIR evidence to one schema-v1 result track. It accepts only one `PairedFunctionalAccuracyEvidence` and requires all of the following before it emits a receipt:

- the exact pinned structure-metric runtime-lock SHA-256;
- baseline and candidate recognized segmentation metric evidence;
- the exact registered performance contract identity (`isolated-single-shot-v1`);
- baseline and candidate performance summaries produced under that contract.

The adapter then maps the immutable evidence directly into the exact schema-v1 measurement fields: functional ACC, boundary and repetition P/R/F, bidirectional boundary deviation, p50/p95 latency, and peak RSS. It does not accept caller-supplied replacement values, extra result fields, paths, or external producer metadata. `PairedFunctionalAccuracyTrackConsumer.result_track_receipts` exposes the same adapter across the ordered admitted evidence set.

This is a producer-integrity boundary, not a cryptographic attestation mechanism. An arbitrary external JSON file can still be authored outside this Python path; the public result validator cannot prove process history from numbers alone. Production evidence therefore preserves the corpus-admission receipt, canonical track-evidence execution, result receipt, source/runtime identity, and protected-head workflow evidence together. If independently verifiable track-producer attestation becomes a release requirement, it needs a new versioned evidence-envelope contract rather than an assertion that schema validation proves provenance.

### Aggregate and interval recomputation

Successful result admission deterministically recomputes all decision summaries from the complete stored `result.tracks` array and the preregistered uncertainty plan by calling `aggregate_structure_noninferiority.py`.

Admission requires exact equality for:

- `result.aggregate` versus canonical `macro-track-v1` recomputation;
- `result.paired_delta_ci95` versus canonical `paired-track-bootstrap-v1` recomputation;
- `result.p95_latency_ratio_ci95` versus the same canonical paired bootstrap.

The comparison occurs after the historical base validator has checked the result envelope, track order, measurement fields, finite values, P/R/F identities, failed-track policy, uncertainty identity, claim boundary, and decision-rule syntax. A failed run is not re-aggregated: schema v1 already requires null aggregate/CI summaries when `failed_tracks` is non-empty.

The percentile compatibility projection remains private to the historical base validator boundary. It exists only because the base validator predates percentile-bootstrap semantics and incorrectly requires every interval to contain the observed statistic. Canonical receipt binding compares the original stored aggregate and interval values, not the private projection. Therefore the projection cannot manufacture evidence that passes the recomputation gate.

## RED → GREEN lineage

### Summary provenance

RED `aacb026ed2e05dadce3fb0b7560836308bc73b92` added two executable regressions:

- change one valid per-track functional-accuracy value while leaving the favorable stored aggregate unchanged;
- hand-edit one otherwise valid paired interval while leaving the registered track receipts unchanged.

Both receipts were admitted by the predecessor validator because aggregate/CI provenance was not executable.

GREEN `5f47924d632946540d0c31e0c6456feac4667f8b` first bound the stored aggregate to canonical track reduction. Fixture alignment `4cdcf19a016c9b4d7a1c28ccc39784513700b297` changed policy fixtures to generate canonical summaries instead of hand-authored intervals. GREEN `da51a8aa5cddf9300bcbbe611d3929f4132da5a2` then bound both paired quality intervals and the p95-latency-ratio interval to deterministic bootstrap recomputation.

`5f698c4c98da83d6ca7860c6b32aee2980c5abb0` separated the legacy percentile point-containment compatibility regression from scientific result admission. `59d9c309015af6cdf9badc7cd50cf2d8bf5813e0` rewrote threshold regressions so failing decisions are derived from changed track evidence followed by canonical recomputation rather than hand-edited confidence intervals.

### Track producer provenance

RED `00d4efaa8353287a41817bab408a7a9149c13d6f` required a canonical adapter that can emit the exact schema-v1 track field set only from complete admitted Signal-MIR evidence and rejects partial/unbound evidence.

GREEN `334a78cf98a34a15596da0101bb9043640e61686` added `noninferiority_track_receipt()` and `result_track_receipts`. The adapter requires the pinned metric-runtime identity plus the registered performance contract and maps quality/performance evidence without a second caller-owned measurement implementation.

Fixture correction `5b380a8a4c0d82b2e20f8e69b62e79ffb54e5b9d` binds the regression fixture to the actual repository metric-runtime lock rather than a placeholder digest.

## Constraints and rejected alternatives

Trusting a comment, workflow name, producer claim, or arbitrary `producer="canonical"` JSON field was rejected. Those signals do not establish a causal relationship between admitted evidence and stored measurements or between stored tracks and decision summaries.

Letting the experiment caller build the track `baseline` / `candidate` dictionaries manually was rejected for the canonical path. It would recreate a measurement translation layer immediately after the repository had already produced immutable admitted evidence and would make favorable transcription errors indistinguishable from genuine output.

Checking only the aggregate was rejected as incomplete. The final production decision is made from percentile interval bounds, so favorable hand-authored confidence intervals would remain an acceptance bypass even if the aggregate itself were canonical.

Adding a second aggregation implementation inside the validator was rejected. `aggregate_structure_noninferiority.py` remains the single owner of track weighting, F recomputation, bootstrap sampling, RNG, and quantile semantics; admission invokes that owner instead of copying the formulas.

Approximate receipt comparison was rejected. The experiment registration pins source/runtime identities and deterministic bootstrap parameters. A durable result that was rounded, recomputed under another NumPy/runtime, or otherwise transformed is not the exact registered evidence artifact and must be regenerated under the registered environment.

## Security and integrity notes

- Track receipt conversion consumes only immutable in-memory admitted evidence and opens no corpus path, performs no network request, and executes no plugin.
- The canonical adapter fails closed when metric-runtime identity, recognized metric evidence, performance contract identity, or performance evidence is absent or drifted.
- Aggregate recomputation consumes only already-validated result data and preregistered uncertainty fields. It opens no corpus path, performs no network request, and executes no user-supplied plugin.
- Track omission, reordering, duplication, malformed metrics, non-finite values, failed-track fabrication, aggregate drift, and CI drift all fail closed before a passing decision is returned.
- Exact producer mapping and deterministic recomputation protect evidence integrity; they do not establish corpus representativeness, licensing, annotation validity, statistical power, suitable production margins, or the historical process provenance of arbitrary external JSON.

## Remaining scientific boundary

The canonical path now owns admitted quality evidence, the `isolated-single-shot-v1` p50/p95/peak-RSS producer, schema-v1 track-receipt construction, macro aggregation, and paired percentile-bootstrap recomputation.

This still does not authorize a real-audio run. Before candidate results are inspected, reviewers must freeze the concrete rights-cleared corpus, numeric noninferiority margins, maximum candidate latency ratio, exact bootstrap count/seed, exact macOS/Windows host/runtime profile, and claim boundary, and judge whether the corpus size and inference plan are scientifically adequate for that claim.

A passing registered experiment would establish evidence only within that frozen population/runtime claim. Production `chroma_cqt` → `chroma_stft` default selection remains a separate reviewed change with current protected-head checks and release evidence.

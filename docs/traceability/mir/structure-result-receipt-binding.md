# Structure result receipt binding

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228  
Parent: `docs/traceability/mir/structure-feature-noninferiority.md`

## Problem

The preregistered result schema required complete ordered per-track receipts and separately required aggregate measurements plus paired confidence intervals. Before this repair, result admission validated both parts but did not prove that the stored aggregate and confidence intervals were produced from those stored track receipts by the repository-owned `macro-track-v1` / `paired-track-bootstrap-v1` implementation.

That gap was scientifically material. A syntactically valid receipt could retain the registered corpus order and valid per-track measurements while carrying a favorable hand-authored aggregate or percentile interval. The base decision policy would then evaluate those stored summaries even though they were not causally bound to the track-level evidence.

## Decision

Successful result admission now deterministically recomputes all decision summaries from the complete stored `result.tracks` array and the preregistered uncertainty plan by calling `aggregate_structure_noninferiority.py`.

Admission requires exact equality for:

- `result.aggregate` versus canonical `macro-track-v1` recomputation;
- `result.paired_delta_ci95` versus canonical `paired-track-bootstrap-v1` recomputation;
- `result.p95_latency_ratio_ci95` versus the same canonical paired bootstrap.

The comparison occurs after the historical base validator has checked the result envelope, track order, measurement fields, finite values, P/R/F identities, failed-track policy, uncertainty identity, claim boundary, and decision-rule syntax. A failed run is not re-aggregated: schema v1 already requires null aggregate/CI summaries when `failed_tracks` is non-empty.

The percentile compatibility projection remains private to the historical base validator boundary. It exists only because the base validator predates percentile-bootstrap semantics and incorrectly requires every interval to contain the observed statistic. Canonical receipt binding compares the original stored aggregate and interval values, not the private projection. Therefore the projection cannot manufacture evidence that passes the new recomputation gate.

## RED → GREEN lineage

RED `aacb026ed2e05dadce3fb0b7560836308bc73b92` added two executable regressions:

- change one valid per-track functional-accuracy value while leaving the favorable stored aggregate unchanged;
- hand-edit one otherwise valid paired interval while leaving the registered track receipts unchanged.

Both receipts were admitted by the predecessor validator because aggregate/CI provenance was not executable.

GREEN `5f47924d632946540d0c31e0c6456feac4667f8b` first bound the stored aggregate to canonical track reduction. Fixture alignment `4cdcf19a016c9b4d7a1c28ccc39784513700b297` changed policy fixtures to generate canonical summaries instead of hand-authored intervals. GREEN `da51a8aa5cddf9300bcbbe611d3929f4132da5a2` then bound both paired quality intervals and the p95-latency-ratio interval to deterministic bootstrap recomputation.

`5f698c4c98da83d6ca7860c6b32aee2980c5abb0` separated the legacy percentile point-containment compatibility regression from scientific result admission: the compatibility helper can still prove that interval endpoints are not rewritten, while the public validator accepts only canonical intervals. `59d9c309015af6cdf9badc7cd50cf2d8bf5813e0` rewrote threshold regressions so failing noninferiority and latency decisions are derived from changed track evidence followed by canonical recomputation rather than from hand-edited confidence intervals.

## Constraints and rejected alternatives

Trusting a comment, workflow name, or producer claim that a JSON file came from the canonical aggregator was rejected. Those signals do not establish a causal relationship between stored track evidence and stored decision summaries.

Checking only the aggregate was rejected as incomplete. The final production decision is made from percentile interval bounds, so favorable hand-authored confidence intervals would remain an acceptance bypass even if the aggregate itself were canonical.

Adding a second aggregation implementation inside the validator was rejected. `aggregate_structure_noninferiority.py` remains the single owner of track weighting, F recomputation, bootstrap sampling, RNG, and quantile semantics; admission invokes that owner instead of copying the formulas.

Approximate receipt comparison was rejected. The experiment registration pins source/runtime identities and deterministic bootstrap parameters. A durable result that was rounded, recomputed under another NumPy/runtime, or otherwise transformed is not the exact registered evidence artifact and must be regenerated under the registered environment.

## Security and integrity notes

- The recomputation path consumes only already-validated in-memory result data and preregistered uncertainty fields. It opens no corpus path, performs no network request, and executes no user-supplied plugin.
- Track omission, reordering, duplication, malformed metrics, non-finite values, failed-track fabrication, aggregate drift, and CI drift all fail closed before a passing decision is returned.
- Exact deterministic recomputation protects evidence integrity; it does not establish corpus representativeness, licensing, annotation validity, statistical power, or suitable production margins. Those remain independent scientific/product gates.

## Remaining scientific boundary

This repair closes the result-summary provenance gap. It does not authorize a real-audio run. Before candidate results are inspected, reviewers still have to freeze the concrete rights-cleared corpus, numeric noninferiority margins, latency ratio threshold, exact bootstrap count/seed, host/runtime profile, and claim boundary.

A separate unresolved measurement gap remains for timing and memory: the admitted-track MIR consumer already produces structure-quality metrics, but the canonical path from that same admitted execution to per-track p50/p95 latency and peak-RSS receipts still requires explicit trial/warm-up/timer/memory semantics before those fields can be treated as production scientific evidence.

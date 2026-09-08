# Analysis single-orchestration owner evidence

Last reviewed: 2026-09-09

## Problem

The native desktop process already owns the analysis job lifecycle and invokes `bandscope_analysis.cli`, which delegates the request to `run_analysis_job` or `run_analysis_job_updates`. The CLI nevertheless contained a temporary local-audio branch that instantiated `TemporalAnalyzer` and analyzed `localSource.sourcePath` before entering that canonical orchestration path.

One native job could therefore decode/analyze the same admitted source once in the temporary CLI pre-pass and again in the production orchestration path. The first result was not authoritative rehearsal output: only its BPM was logged, and any failure was swallowed before orchestration continued. This added avoidable decoder/MIR CPU and memory pressure inside the same subprocess resource lease and created a second analysis owner below the native job boundary.

## Decision

Keep `bandscope_analysis.cli` as transport and dispatch only. Local-audio MIR work belongs to `run_analysis_job` / `run_analysis_job_updates` and their domain services. The CLI may validate its envelope and select progress/non-progress output mode, but it must not pre-run `TemporalAnalyzer` or another MIR implementation before dispatch.

Alternatives rejected:

- Retaining the pre-pass for a fast BPM preview: it performs real analysis without owning product status, cancellation semantics, cache semantics, or resource evidence.
- Feeding the pre-pass result into orchestration: that would create a second cache/data contract and widen the CLI boundary instead of removing the duplicate owner.
- Treating the extra work as harmless because exceptions are caught: resource consumption occurs before the catch and the duplicated result is not buyer authority.

## RED → production repair

RED `15bf1fb266ee9815db70cafd304c351f72213de9` adds `test_progress_jsonl_delegates_local_audio_analysis_once`. The regression supplies a local-audio envelope, replaces the canonical orchestration function with a deterministic fixture, installs a counting `TemporalAnalyzer`, and requires exactly one orchestration call and zero CLI temporal calls. The predecessor calls the temporary analyzer, so it violates that contract.

Production `f3235e8b2dfd329ec35e3f6bb2b95d54b3b7fc73` removes the temporary `TemporalAnalyzer` import/block and its now-unused CLI logging setup. The CLI still preserves native `requestedAt`, handles manual/status modes, streams JSONL through `run_analysis_job_updates`, and uses `run_analysis_job` for non-streaming callers.

RED and production commits were consecutive ordinary descendants, so this document does not claim a hosted RED failure. Hosted GREEN belongs only to the final exact #866 head after all current-head workflows complete.

## Security Notes

Untrusted local paths remain inside the already-established native/app-owned source and Python request boundaries. This repair does not add filesystem, subprocess, IPC, PID, model, or network authority. It removes an extra decoder/MIR invocation that ran before the canonical orchestration owner, reducing duplicate work inside the analysis process without claiming a whole-process CPU/RAM/GPU budget.

The change is not evidence that decoder/resampler peak RSS, model VRAM, cancellation latency, or Windows descendant containment are commercially bounded. Those acceptance items remain open and require rights-cleared full-length rehearsal audio plus platform-specific containment evidence.

## Acceptance

The product contract is now: one native analysis request -> one CLI dispatch -> one canonical analysis orchestration path. A future CLI-level preview or probe must be modeled as an explicit bounded domain operation with its own product status/resource contract rather than reintroducing a hidden pre-pass.
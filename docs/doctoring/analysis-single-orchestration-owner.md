# Analysis single-orchestration owner evidence

Last reviewed: 2026-09-09

## Problem

The native desktop process already owns the analysis job lifecycle and invokes `bandscope_analysis.cli`, which delegates the request to `run_analysis_job` or `run_analysis_job_updates`. The CLI nevertheless contained a temporary local-audio branch that instantiated `TemporalAnalyzer` and analyzed `localSource.sourcePath` before entering that canonical orchestration path.

One native job could therefore decode/analyze the same admitted source once in the temporary CLI pre-pass and again in the production orchestration path. The first result was not authoritative rehearsal output: only its BPM was logged, and any failure was swallowed before orchestration continued. This added avoidable decoder/MIR CPU and memory pressure inside the same subprocess resource lease and created a second analysis owner below the native job boundary.

## Decision

Keep `bandscope_analysis.cli` as transport and dispatch only. Local-audio MIR work belongs to `run_analysis_job` / `run_analysis_job_updates` and their domain services. The CLI may validate its envelope, configure its established diagnostics and select progress/non-progress output mode, but it must not pre-run `TemporalAnalyzer` or another MIR implementation before dispatch.

Alternatives rejected:

- Retaining the pre-pass for a fast BPM preview: it performs real analysis without owning product status, cancellation semantics, cache semantics, or resource evidence.
- Feeding the pre-pass result into orchestration: that would create a second cache/data contract and widen the CLI boundary instead of removing the duplicate owner.
- Treating the extra work as harmless because exceptions are caught: resource consumption occurs before the catch and the duplicated result is not buyer authority.

## RED → production repair

RED `15bf1fb266ee9815db70cafd304c351f72213de9` adds `test_progress_jsonl_delegates_local_audio_analysis_once`. The regression supplies a local-audio envelope, replaces the canonical orchestration function with a deterministic fixture, installs a counting `TemporalAnalyzer`, and requires exactly one orchestration call and zero CLI temporal calls. The predecessor calls the temporary analyzer, so it violates that contract.

Production `f3235e8b2dfd329ec35e3f6bb2b95d54b3b7fc73` removes the temporary `TemporalAnalyzer` import/block. Fresh review then found that this first repair also removed the pre-existing root logging configuration, which was not causally required and could reduce analysis diagnostics. Ordinary descendant `8ae19aa9d609e5a82654d8cf82602b238c15c3b7` restores `logging.basicConfig(level=INFO, ...)` while keeping the duplicate temporal pre-pass absent. The product delta is therefore limited to single-owner analysis dispatch; diagnostic logging semantics are preserved.

Exact-head CodeRabbit review then found four stale tests that still patched the deleted `cli.TemporalAnalyzer` symbol. Ordinary descendants `eef9461aed96125874d3a84b7016a886a96aeedc` and `4b64f571525d13a1629965d1252fb7bb6525eb6e` remove the obsolete pre-pass fixtures, keep the real progress pipeline on canonical orchestration, and rewrite the branch-coverage case to assert delegation to `run_analysis_job`. The dedicated single-owner regression intentionally uses `raising=False` to install a counting sentinel and prove that production CLI code never calls such an attribute.

RED and production descendants were consecutive ordinary commits, so this document does not claim a hosted RED failure. Hosted GREEN belongs only to the final exact #866 head after all current-head workflows complete.

## Security Notes

Untrusted local paths remain inside the already-established native/app-owned source and Python request boundaries. This repair does not add filesystem, subprocess, IPC, PID, model, or network authority. It removes an extra decoder/MIR invocation that ran before the canonical orchestration owner, reducing duplicate work inside the analysis process without claiming a whole-process CPU/RAM/GPU budget.

Restoring the existing INFO-level logging configuration does not authorize raw path/audio/payload logging; the repository privacy rules still apply. The duplicate pre-pass's explicit filename/BPM log statements are gone with that code path.

The change is not evidence that decoder/resampler peak RSS, model VRAM, cancellation latency, or Windows descendant containment are commercially bounded. Those acceptance items remain open and require rights-cleared full-length rehearsal audio plus platform-specific containment evidence.

## Acceptance

The product contract is now: one native analysis request -> one CLI dispatch -> one canonical analysis orchestration path. Existing CLI diagnostic configuration remains intact. Tests exercise supported orchestration behavior rather than patching the deleted pre-pass implementation. A future CLI-level preview or probe must be modeled as an explicit bounded domain operation with its own product status/resource contract rather than reintroducing a hidden pre-pass.
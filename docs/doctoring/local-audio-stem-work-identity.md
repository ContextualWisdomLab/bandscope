# Local-audio stem-work identity

## Problem

BandScope can admit two analysis jobs concurrently. Native Resource Admission already carries the verified SHA-256 of the app-owned local-audio publication into the Python child, and persisted analysis/feature-cache lookup is scoped below that source digest. The temporary stem-separation handoff, however, was still derived from `projectId`, `sourcePath`, `fileName`, and `fileSizeBytes` under the unscoped `tempRoot`.

Two different publications with the same metadata could therefore nominate the same temporary stem-work location. After source-digest scoping was added, two concurrently admitted jobs for the *same* verified publication could still share that location. `_stem_separation_worker` writes the NPZ there, and the parent subsequently creates a sidecar and re-admits those files. This is mutable intermediate analysis state, so sharing it across jobs is not acceptable rehearsal evidence.

A separate lifecycle defect followed from that handoff: the worker NPZ remained below the job temp root after a normally completed CLI analysis. Source/job scoping prevents cross-job contamination but, without cleanup, turns each run into a new accumulation point.

## Constraints

- `sourceContentSha256` remains native-owned Resource Admission evidence. Renderer JSON cannot author it.
- Persisted caches may share one exact source namespace because they are reusable artifacts and are separately re-admitted before use.
- Temporary stem-work artifacts are per-analysis execution state and require job isolation even when two jobs analyze the same verified source.
- The CLI `jobId` is an external string at the Python boundary and must not become a raw filesystem segment.
- Normal cleanup may remove only the derived job namespace. A generic caller-provided `tempRoot` must not acquire recursive deletion authority.
- Project Persistence owns durable `sourceReference/contentSha256`; this change does not copy its aggregate or storage schema.

## Decision

The Python child scopes `cacheRoot` to `source-sha256-v1/<verified-source-digest>` and scopes `tempRoot` first to the same verified source digest and then, when a job identity is available, to `job-sha256-v1/<sha256(jobId)>`.

Hashing the job identity keeps caller-controlled text out of path segments while providing a deterministic execution namespace. Native BandScope jobs already mint distinct job ids, so two admitted concurrent jobs for the same publication no longer resolve their temporary stem-work artifacts to one shared execution directory. Standalone local CLI callers without native source identity continue to have persisted cache reuse disabled; when they supply a job id, their temporary work is still job-scoped.

The CLI now performs best-effort cleanup in a `finally` block after normal orchestration returns or raises. Cleanup activates only when `tempRoot` ends in the derived `job-sha256-v1/<64-lowercase-hex>` shape; an unscoped generic `tempRoot` is ignored. This removes ordinary completed-run stem-work accumulation without turning an arbitrary caller root into a recursive-delete target.

The source digest remains an identity/integrity binding only. It is not an authenticity claim, signature, MAC, FIPS-module validation claim, or proof that persisted metadata and NPZ bytes form one crash-atomic generation.

## Rejected alternatives

Using only `fileName`, `sourcePath`, size, project id, timestamps, or their hash was rejected because equal metadata does not establish equal audio content. Source-digest-only temporary paths were rejected because BandScope permits two in-flight jobs, and same-source executions would still share mutable NPZ/sidecar work. Using raw `jobId` as a path component was rejected because the CLI boundary treats it as untrusted text. Serializing all analysis to one job was rejected because it would weaken an existing product concurrency capability rather than make mutable work ownership explicit.

Recursively deleting the original caller `tempRoot` was rejected because validation of a usable temporary directory is not deletion authority over all of its contents. Normal cleanup is therefore limited to the derived hashed job namespace.

## Risk and effect

This removes cross-source and same-source concurrent sharing of the Python stem-work directory reached through the native analysis child and removes the derived namespace after ordinary CLI completion. It does not make worker publication crash-atomic, guarantee cleanup when the Python process is forcibly terminated before `finally`, prove resistance to an external process mutating the temp tree during cleanup, or replace the remaining versioned immutable feature-cache manifest that must bind one bounded metadata snapshot, one private NPZ replay snapshot, and the verified source digest.

The next persistence step remains that immutable manifest/generation. The next process-containment step remains race-free Windows Job Object ownership, followed by rights-cleared full-length real-audio measurement of cancellation latency, inherited handle/pipe return, abnormal child temp cleanup, peak RSS/VRAM, CPU/GPU budgets, and MIR reproducibility.

## RED → production trace

- `b8e55628d9cc35c210741ffbc6934cb415822a4b`: regression requires verified source identity to scope temporary work as well as persisted cache lookup.
- `a7f2af8718b5c6c3398f65dfbd31ee7484f31464`: production scopes `tempRoot` below the verified source digest.
- `2c0e4633bf9bea929f74551d1d97fd6ae0e35063`: regression requires two concurrent jobs for one verified source to receive distinct temporary namespaces.
- `5d9e2fe23bdb2602c4446f11a0de1f9d32b9184b`: production hashes the job id into a job-specific temporary namespace and passes the already-validated job identity into the binding step.
- `adeb7afa8952fee242be4d44c34b316f1dd1263d`: regression requires normal cleanup to remove only the derived job namespace and preserve an unscoped caller root.
- `f870cbf273124ecf70cea267dcc2f5f69abc4174`: production runs job-namespace cleanup from the CLI `finally` path.

Hosted RED or GREEN is not inferred from commit order. Exact-head workflow evidence remains authoritative.

## TRACEABILITY

| Decision / invariant | Repository evidence | External basis |
| --- | --- | --- |
| Different verified source bytes must not share temporary stem work | `test_cli_source_identity_temp_scope.py`; `cli._bind_verified_source_cache_namespace` | NIST FIPS 180-4 defines SHA-256 message digests for detecting message changes. |
| Concurrent executions must not share mutable intermediate stem artifacts | same regression plus native `MAX_IN_FLIGHT_JOBS = 2` | CWE-362 describes race conditions when concurrent code lacks exclusive access to a shared resource and recommends minimizing shared resources or synchronizing access. |
| Caller job text is not a filesystem path segment | SHA-256 of `jobId` before `job-sha256-v1` path construction | Resource/path authority remains an application-owned derived identifier, not raw external text. |
| Normal cleanup is limited to derived job namespace | `_cleanup_job_temp_namespace`; cleanup regressions | Least-authority boundary: caller temp-root admission is not blanket recursive-delete authority. |
| Persisted cache atomic generation remains open | #866 claim boundary and feature-cache admission doctoring | Digest namespace isolation does not replace atomic publication or bind independent metadata/NPZ objects into one generation. |

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (FIPS PUB 180-4). U.S. Department of Commerce. https://doi.org/10.6028/NIST.FIPS.180-4

MITRE. (2026). *CWE-362: Concurrent execution using shared resource with improper synchronization (race condition)* (CWE 4.20). Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/362.html

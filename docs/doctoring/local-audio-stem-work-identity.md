# Local-audio stem-work identity

## Problem

BandScope can admit two analysis jobs concurrently. Native Resource Admission already carries the verified SHA-256 of the app-owned local-audio publication into the Python child, and persisted analysis/feature-cache lookup is scoped below that source digest. The temporary stem-separation handoff, however, was still derived from `projectId`, `sourcePath`, `fileName`, and `fileSizeBytes` under the unscoped `tempRoot`.

Two different publications with the same metadata could therefore nominate the same temporary stem-work location. After source-digest scoping was added, two concurrently admitted jobs for the *same* verified publication could still share that location. `_stem_separation_worker` writes the NPZ there, and the parent subsequently creates a sidecar and re-admits those files. This is mutable intermediate analysis state, so sharing it across jobs is not acceptable rehearsal evidence.

A separate lifecycle defect followed from that handoff: the worker NPZ remained below the job temp root after a normally completed CLI analysis. Source/job scoping prevents cross-job contamination but, without cleanup, turns each run into a new accumulation point.

The first cleanup implementation then admitted recursive deletion from the lexical suffix `job-sha256-v1/<64-lowercase-hex>` alone. That shape check does not prove the generated parent components still identify the app-owned namespace. If `source-sha256-v1/<source-digest>` or `job-sha256-v1` is replaced by a directory symlink, `shutil.rmtree()` can resolve the path through that parent and delete a matching job directory outside the intended stem-work tree. The cache/temp tree is untrusted after crashes or local mutation, so cleanup must fail closed rather than turn a derived identifier into ambient recursive-delete authority.

## Constraints

- `sourceContentSha256` remains native-owned Resource Admission evidence. Renderer JSON cannot author it.
- Persisted caches may share one exact source namespace because they are reusable artifacts and are separately re-admitted before use.
- Temporary stem-work artifacts are per-analysis execution state and require job isolation even when two jobs analyze the same verified source.
- The CLI `jobId` is an external string at the Python boundary and must not become a raw filesystem segment.
- Normal cleanup may remove only the derived job namespace. A generic caller-provided `tempRoot` must not acquire recursive deletion authority.
- A cleanup target must be absolute, preserve the expected derived digest vocabulary, and have no symlink in the generated namespace components inspected before deletion.
- Recursive cleanup is permitted only where Python reports a symlink-attack-resistant `shutil.rmtree` implementation. A safe leak is preferable to deleting outside the owned namespace.
- Project Persistence owns durable `sourceReference/contentSha256`; this change does not copy its aggregate or storage schema.

## Decision

The Python child scopes `cacheRoot` to `source-sha256-v1/<verified-source-digest>` and scopes `tempRoot` first to the same verified source digest and then, when a job identity is available, to `job-sha256-v1/<sha256(jobId)>`.

Hashing the job identity keeps caller-controlled text out of path segments while providing a deterministic execution namespace. Native BandScope jobs already mint distinct job ids, so two admitted concurrent jobs for the same publication no longer resolve their temporary stem-work artifacts to one shared execution directory. Standalone local CLI callers without native source identity continue to have persisted cache reuse disabled; when they supply a job id, their temporary work is still job-scoped.

The CLI performs best-effort cleanup in a `finally` block after normal orchestration returns or raises. Cleanup activates only for an absolute `tempRoot` ending in the derived `job-sha256-v1/<64-lowercase-hex>` shape. When the source-digest namespace is present, its digest must also remain canonical. Before recursive deletion, the generated `source-sha256-v1`, source-digest, and `job-sha256-v1` components that are present in the derived path must not be symlinks. Cleanup also requires `shutil.rmtree.avoids_symlink_attacks` to be true; otherwise the artifact is left for a later app-owned cleanup path instead of using a platform implementation that Python documents as susceptible to symlink attacks.

The source digest remains an identity/integrity binding only. It is not an authenticity claim, signature, MAC, FIPS-module validation claim, or proof that persisted metadata and NPZ bytes form one crash-atomic generation.

## Rejected alternatives

Using only `fileName`, `sourcePath`, size, project id, timestamps, or their hash was rejected because equal metadata does not establish equal audio content. Source-digest-only temporary paths were rejected because BandScope permits two in-flight jobs, and same-source executions would still share mutable NPZ/sidecar work. Using raw `jobId` as a path component was rejected because the CLI boundary treats it as untrusted text. Serializing all analysis to one job was rejected because it would weaken an existing product concurrency capability rather than make mutable work ownership explicit.

Recursively deleting the original caller `tempRoot` was rejected because validation of a usable temporary directory is not deletion authority over all of its contents. Lexical suffix validation alone was also rejected: a parent symlink can preserve the expected suffix while resolving to an unintended directory. Calling `Path.resolve()` and then deleting the resolved target was rejected because following a substituted link would convert the attacker-selected destination into deletion authority instead of rejecting the substitution. Finally, using `shutil.rmtree()` when `avoids_symlink_attacks` is false was rejected; Python explicitly documents those implementations as susceptible to symlink attacks.

## Security Notes

The untrusted inputs are the validated request roots plus any cache/temp filesystem state that may have changed after a crash or through local mutation. The deletion trust boundary is narrower than ordinary path admission: BandScope must establish a derived absolute job namespace and reject link substitution in the generated components before recursive deletion. No raw user path, source label, project id, or job id is logged or used as a delete selector.

The executable regression constructs an outside directory containing `job-sha256-v1/<digest>`, substitutes the expected source-digest parent with a directory symlink, invokes cleanup, and requires the outside sentinel to survive. Separate regressions cover verified and unverified normal cleanup, relative/unscoped/malformed roots, malformed source-digest structure, and a runtime whose `rmtree` implementation does not advertise symlink-attack resistance.

This does not prove cleanup after process kill, OS crash, or every adversarial concurrent directory rename. It also does not replace the Windows Job Object containment requirement. Those remain explicit operational gaps rather than being inferred from Python `finally` cleanup.

## Risk and effect

Source/job namespace isolation removes cross-source and same-source concurrent sharing of the Python stem-work directory reached through the native analysis child. Normal CLI completion now removes only an admitted derived job namespace, and a pre-existing symlink in the generated namespace no longer authorizes deletion outside that tree. On a platform where Python cannot provide symlink-attack-resistant recursive deletion, BandScope leaves the derived work behind instead of performing unsafe cleanup.

This does not make worker publication crash-atomic, guarantee cleanup when the Python process is forcibly terminated before `finally`, prove resistance to every external rename race, or replace the remaining versioned immutable feature-cache manifest that must bind one bounded metadata snapshot, one private NPZ replay snapshot, and the verified source digest.

The next persistence step remains that immutable manifest/generation. The next process-containment step remains race-free Windows Job Object ownership, followed by rights-cleared full-length real-audio measurement of cancellation latency, inherited handle/pipe return, abnormal child temp cleanup, peak RSS/VRAM, CPU/GPU budgets, and MIR reproducibility.

## RED → production trace

- `b8e55628d9cc35c210741ffbc6934cb415822a4b`: regression requires verified source identity to scope temporary work as well as persisted cache lookup.
- `a7f2af8718b5c6c3398f65dfbd31ee7484f31464`: production scopes `tempRoot` below the verified source digest.
- `2c0e4633bf9bea929f74551d1d97fd6ae0e35063`: regression requires two concurrent jobs for one verified source to receive distinct temporary namespaces.
- `5d9e2fe23bdb2602c4446f11a0de1f9d32b9184b`: production hashes the job id into a job-specific temporary namespace and passes the already-validated job identity into the binding step.
- `adeb7afa8952fee242be4d44c34b316f1dd1263d`: regression requires normal cleanup to remove only the derived job namespace and preserve an unscoped caller root.
- `f870cbf273124ecf70cea267dcc2f5f69abc4174`: production runs job-namespace cleanup from the CLI `finally` path.
- `8f23455d4a99ed7d2f08460e21e6bbcda35adbf6`: RED substitutes the verified-source namespace with a directory symlink and requires cleanup not to delete the outside job directory reached through it.
- `8ac2733df64a55d8e506f0aa74f830fbd7e7cf51`: production requires an absolute canonical derived namespace, rejects symlinked generated parents, and refuses recursive cleanup where Python does not advertise symlink-attack resistance.
- `7b832775d14353eb13d223df9b09d9a5ae5be14a`: edge regressions cover unverified normal cleanup, unsafe-rmtree fail closed, and malformed/relative deletion scopes.

Hosted RED or GREEN is not inferred from commit order. Exact-head workflow evidence remains authoritative.

## TRACEABILITY

| Decision / invariant | Repository evidence | External basis |
| --- | --- | --- |
| Different verified source bytes must not share temporary stem work | `test_cli_source_identity_temp_scope.py`; `cli._bind_verified_source_cache_namespace` | NIST FIPS 180-4 defines SHA-256 message digests for detecting message changes. |
| Concurrent executions must not share mutable intermediate stem artifacts | same regression plus native `MAX_IN_FLIGHT_JOBS = 2` | CWE-362 describes race conditions when concurrent code lacks exclusive access to a shared resource and recommends minimizing shared resources or synchronizing access. |
| Caller job text is not a filesystem path segment | SHA-256 of `jobId` before `job-sha256-v1` path construction | Resource/path authority remains an application-owned derived identifier, not raw external text. |
| Recursive cleanup must not follow a substituted generated parent | `_cleanup_job_temp_namespace`; symlink-substitution regression | CWE-59 describes file operations whose names resolve through links to unintended resources. Python documents that only some `rmtree` implementations are symlink-attack resistant and exposes `rmtree.avoids_symlink_attacks` to distinguish them. |
| Normal cleanup is limited to derived job namespace | `_cleanup_job_temp_namespace`; cleanup regressions | Least-authority boundary: caller temp-root admission is not blanket recursive-delete authority. |
| Persisted cache atomic generation remains open | #866 claim boundary and feature-cache admission doctoring | Digest namespace isolation does not replace atomic publication or bind independent metadata/NPZ objects into one generation. |

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (FIPS PUB 180-4). U.S. Department of Commerce. https://doi.org/10.6028/NIST.FIPS.180-4

MITRE. (2026). *CWE-59: Improper link resolution before file access ('link following')* (CWE 4.20). Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/59.html

MITRE. (2026). *CWE-362: Concurrent execution using shared resource with improper synchronization (race condition)* (CWE 4.20). Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/362.html

Python Software Foundation. (2026). *shutil — High-level file operations* (Python 3.12.14 documentation). https://docs.python.org/3.12/library/shutil.html

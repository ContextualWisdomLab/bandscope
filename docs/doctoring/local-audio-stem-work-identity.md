# Local-audio stem-work identity

## Problem

BandScope can admit two analysis jobs concurrently. Native Resource Admission already carries the verified SHA-256 of the app-owned local-audio publication into the Python child, and persisted analysis/feature-cache lookup is scoped below that source digest. The temporary stem-separation handoff, however, was still derived from `projectId`, `sourcePath`, `fileName`, and `fileSizeBytes` under the unscoped `tempRoot`.

Two different publications with the same metadata could therefore nominate the same temporary stem-work location. After source-digest scoping was added, two concurrently admitted jobs for the *same* verified publication could still share that location. `_stem_separation_worker` writes the NPZ there, and the parent subsequently creates a sidecar and re-admits those files. This is mutable intermediate analysis state, so sharing it across jobs is not acceptable rehearsal evidence.

A separate lifecycle defect followed from that handoff: the worker NPZ remained below the job temp root after a normally completed CLI analysis. Source/job scoping prevents cross-job contamination but, without cleanup, turns each run into a new accumulation point.

The first cleanup implementation admitted recursive deletion from the lexical suffix `job-sha256-v1/<64-lowercase-hex>` alone. That shape check does not prove the generated parent components still identify the app-owned namespace. If `source-sha256-v1/<source-digest>` or `job-sha256-v1` is replaced by a directory symlink, `shutil.rmtree()` can resolve the path through that parent and delete a matching job directory outside the intended stem-work tree. The cache/temp tree is untrusted after crashes or local mutation, so cleanup must fail closed rather than turn a derived identifier into ambient recursive-delete authority.

The next repair added pre-delete symlink checks for the generated parents and the caller-selected base `tempRoot`. That blocks a pre-existing link, but it is still a time-of-check/time-of-use boundary: a local actor can replace the checked base or generated parent after `Path.is_symlink()` returns and before pathname-based `shutil.rmtree(path)` resolves the target. A symlink-resistant `rmtree` protects entries below the directory it opens; it does not retroactively bind earlier pathname components to the objects that were checked.

## Constraints

- `sourceContentSha256` remains native-owned Resource Admission evidence. Renderer JSON cannot author it.
- Persisted caches may share one exact source namespace because they are reusable artifacts and are separately re-admitted before use.
- Temporary stem-work artifacts are per-analysis execution state and require job isolation even when two jobs analyze the same verified source.
- The CLI `jobId` is an external string at the Python boundary and must not become a raw filesystem segment.
- Normal cleanup may remove only the derived job namespace. A generic caller-provided `tempRoot` must not acquire recursive deletion authority.
- A cleanup target must be absolute and preserve the expected derived digest vocabulary.
- Recursive cleanup is permitted only where Python reports a symlink-attack-resistant `shutil.rmtree` implementation *and* descriptor-relative `os.open(..., dir_fd=...)`, `O_DIRECTORY`, and `O_NOFOLLOW` are available. A safe leak is preferable to resolving deletion through mutable pathnames.
- Each ancestor from the filesystem anchor to the immediate `job-sha256-v1` parent must be opened relative to the previously opened directory descriptor without following symbolic links. The recursive delete is then issued for the final digest name relative to that anchored parent descriptor.
- Project Persistence owns durable `sourceReference/contentSha256`; this change does not copy its aggregate or storage schema.

## Decision

The Python child scopes `cacheRoot` to `source-sha256-v1/<verified-source-digest>` and scopes `tempRoot` first to the same verified source digest and then, when a job identity is available, to `job-sha256-v1/<sha256(jobId)>`.

Hashing the job identity keeps caller-controlled text out of path segments while providing a deterministic execution namespace. Native BandScope jobs already mint distinct job ids, so two admitted concurrent jobs for the same publication no longer resolve their temporary stem-work artifacts to one shared execution directory. Standalone local CLI callers without native source identity continue to have persisted cache reuse disabled; when they supply a job id, their temporary work is still job-scoped.

The CLI performs best-effort cleanup in a `finally` block after normal orchestration returns or raises. Cleanup activates only for an absolute `tempRoot` ending in the derived `job-sha256-v1/<64-lowercase-hex>` shape. When the source-digest namespace is present, its digest must also remain canonical. Existing lexical symlink checks remain as an early fail-closed filter, but they are no longer the deletion authority.

On a supported Unix runtime, `_open_anchored_directory_chain()` opens the filesystem anchor and each subsequent parent component with `os.open()` relative to the previously opened descriptor, using `O_DIRECTORY | O_NOFOLLOW` plus close-on-exec where available. `_cleanup_job_temp_namespace()` then calls `shutil.rmtree()` with only the final job digest name and `dir_fd` set to the already-open `job-sha256-v1` parent. If a component becomes a symlink before its descriptor-relative open, admission fails. If an already-open ancestor is renamed afterwards, subsequent resolution continues through the descriptor rather than the replacement pathname. If the platform cannot provide the required descriptor semantics, cleanup is skipped.

The source digest remains an identity/integrity binding only. It is not an authenticity claim, signature, MAC, FIPS-module validation claim, or proof that persisted metadata and NPZ bytes form one crash-atomic generation.

## Rejected alternatives

Using only `fileName`, `sourcePath`, size, project id, timestamps, or their hash was rejected because equal metadata does not establish equal audio content. Source-digest-only temporary paths were rejected because BandScope permits two in-flight jobs, and same-source executions would still share mutable NPZ/sidecar work. Using raw `jobId` as a path component was rejected because the CLI boundary treats it as untrusted text. Serializing all analysis to one job was rejected because it would weaken an existing product concurrency capability rather than make mutable work ownership explicit.

Recursively deleting the original caller `tempRoot` was rejected because validation of a usable temporary directory is not deletion authority over all of its contents. Lexical suffix validation alone was rejected because a parent symlink can preserve the expected suffix while resolving to an unintended directory. Checking the base and generated parents immediately before deletion was also rejected as the *final* authority because a concurrent replacement can occur after the check. Calling `Path.resolve()` and then deleting the resolved target was rejected because following a substituted link would convert the attacker-selected destination into deletion authority instead of rejecting the substitution.

A single absolute `os.open(path.parent, O_NOFOLLOW)` was not selected because `O_NOFOLLOW` constrains the final pathname component and does not independently bind every ancestor. The chosen chain opens each component relative to the prior directory descriptor. Using `shutil.rmtree()` when `avoids_symlink_attacks` is false, or using descriptor-relative opens where `os.supports_dir_fd` does not include `os.open`, is rejected; the work is left for a later app-owned cleanup path instead.

## Security Notes

The untrusted inputs are the validated request roots plus cache/temp filesystem state that may change after a crash or through local mutation. The deletion trust boundary is narrower than ordinary path admission: BandScope must establish a derived absolute job namespace, reject malformed source/job digests, and bind the parent chain by descriptors before recursive deletion. No raw user path, source label, project id, or job id is logged or used as the final delete selector.

The race regression constructs an intended temp tree and a separate outside tree with the same `job-sha256-v1/<digest>` suffix. It replaces the caller-selected base with a symlink *after* the lexical check reports it as a normal directory. Pathname-only cleanup would then resolve into the outside tree. Descriptor-anchored cleanup must leave the outside sentinel untouched. Separate regressions cover pre-existing verified/unverified base or generated-parent symlinks, runtimes without `dir_fd`, unsafe `rmtree`, absolute spellings containing `..`, malformed digests, and normal verified/unverified cleanup.

This change materially narrows the CWE-367/CWE-59 window on supported Unix platforms. It does not prove cleanup after process kill, OS crash, hostile mount/bind-mount replacement, filesystem semantics that violate the descriptor assumptions, or Windows cleanup where Python documents `dir_fd` as unavailable. It also does not replace Windows Job Object ownership for subprocess containment.

## Risk and effect

Source/job namespace isolation removes cross-source and same-source concurrent sharing of the Python stem-work directory reached through the native analysis child. Normal CLI completion removes only an admitted derived job namespace. Pre-existing link substitution is rejected, and a base/ancestor replacement after the lexical check no longer causes the recursive delete to resolve through that replacement on supported descriptor-capable Unix runtimes.

The fail-closed tradeoff is deliberate: unsupported platforms or ambiguous filesystem state can leave temporary work behind. BandScope should reclaim such leftovers only through a separately admitted app-owned recovery path rather than broadening runtime deletion authority.

This does not make worker publication crash-atomic, guarantee cleanup when the Python process is forcibly terminated before `finally`, or replace the remaining versioned immutable feature-cache manifest that must bind one bounded metadata snapshot, one private NPZ replay snapshot, and the verified source digest.

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
- `8adc4546667a7a701d5d260b998be60068fe2bc3`: RED uses a symlink as the caller-selected base `tempRoot` and requires the outside job sentinel to survive cleanup.
- `880e4b8c0b521270d886cef9198f9a6a313a4099`: production includes the lexical base `tempRoot` in the pre-delete symlink checks for source-verified and unverified job shapes.
- `a7d7056157a640c0b6c5487c23613c14e2a7658d`: edge regression proves the same fail-closed behavior for a source-verified job below a symlinked base root.
- `3c0cec3f9fceef879806d4f3003563136149da36`: initial parent-swap regression draft; it was test-only but missed the `shutil` import and is not acceptance evidence.
- `911957dcd8c10c5cae00d4cb3a17e55388c094c7`: corrected RED source swaps the base after the lexical link check and requires the outside sentinel to survive.
- `1c8ea0cdaf58b75ae3e35f446b337b124a41d109`: production opens the cleanup parent chain with descriptor-relative no-follow directory opens and deletes only the final job name relative to the anchored parent.
- `de6d88c07e7302d893124185137db43a9ebea9c0`: edge coverage adds unsupported-`dir_fd` and `..`-spelling fail-closed cases.
- `50ae703e932580a48ef821c9dfb0572e5a7498d0`: production refinement keeps descriptor close/error handling coverage-complete without weakening the fail-closed boundary.

Hosted RED is not claimed because production descendants were pushed before an exact corrected-RED workflow failure was established. Exact-head workflow evidence remains authoritative.

## TRACEABILITY

| Decision / invariant | Repository evidence | External basis |
| --- | --- | --- |
| Different verified source bytes must not share temporary stem work | `test_cli_source_identity_temp_scope.py`; `cli._bind_verified_source_cache_namespace` | NIST FIPS 180-4 defines SHA-256 message digests for detecting message changes. |
| Concurrent executions must not share mutable intermediate stem artifacts | same regression plus native `MAX_IN_FLIGHT_JOBS = 2` | CWE-362 describes race conditions when concurrent code lacks exclusive access to a shared resource and recommends minimizing shared resources or synchronizing access. |
| Caller job text is not a filesystem path segment | SHA-256 of `jobId` before `job-sha256-v1` path construction | Resource/path authority remains an application-owned derived identifier, not raw external text. |
| Recursive cleanup must not follow a substituted base or generated parent | `_cleanup_job_temp_namespace`; static symlink and parent-swap regressions | CWE-59 describes file operations whose names resolve through links to unintended resources. CWE-367 describes invalidation when resource state changes between check and use. |
| Parent identity is bound during cleanup rather than re-resolved from one mutable pathname | `_open_anchored_directory_chain`; `shutil.rmtree(..., dir_fd=...)` | Python 3.12 documents `os.open(..., dir_fd=...)`, `os.supports_dir_fd`, `O_DIRECTORY`, and `O_NOFOLLOW`; `dir_fd` support is Unix-only. |
| Normal cleanup is limited to the derived job namespace | `_cleanup_job_temp_namespace`; cleanup regressions | Least-authority boundary: caller temp-root admission is not blanket recursive-delete authority. |
| Persisted cache atomic generation remains open | #866 claim boundary and feature-cache admission doctoring | Digest namespace isolation does not replace atomic publication or bind independent metadata/NPZ objects into one generation. |

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (FIPS PUB 180-4). U.S. Department of Commerce. https://doi.org/10.6028/NIST.FIPS.180-4

MITRE. (2026). *CWE-59: Improper link resolution before file access ('link following')* (CWE 4.20). Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/59.html

MITRE. (2026). *CWE-362: Concurrent execution using shared resource with improper synchronization (race condition)* (CWE 4.20). Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/362.html

MITRE. (2026). *CWE-367: Time-of-check time-of-use (TOCTOU) race condition* (CWE 4.20). Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/367.html

Python Software Foundation. (2026). *os — Miscellaneous operating system interfaces* (Python 3.12.14 documentation). https://docs.python.org/3.12/library/os.html

Python Software Foundation. (2026). *shutil — High-level file operations* (Python 3.12.14 documentation). https://docs.python.org/3.12/library/shutil.html

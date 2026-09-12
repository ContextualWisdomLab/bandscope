# Local-audio stem-work identity

## Problem

BandScope admits concurrent local-audio analysis jobs. Native Resource Admission owns the immutable app-local source publication and verified SHA-256 identity; Python persisted cache and mutable stem work must not infer identity from renderer paths, names, or sizes.

Retained #866 ancestry therefore scopes persisted cache below `source-sha256-v1/<verified-source-digest>` and mutable stem work below the source digest plus `job-sha256-v1/<sha256(jobId)>`. Normal CLI completion may clean only that derived job namespace.

The first cleanup implementation validated the lexical suffix and rejected pre-existing symlinks in the caller-selected base and generated source/job parents before calling pathname-based `shutil.rmtree(path)`. That was necessary but insufficient. A local filesystem actor could replace a checked ancestor after `Path.is_symlink()` returned and before `rmtree(path)` resolved it. A symlink-resistant `rmtree` protects traversal below the directory it opens; it does not bind every earlier pathname component to the object that was checked.

## Constraints

- `sourceContentSha256` remains native-owned Resource Admission evidence; renderer JSON cannot author it.
- Mutable stem work is per execution even when two jobs use the same verified source.
- Raw `jobId` is untrusted text and is never a filesystem segment.
- A validated `tempRoot` is not blanket recursive-delete authority.
- Cleanup may target only an absolute canonical `job-sha256-v1/<64-lowercase-hex>` namespace, optionally below canonical `source-sha256-v1/<source-digest>`.
- A safe temporary-file leak is preferable to deleting through ambiguous filesystem state.
- Project Persistence #970 remains the durable owner of `sourceReference/contentSha256`; this lane does not copy its aggregate or storage schema.

## Decision

`_cleanup_job_temp_namespace()` keeps the lexical shape and pre-existing-link checks as an early fail-closed filter, but deletion authority is descriptor anchored on supported Unix runtimes.

The context-managed `_open_anchored_directory()` opens the filesystem anchor and then every parent component relative to the previously opened directory descriptor with `os.open(..., dir_fd=...)`, `O_DIRECTORY`, and `O_NOFOLLOW`, plus `O_CLOEXEC` where available. All opened descriptors remain live only for the `with` scope and are deterministically closed in the context manager's `finally` block, including partial-open failure.

The caller then invokes `shutil.rmtree()` only for the final job-digest name with `dir_fd` set to the already-open `job-sha256-v1` parent. If an ancestor becomes a symlink before its descriptor-relative open, opening fails closed. If an already-open ancestor is renamed and its former pathname is replaced after the earlier lexical check, recursive deletion remains relative to the descriptor rather than resolving the replacement pathname.

Cleanup is skipped when Python does not advertise symlink-attack-resistant `rmtree`, when `os.open` lacks `dir_fd` support, or when `O_DIRECTORY` / `O_NOFOLLOW` are unavailable. This is intentional portability behavior, not a fallback to weaker pathname deletion.

## RED → production trace

- `b8e55628d9cc35c210741ffbc6934cb415822a4b` → `a7f2af8718b5c6c3398f65dfbd31ee7484f31464`: verified source digest scopes temporary stem work.
- `2c0e4633bf9bea929f74551d1d97fd6ae0e35063` → `5d9e2fe23bdb2602c4446f11a0de1f9d32b9184b`: concurrent jobs for one source receive different job-digest namespaces.
- `adeb7afa8952fee242be4d44c34b316f1dd1263d` → `f870cbf273124ecf70cea267dcc2f5f69abc4174`: normal completion cleans only the derived job namespace.
- `8f23455d4a99ed7d2f08460e21e6bbcda35adbf6` → `8ac2733df64a55d8e506f0aa74f830fbd7e7cf51`: generated-parent symlink substitution fails closed and unsafe `rmtree` runtimes do not delete.
- `8adc4546667a7a701d5d260b998be60068fe2bc3` → `880e4b8c0b521270d886cef9198f9a6a313a4099`: caller-selected base-root symlink substitution also fails closed; `a7d7056157a640c0b6c5487c23613c14e2a7658d` covers the source-verified form.
- `3c0cec3f9fceef879806d4f3003563136149da36`: initial parent-swap test draft omitted the `shutil` import and is not acceptance evidence.
- `911957dcd8c10c5cae00d4cb3a17e55388c094c7`: corrected RED source replaces the checked base after the lexical link check and requires the outside sentinel to survive.
- `1c8ea0cdaf58b75ae3e35f446b337b124a41d109`: production introduces descriptor-relative no-follow parent-chain opens and final-name `rmtree(..., dir_fd=...)`.
- `de6d88c07e7302d893124185137db43a9ebea9c0`: regression edges require fail-closed behavior when `dir_fd` is unavailable and for absolute spellings containing `..`.
- `50ae703e932580a48ef821c9dfb0572e5a7498d0`: production refinement keeps partial-open and descriptor-close branches coverage-complete.
- `45b6c3d7e6206dcb1dcf3e99cbf8b963f1579697`: current review repair makes descriptor lifetime explicit through a context manager after code-quality correctly flagged the raw-descriptor-return shape as not locally proving closure.

Hosted RED is not claimed because production descendants were pushed before an exact corrected-RED workflow failure was established. Exact-head workflow evidence remains authoritative.

## Security Notes

The untrusted boundary includes validated request roots plus cache/temp filesystem state that can change after a crash or local mutation. The parent-swap regression creates an intended temp tree and a separate outside tree with the same `job-sha256-v1/<digest>` suffix, then replaces the caller base after the lexical link check reports it as a normal directory. Descriptor-anchored cleanup must leave the outside sentinel untouched. Other tests cover normal verified/unverified cleanup, pre-existing generated/base symlinks, malformed source/job digests, unsupported `dir_fd`, unsafe `rmtree`, and `..` spellings.

This repair materially narrows CWE-59/CWE-367 exposure on descriptor-capable Unix filesystems. It does not prove cleanup after process kill or OS crash; hostile mount/bind-mount replacement; filesystem semantics outside the descriptor assumptions; Windows descriptor-relative cleanup, because Python documents `dir_fd` support as Unix-only; or Windows Job Object process-tree containment.

The fail-closed tradeoff is deliberate. Unsupported or ambiguous cleanup leaves temporary work for a separately admitted app-owned recovery path rather than broadening deletion authority.

## Persistence and scientific claim boundary

This cleanup work does not make the feature cache one crash-atomic generation. `.features.json` and `.features.npz` are still independent persisted objects. The next #866 persistence delta remains one versioned immutable manifest that binds the native verified source digest, one bounded metadata snapshot, and one private NPZ replay snapshot, and is published last as the commit marker. Missing, old, or unbound generations must be cache misses.

SHA-256 is used here as content identity/integrity evidence. It is not an authenticity claim, MAC, signature, FIPS-module validation claim, or proof that local cache state is tamper-proof.

After the immutable-manifest prerequisite, the next runtime gap is race-free Windows Job Object ownership. Rights-cleared full-length rehearsal audio must then establish cancellation latency, inherited pipe/handle return, abnormal-child temp cleanup, decoder/resampler/downstream peak RSS and VRAM, explicit per-job CPU/GPU budgets, and recognized MIR reproducibility metrics. Synthetic filesystem regressions are security/persistence evidence, not scientific MIR acceptance.

## TRACEABILITY

| Decision / invariant | Repository evidence | External basis |
| --- | --- | --- |
| Exact source bytes scope reusable cache and mutable stem work | `_bind_verified_source_cache_namespace`; source/job identity regressions | NIST FIPS 180-4 SHA-256 message digest |
| Concurrent jobs do not share mutable intermediate stem artifacts | job-digest namespace regression | CWE-362 shared-resource race guidance |
| Recursive cleanup cannot rely on a checked mutable pathname | parent-swap and static symlink regressions | CWE-59; CWE-367 |
| Parent identity remains bound through delete use | `_open_anchored_directory`; `_cleanup_job_temp_namespace`; context-managed descriptor lifetime | Python `os.open(..., dir_fd=...)`, `os.supports_dir_fd`, `O_DIRECTORY`, `O_NOFOLLOW`; `shutil.rmtree(..., dir_fd=...)` |
| Unsupported descriptor semantics fail closed | no-`dir_fd` and unsafe-`rmtree` regressions | Python documents platform-dependent `dir_fd` and symlink-resistant `rmtree` support |
| Persisted cache atomic generation remains open | #866 claim boundary and feature-cache doctoring | digest namespace isolation does not bind independent metadata/NPZ objects into one committed generation |

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (FIPS PUB 180-4). U.S. Department of Commerce. https://doi.org/10.6028/NIST.FIPS.180-4

MITRE. (2026). *CWE-59: Improper link resolution before file access ('link following')* (CWE 4.20). Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/59.html

MITRE. (2026). *CWE-362: Concurrent execution using shared resource with improper synchronization (race condition)* (CWE 4.20). Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/362.html

MITRE. (2026). *CWE-367: Time-of-check time-of-use (TOCTOU) race condition* (CWE 4.20). Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/367.html

Python Software Foundation. (2026). *os — Miscellaneous operating system interfaces* (Python 3.12.14 documentation). https://docs.python.org/3.12/library/os.html

Python Software Foundation. (2026). *shutil — High-level file operations* (Python 3.12.14 documentation). https://docs.python.org/3.12/library/shutil.html

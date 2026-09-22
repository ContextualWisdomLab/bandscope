# Feature-cache generation manifest

## Problem

BandScope persists reusable source-separation stems as a JSON sidecar plus an NPZ archive. Retained Resource Admission already bounds and re-admits both artifacts, and production cache reuse is scoped below a native-verified `source-sha256-v1/<digest>` namespace. Those controls did not prove that the metadata bytes accepted by the API and the private NPZ replay snapshot belonged to the same published generation. A crash or local replacement could leave individually valid artifacts from different generations, so field-by-field validation alone could still combine authority that was never published together.

The rehearsal decision boundary is stricter than ordinary cache correctness: persisted stems are optional acceleration state. Ambiguous or partial state must become a cache miss and recomputation, never rehearsal evidence.

## Constraints

- The native verified source SHA-256 remains the source-content identity authority. Project Persistence `sourceReference` / `contentSha256` semantics remain owned by #970; this change does not duplicate that schema.
- Production replay must continue to use the existing bounded metadata reader and the already-open, bounded private NPZ snapshot. Re-opening a pathname only to hash it would recreate a TOCTOU gap.
- Transient child-process stem handoff is not persisted cache reuse and therefore remains manifest-optional.
- Legacy/unbound persisted feature caches are not trusted for production replay. Missing, malformed, stale, or cross-source manifests become misses.
- SHA-256 establishes local content identity/integrity for this use. It is not an authenticity mechanism, signature, MAC, FIPS-module validation claim, or protection from an actor that can coherently rewrite every cache artifact.
- `Path.replace()` replaces the destination entry, but this implementation does not call file or directory `fsync`; therefore it does not claim power-loss durability. The claim is fail-closed generation consistency at replay, not durable-transaction equivalence.

## Decision

Feature-cache generation schema version 1 is a last-published commit marker with exactly four members:

```text
schemaVersion = 1
sourceSha256
metadataSha256
archiveSha256
```

The producer stages the JSON sidecar and NPZ archive first. It computes SHA-256 over those exact staged bytes, stages the manifest, replaces the archive and metadata, and replaces the manifest last. The production reader derives the nearest native-verified source identity from the cache namespace, admits the bounded duplicate-free manifest, and requires its `sourceSha256` to equal that namespace.

The first metadata read hashes the exact bytes read from its already-open regular-file descriptor and must match `metadataSha256` before JSON materialization. The archive owner applies that same expected metadata digest to its second-read sidecar, preventing two different metadata generations from jointly authorizing one replay. The NPZ pathname is opened once, admitted as a bounded regular file, copied exactly once to a private spooled snapshot, and that exact snapshot must match `archiveSha256` before ZIP/NPY preflight and NumPy materialization.

Production `run_analysis_job_updates()` requires this manifest for persisted feature-cache reuse. Transient worker handoff keeps the existing no-manifest path because it is not reusable persisted state.

## Rejected alternatives

**Pathname re-hash before use.** Rejected. Checking a path and later opening or loading it does not guarantee the same resource; MITRE CWE-367 explicitly describes state changes between check and use as TOCTOU. The archive digest therefore applies to the already-created private replay snapshot, not a separately reopened pathname.

**Metadata-only generation identifier.** Rejected. A generation token copied into JSON would not bind the NPZ bytes. The stem archive needs content binding to the same commit marker.

**First-wins or last-wins recovery for partial generations.** Rejected. Rehearsal cache state is optional; recomputation is safer than inventing conflict resolution for mismatched evidence.

**Copy Project Persistence source identity fields into feature-cache schema.** Rejected. #970 owns durable project identity. #866 consumes the native-verified source digest already present in its production cache namespace and leaves durable persistence schema ownership intact.

**Treat manifest-last replacement as a durable database transaction.** Rejected. `Path.replace()` provides destination replacement semantics, but this implementation does not prove file-system power-loss durability or directory-entry persistence. A future durability change would require explicit platform evidence and synchronization semantics rather than stronger wording here.

## RED → production evidence

RED `9385bcb21b18eda4c8204dafbacef1a981d254f6` added production-shaped regressions requiring a committed manifest, rejecting a missing manifest, rejecting post-publication metadata replacement, rejecting same-shape NPZ replacement, and rejecting a generation copied under another verified source namespace.

The hosted RED workflow did not reach pytest: `ci` run `34383495968`, job `102574118602`, failed at repository quickcheck because Ruff 0.15.5 reported formatting debt. The exact log included the new manifest regression plus inherited #866 files and protected-base `test_supply_chain_policy.py`; therefore this document does not claim a hosted causal RED assertion failure.

Production descendants add exact-descriptor metadata digest admission, exact-private-snapshot NPZ digest admission, versioned manifest parsing, nearest verified source-namespace binding, manifest-last publication, and production-only manifest enforcement. A follow-up preserved existing metadata-substitution test seams so the new optional digest arguments cannot invalidate those race regressions through test-double signature drift.

Exact-head GREEN is not claimed until the current descendant reaches the new pytest regressions. Protected-base `test_supply_chain_policy.py` formatting remains owned by #1176 and is not copied into this lane.

## Effects and residual risk

A committed generation can no longer replay when its manifest is missing, when metadata bytes differ from the committed digest, when the private NPZ replay snapshot differs from the committed digest, or when the same committed files are copied beneath another native-verified source digest. The manifest therefore closes the previously documented metadata/NPZ/source generation-binding gap for production feature-cache replay.

Residual boundaries remain:

- no authenticity or hostile full-cache rewrite resistance;
- no file/directory `fsync` power-loss durability proof;
- staging uses ordinary app-owned filesystem paths rather than an authenticated storage primitive;
- final rehearsal-result cache admission remains a separate persistence boundary and must not inherit this feature-cache claim automatically;
- Windows process-tree containment remains direct-child-only until the planned race-free Job Object owner is implemented;
- synthetic cache regressions are persistence-integrity evidence, not MIR/source-separation scientific acceptance.

## TRACEABILITY

- BandScope RED: `9385bcb21b18eda4c8204dafbacef1a981d254f6`, `services/analysis-engine/tests/test_feature_cache_generation_manifest.py`.
- Descriptor/snapshot digest admission: `services/analysis-engine/src/bandscope_analysis/feature_cache_admission.py`.
- Manifest contract: `services/analysis-engine/src/bandscope_analysis/feature_cache_generation.py`.
- Production publication/replay orchestration: `services/analysis-engine/src/bandscope_analysis/api.py`.
- Native verified source namespace: `services/analysis-engine/src/bandscope_analysis/cli.py` plus retained native source-identity ancestry in #866.
- Project Persistence source-reference owner: #970; semantic consumption only after protected ancestry.
- Protected-base Ruff repair owner: #1176.

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (FIPS PUB 180-4). U.S. Department of Commerce. https://doi.org/10.6028/NIST.FIPS.180-4

MITRE. (2026). *CWE-367: Time-of-check Time-of-use (TOCTOU) race condition* (CWE 4.20). https://cwe.mitre.org/data/definitions/367.html

Python Software Foundation. (2026). *pathlib — Object-oriented filesystem paths* (Python 3.14 documentation), `Path.replace()`. https://docs.python.org/3.14/library/pathlib.html

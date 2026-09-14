# Reusable feature-cache integrity and durability

## Scope

This note covers the derived local-audio feature cache written as a compressed NumPy stem archive plus a JSON manifest. It does not make the cache a Resource Admission authority and it does not make cached stems scientific ground truth. Native Resource Admission remains authoritative for the admitted source byte count and SHA-256; Project Persistence owns durable publication and cache reuse policy.

## Problem

The previous feature cache wrote `*.features.npz.tmp` and `*.features.json.tmp`, then renamed the arrays file and the metadata file. The manifest did not contain a digest of the exact NPZ bytes and did not carry the native admitted-audio identity. A valid-looking NPZ with the expected stem keys could therefore be substituted under an existing manifest and still be reused. The two pathname replacements also did not establish the same file-sync and directory-entry durability boundary already required for final rehearsal-result publication.

That state is acceptable only as disposable scratch data. It is not sufficient for a buyer-visible reusable cache and must not be cited as MIR reproducibility evidence.

## Decision

Feature-cache schema version 2 uses a manifest-last protocol:

1. Serialize the stem arrays to a unique same-directory stage.
2. Flush Python buffers and `fsync` the staged NPZ file.
3. Compute SHA-256 over the exact closed staged NPZ bytes.
4. Durably publish the NPZ using the existing Project Persistence platform publication owner.
5. Publish the JSON manifest last using the existing durable JSON cache publisher.
6. Reuse only when the manifest schema is current, the native admitted-audio identity agrees with the current scoped evidence when present, and SHA-256 of the current NPZ bytes matches `arraysSha256` before NumPy deserialization.

If NPZ publication succeeds but manifest publication fails, an older manifest cannot authorize the new arrays unless the bytes are exactly identical, because its digest must still match. A missing manifest is a cache miss. This is deliberate fail-closed behavior; the feature cache is derived and recomputable.

The implementation does not hash the source audio again. It consumes `admitted_audio_cache_identity()` supplied from the native Resource Admission handoff. The NPZ digest is a derived-artifact integrity binding, not a second source-identity authority.

## Alternatives rejected

- **Path/size-only reuse:** rejected because neither identifies the admitted source bytes nor the stem archive bytes.
- **Validate only NPZ member names and shapes:** rejected because a different valid archive can preserve those structural properties.
- **Write manifest first:** rejected because a crash can make a new manifest authorize absent or stale arrays.
- **Plain rename without pre-publication sync:** rejected because atomic pathname replacement alone does not prove that acknowledged cache bytes are durable after power loss.
- **Duplicate platform publication code in the analysis API:** rejected. The analysis API serializes derived stem data; the existing Project Persistence cache publication primitive remains the platform-specific durability owner.

## RED → repair evidence

- `1b433605444844a09eb018f1c9249ea552215fef` — executable RED for native source binding, exact NPZ-byte binding, arrays-before-manifest ordering, fail-closed array-publication failure, and schema advancement.
- `4530cd5e55929a90cba263f2a81485dab3cdc687` — schema v2, source evidence consumption, exact NPZ SHA-256 admission, unique staged NPZ, staged-file `fsync`, existing durable publication owner reuse, and manifest-last adoption. The same integrity envelope is applied to file-backed stem process handoff before the arrays are trusted by downstream analysis.

Hosted exact-head checks remain authoritative. These commits are source evidence, not release evidence.

## Security Notes

- Cache JSON and NPZ files are treated as untrusted local bytes. A well-formed archive is not trusted merely because it is inside an app-owned cache directory.
- The source audio is not copied into metadata and full source paths are not added to the feature manifest.
- A malformed or partial native admitted-audio evidence pair fails closed rather than silently falling back to pathname identity.
- NPZ loading keeps `allow_pickle=False` and occurs only after the exact archive digest agrees with the manifest.
- Publication failure is a cache miss. It does not block the successful analysis result and does not promote partially published cache state to authority.
- The schema bump intentionally invalidates pre-v2 feature manifests rather than reinterpreting them under stronger semantics.

## Remaining scientific/release boundary

The integrity repair does **not** yet bind feature reuse to a complete MIR implementation/model identity. `AudioStemSeparator` currently names canonical `htdemucs` and verifies the local checkpoint against the checksum prefix encoded by `955717e8-8726e21a.th`, but release bundling, full checkpoint digest/signature provenance, model rights, and a versioned analysis/model generation contract remain separate work. Until those are bound into the reproducibility contract and validated on rights-cleared real decoded audio, a feature-cache hit is an integrity-preserving optimization, not evidence that two BandScope releases implement the same scientific analysis.

Packaged Windows/macOS power-loss, disk-full, and fault-injection acceptance also remains release evidence. Unit/integration tests cannot substitute for that destructive packaged-build evidence.

## Primary implementation references

Python Software Foundation. (2026). *os — Miscellaneous operating system interfaces: `os.fsync`*. Python 3 documentation. https://docs.python.org/3/library/os.html#os.fsync

Microsoft. (2024). *MoveFileExW function (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/windows/win32/api/winbase/nf-winbase-movefileexw

NumPy Developers. (2026). *Input and output: NumPy binary files (`npz`)*. NumPy reference. https://numpy.org/doc/stable/reference/routines.io.html

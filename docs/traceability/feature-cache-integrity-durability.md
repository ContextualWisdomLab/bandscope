# Reusable feature-cache integrity, durability, and admission

## Scope

This note covers the derived local-audio feature cache written as a compressed NumPy stem archive plus a JSON manifest. It does not make the cache a Resource Admission authority and it does not make cached stems scientific ground truth. Native Resource Admission remains authoritative for the admitted source byte count and SHA-256; Project Persistence owns durable publication and cache reuse policy.

## Problem

The earlier feature cache wrote `*.features.npz.tmp` and `*.features.json.tmp`, then renamed the arrays file and the metadata file. The manifest did not contain a digest of the exact NPZ bytes and did not carry the native admitted-audio identity. A valid-looking NPZ with the expected stem keys could therefore be substituted under an existing manifest and still be reused. The two pathname replacements also did not establish the same file-sync and directory-entry durability boundary already required for final rehearsal-result publication.

The integrity repair then exposed a second boundary: locally replaceable cache artifacts were still admitted through unbounded `json.load`, an unbounded NPZ digest pass, and NumPy allocation after only structural member-name checks. Python JSON decoding also permits duplicate object names unless the caller rejects them. A malicious or corrupted cache could therefore turn a disposable optimization into excessive read/parse/allocation work or ambiguous last-key-wins metadata.

That state is acceptable only as disposable scratch data. It is not sufficient for a buyer-visible reusable cache and must not be cited as MIR reproducibility evidence.

## Decision

Feature-cache schema version 2 uses a manifest-last protocol:

1. Serialize the stem arrays to a unique same-directory stage.
2. Flush Python buffers and `fsync` the staged NPZ file.
3. Compute SHA-256 over the exact closed staged NPZ bytes.
4. Durably publish the NPZ using the existing Project Persistence platform publication owner.
5. Publish the JSON manifest last using the existing durable JSON cache publisher.
6. Reuse only when the manifest schema is current, the native admitted-audio identity agrees with the current scoped evidence when present, and SHA-256 of the current NPZ bytes matches `arraysSha256` before NumPy deserialization.

Admission is additionally resource-bounded and fail closed:

- the JSON manifest must be one regular file of at most 64 KiB and is decoded with duplicate-object-key rejection;
- the encoded NPZ must be one regular file and is rejected before hashing when it exceeds four source-policy decoded-audio budgets plus a 16 MiB archive-overhead allowance;
- a feature cache may name at most four unique stems, matching the canonical local `htdemucs` stem cardinality;
- ZIP members must exactly match the declared stem set and each NPY member is header-preflighted before `np.load` so a small archive cannot declare an oversized allocation;
- declared per-stem bytes may not exceed one source-policy decoded-audio budget and total declared stem bytes may not exceed four budgets;
- loaded stems must remain one-dimensional, non-empty, floating-point, finite, and within the same per-stem bound;
- schema-v2 `stemRoleTypes` must cover exactly the admitted stem keys.

Manifest and archive descriptors are opened read-only with close-on-exec and `O_NOFOLLOW` where the host exposes it, then checked with `fstat`. The archive SHA-256, ZIP preflight, and NumPy load operate on the same opened descriptor rather than reopening the mutable pathname between checks.

If NPZ publication succeeds but manifest publication fails, an older manifest cannot authorize the new arrays unless the bytes are exactly identical, because its digest must still match. A missing or rejected manifest is a cache miss. This is deliberate fail-closed behavior; the feature cache is derived and recomputable.

The implementation does not hash the source audio again. It consumes `admitted_audio_cache_identity()` supplied from the native Resource Admission handoff. The NPZ digest is a derived-artifact integrity binding, not a second source-identity authority.

## Alternatives rejected

- **Path/size-only reuse:** rejected because neither identifies the admitted source bytes nor the stem archive bytes.
- **Validate only NPZ member names and shapes:** rejected because a different valid archive can preserve those structural properties.
- **Trust ZIP member size and call NumPy directly:** rejected because an NPY header can claim a larger logical array than a small stored member should authorize; the shape and dtype are preflighted before NumPy allocation.
- **Unbounded local-cache reads because the cache is app-owned:** rejected because local replacement, corruption, downgrade residue, and partially recovered state remain untrusted inputs.
- **Write manifest first:** rejected because a crash can make a new manifest authorize absent or stale arrays.
- **Plain rename without pre-publication sync:** rejected because atomic pathname replacement alone does not prove that acknowledged cache bytes are durable after power loss.
- **Duplicate platform publication code in the analysis API:** rejected. The analysis API serializes derived stem data; the existing Project Persistence cache publication primitive remains the platform-specific durability owner.

## RED → repair evidence

- `1b433605444844a09eb018f1c9249ea552215fef` — executable RED for native source binding, exact NPZ-byte binding, arrays-before-manifest ordering, fail-closed array-publication failure, and schema advancement.
- `4530cd5e55929a90cba263f2a81485dab3cdc687` — schema v2, source evidence consumption, exact NPZ SHA-256 admission, unique staged NPZ, staged-file `fsync`, existing durable publication owner reuse, and manifest-last adoption. The same integrity envelope is applied to file-backed stem process handoff before the arrays are trusted by downstream analysis.
- `e8b2b59f7aa2316cc5572808cdc751ba323f56f3` — executable RED for duplicate JSON names, manifest size bounding, and encoded NPZ rejection before digest work.
- `9f7cb56a5da977af0e615bf6aada6ae326daaa78` — bounded regular-file manifest/NPZ admission, duplicate-key rejection, descriptor-bound digest/load, exact archive-member set, stem-count/byte limits, and write-side resource checks.
- `f44e0d9c762145ade763d71eba4e67326c048d8b` — regression proving a tiny NPZ member with an oversized NPY shape declaration must fail before NumPy allocation.
- `eebc09345bdc5970814e2ec2f723d11c61ae317f` — NPY header preflight closes that declared-shape allocation path before `np.load`.

Hosted exact-head checks remain authoritative. These commits are source evidence, not release evidence.

## Security Notes

- Cache JSON and NPZ files are treated as untrusted local bytes. A well-formed archive is not trusted merely because it is inside an app-owned cache directory.
- The source audio is not copied into metadata and full source paths are not added to the feature manifest.
- A malformed or partial native admitted-audio evidence pair fails closed rather than silently falling back to pathname identity.
- JSON duplicate keys, oversized manifests, oversized encoded archives, unexpected ZIP members, oversized declared arrays, malformed role metadata, object arrays, non-floating stems, non-finite stems, and integrity mismatches are cache misses.
- NPZ loading keeps `allow_pickle=False` and occurs only after the exact archive digest and bounded NPY header declarations agree with the manifest and resource policy.
- Publication failure is a cache miss. It does not block the successful analysis result and does not promote partially published cache state to authority.
- The schema bump intentionally invalidates pre-v2 feature manifests rather than reinterpreting them under stronger semantics.

## Remaining scientific/release boundary

The integrity and resource-admission repair does **not** yet bind feature reuse to a complete MIR implementation/model identity. `AudioStemSeparator` currently names canonical `htdemucs` and verifies the local checkpoint against the checksum prefix encoded by `955717e8-8726e21a.th`, but release bundling, full checkpoint digest/signature provenance, model rights, and a versioned analysis/model generation contract remain separate work. Until those are bound into the reproducibility contract and validated on rights-cleared real decoded audio, a feature-cache hit is an integrity-preserving optimization, not evidence that two BandScope releases implement the same scientific analysis.

Packaged Windows/macOS power-loss, disk-full, and fault-injection acceptance also remains release evidence. Unit/integration tests cannot substitute for that destructive packaged-build evidence.

## Primary implementation references

Python Software Foundation. (2026). *json — JSON encoder and decoder*. Python 3 documentation. https://docs.python.org/3/library/json.html

Python Software Foundation. (2026). *os — Miscellaneous operating system interfaces: `os.fsync`*. Python 3 documentation. https://docs.python.org/3/library/os.html#os.fsync

Python Software Foundation. (2026). *zipfile — Work with ZIP archives*. Python 3 documentation. https://docs.python.org/3/library/zipfile.html

Microsoft. (2024). *MoveFileExW function (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/windows/win32/api/winbase/nf-winbase-movefileexw

NumPy Developers. (2026). *Input and output: NumPy binary files (`npz`)*. NumPy reference. https://numpy.org/doc/stable/reference/routines.io.html

NumPy Developers. (2026). *numpy.load*. NumPy reference. https://numpy.org/doc/stable/reference/generated/numpy.load.html

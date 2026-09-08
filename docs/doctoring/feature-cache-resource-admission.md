# Persisted feature-cache resource admission

## Scope and decision

BandScope treats the persisted stem-feature cache as a Resource Admission & Decode boundary rather than trusted in-memory state. The cache lives below an app-owned path, but a crash, interrupted publication, restore, local tampering, or version drift can leave bytes that no longer satisfy the live decode/model invariants. Replaying those bytes directly into MIR would let persistence bypass the controls applied to freshly decoded or separated audio.

The selected design keeps one cache replay owner: `feature_cache_admission.load_bounded_stem_archive`. `_load_cached_local_audio_features` validates its metadata/separation/role envelope, then delegates the stem archive to that owner with the live `DEFAULT_AUDIO_RESOURCE_POLICY`. No second archive/resource policy is introduced in API, persistence, or MIR code.

RED `fabad0c563eb5fc11dbba3ad9adf4960684f2249` requires finite floating legacy cache stems to become owned native NumPy `float32`, rejects multidimensional/non-finite stems and unsupported sample rates, and requires a member whose declared PCM exceeds policy to fail before `np.load` can materialize it. Production prerequisite `9fa37096985063a3ede6e79075377a471ec24109` implements the bounded archive owner. Integration `c9296732aa331f77f433bc49258c6d493ecc492a` replaces API's direct `np.load` replay with that owner; ordinary descendant `7047b215330c0f189eb5e7e35591824000929869` restores unrelated docstring text accidentally changed during the contents-API write without rewriting history.

## Invariants

The replay path admits the already-open archive before any stem array is materialized. The file must be a non-empty regular file within the aggregate archive bound. The metadata must name one to four unique Python-identifier stem keys. The ZIP central directory must contain exactly the corresponding `stem_<key>.npy` members: no extras, duplicates, directories, encrypted entries, or compression methods other than `ZIP_DEFLATED` are accepted.

Each member must fit the policy-derived decoded-byte ceiling plus the bounded NPY header allowance. BandScope reads the NPY magic and version-1 header through the compressed member stream before calling `np.load`; it requires one non-empty, C-order floating array and checks declared sample count, declared element bytes, and exact header-plus-data extent against the member's declared uncompressed size. Aggregate declared member bytes are also bounded.

Only after that declaration preflight does BandScope rewind the same already-open archive and call `np.load(..., allow_pickle=False, max_header_size=16 KiB)`. A loaded legacy floating dtype is copied into owned `float32` only after the earlier declared sample/byte checks. Every loaded stem is then re-admitted through `AudioResourcePolicy.validate_decoded_audio`, which rechecks sample rate, one-dimensional shape, canonical dtype, sample count, visible bytes, and finiteness before the array can return to MIR/rehearsal analysis.

## Alternatives considered

Direct `np.load` followed by post-load validation was rejected because decompression/materialization itself would remain outside the product's resource-admission boundary. Trusting the app-owned cache directory was rejected because ownership of a path is not evidence that persisted bytes remain well-formed after crashes, restores, corruption, or local modification. Re-implementing NPY payload decoding was also rejected: BandScope only parses the bounded declaration needed to decide whether materialization is admissible, then delegates actual NumPy format decoding to NumPy with pickle disabled and an explicit header ceiling.

Supporting every NPY/ZIP representation was rejected for this cache version. The current writer uses `np.savez_compressed`; replay therefore accepts the narrow version-1 NPY / deflate representation that BandScope itself emits and fails closed on representation drift. A future cache-format migration must be versioned and tested rather than silently widening the parser surface.

## Security Notes and claim boundary

Python's `zipfile` exposes member `file_size`, `compress_size`, compression method, encryption flag bits, and ordered member metadata before extraction. NumPy documents `.npz` as a ZIP-backed dictionary-like container whose arrays are loaded lazily, and `numpy.load` explicitly recommends `allow_pickle=False` for safer handling of untrusted data and supports a bounded `max_header_size`. Those APIs make declaration-first admission possible, but their existence is not itself a resource guarantee; BandScope supplies the product limits and exact-member contract.

This control bounds the cache artifact that BandScope elects to materialize. It does **not** establish a whole-process memory, CPU, disk-I/O, or decompression-time ceiling for Python, NumPy, zlib, or downstream MIR/model execution. It also does not make the already-open file an immutable content snapshot against a privileged local actor capable of modifying bytes in place. Full commercial resource acceptance therefore still requires rights-cleared full-length rehearsal audio with measured peak RSS/VRAM, CPU/GPU budgets, cancellation latency, inherited handle/pipe return, and child-created temporary-file cleanup.

A corrupt or unsupported cache is a cache miss, not rehearsal evidence. The caller may recompute features through the canonical live path; it may not relax admission to preserve cache hit rate.

## Evidence-to-control traceability

| Evidence | BandScope control |
| --- | --- |
| NumPy documents `numpy.load(..., allow_pickle=False, max_header_size=...)`, warns that loading object arrays through pickle is unsafe for erroneous or malicious data, and describes `.npz` as a ZIP-backed mapping whose arrays are loaded on access. | Cache replay disables pickle, caps the NPY header, preflights the exact member declaration before access, and does not treat lazy `NpzFile` lookup as admission by itself. |
| Python 3.14 `zipfile` documents `ZipFile.infolist()` / `ZipInfo`, including member `compress_type`, `flag_bits`, `file_size`, `compress_size`, and the ability for archives to contain duplicate names. | Replay requires an exact unique member set, rejects encryption and non-deflate methods, and bounds declared uncompressed member/aggregate bytes before NumPy materialization. |
| CWE-770 identifies failure to bound resource allocation as a denial-of-service class and recommends explicit resource limits. | Cache replay derives its sample/byte limits from the same versioned `AudioResourcePolicy` used for live decode rather than creating an independent cache allowance. |

## References

MITRE Corporation. (2026, April 30). *CWE-770: Allocation of resources without limits or throttling (Version 4.20).* Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/770.html

NumPy Developers. (2026). *numpy.load* [Reference documentation]. NumPy. Retrieved September 9, 2026, from https://numpy.org/doc/stable/reference/generated/numpy.load.html

NumPy Developers. (2026). *NumPy binary file format (`numpy.lib.format`)* [Reference documentation]. NumPy. Retrieved September 9, 2026, from https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html

Python Software Foundation. (2026). *`zipfile` — Work with ZIP archives (Python 3.14.7)* [Documentation]. https://docs.python.org/3.14/library/zipfile.html

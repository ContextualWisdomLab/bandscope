# Persisted feature-cache resource admission

## Scope and decision

BandScope treats persisted stem features as a Resource Admission & Decode boundary, not trusted in-memory state. Cache bytes live below an app-owned path, but crash recovery, interrupted publication, restore, local modification, or version drift can make them disagree with the live decode/separation contract. Replaying them directly into MIR would let persistence bypass controls applied to freshly decoded audio.

The single replay owner is `feature_cache_admission.load_bounded_stem_archive`. `_load_cached_local_audio_features` validates the metadata/separation envelope and delegates archive admission with the live `DEFAULT_AUDIO_RESOURCE_POLICY`. MIR, UI, and project code do not implement parallel cache validators.

The current design copies exactly the initially admitted regular-file extent into a private `tempfile.SpooledTemporaryFile`, then performs ZIP/NPY declaration preflight and `numpy.load` against that same snapshot. Small archives remain in memory up to the explicit spool threshold; larger admitted archives roll over to `TemporaryFile` semantics. The snapshot is context-owned and is not a project artifact or a second persistent cache.

This replaces the earlier descriptor-metadata guard. The previous guard compared `(st_dev, st_ino, st_size, st_mtime_ns)` before preflight and after NumPy materialization. That detects ordinary writes, but it is not a content identity: an in-place writer can replace bytes with a same-size archive and restore the original modification timestamp. In that case every compared field can remain unchanged while `np.load` observes bytes that were never preflighted.

RED `f94a4bf919561f407ae28aaef6a3b781a0b60989` reproduces that exact bypass. It admits a 16-sample `bass` archive containing negative zero, prepares a same-size archive containing ones, overwrites the same inode immediately before `np.load`, restores `st_mtime_ns`, and requires replay to retain the already-admitted negative-zero generation. Production `0cfc54a465b07d73c9d98ca94f49639b395b4006` introduces the bounded spooled snapshot. Test descendant `d2b3f4931f5cbf5a86d3bdba765285f4f3946a34` preserves the same-metadata substitution regression, changes the older post-preflight path-mutation test to the stronger snapshot semantics, and covers fail-closed short-copy behavior.

Earlier retained controls remain authoritative: canonical `vocals`, `bass`, `drums`, `other` stem identity; canonical role binding; second-read `stemKeys` consistency; one synchronized non-zero sample timeline across cached stems; exact deflated NPY member set; bounded header/sample/decoded-byte declarations before materialization; `allow_pickle=False`; canonical owned finite NumPy `float32` re-admission; and `MemoryError`/truncation containment as a cache miss. These are persistence/resource controls, not evidence of source-separation accuracy.

## Invariants

A replayable cache must satisfy all of the following.

- The archive path resolves to one non-empty regular file whose initially observed extent is within the aggregate archive ceiling derived from the live audio policy.
- The admitted source extent is copied in bounded chunks. A short read before the admitted byte count is reached fails closed. Bytes appended after that initial extent are not admitted into the snapshot.
- ZIP/NPY preflight and NumPy materialization use the same snapshot object. A pathname replacement, same-inode rewrite, timestamp restoration, or later growth of the original file cannot redirect those two phases to different bytes.
- Metadata may name only a unique non-empty subset of `vocals`, `bass`, `drums`, and `other`. The second metadata read must preserve the caller-admitted `stemKeys`. If role metadata is present, it must have exactly the same key set and preserve `vocals -> vocal`, `bass|drums|other -> instrument`.
- The ZIP central directory contains exactly the corresponding `stem_<key>.npy` members: no extra/duplicate/directory/encrypted entries and no compression method other than the representation emitted by the current writer.
- Every member declares one non-empty floating one-dimensional array within the sample and visible-byte ceilings. All admitted stems declare the same sample count; replay never pads, truncates, stretches, or resamples malformed persistence into apparent synchronization.
- Loaded data is returned to MIR only after live `AudioResourcePolicy.validate_decoded_audio` rechecks sample rate, one-dimensional shape, canonical dtype, sample count, visible bytes, ownership/canonicalization, and finiteness.
- Optional-cache failures including malformed ZIP/NPY state, allocator exhaustion, short snapshot copy, and unsupported representation become cache misses rather than authoritative rehearsal results.

## Alternatives considered

Keeping only the pre/post `fstat` comparison was rejected because file metadata is not a content digest and can be restored after an in-place rewrite. Re-statting the pathname was rejected because a pathname can resolve to another object while an already-open descriptor still refers to the original file.

Hashing the archive twice around `np.load` was rejected. It would still make preflight and materialization two reads from mutable source storage and would add two complete archive reads to an acceleration path. A single bounded byte snapshot is a smaller causal control: declaration inspection and use are performed on the same bytes.

Reading the entire archive into `bytes` was rejected because the policy permits multiple long canonical stems and a full in-memory duplicate would make cache admission itself a large peak-RSS event. `SpooledTemporaryFile` provides a bounded in-memory threshold and rolls larger content to `TemporaryFile` behavior without creating a named project artifact.

Direct `np.load` followed by post-load validation remains rejected because decompression/materialization would happen before BandScope checked the member declarations and resource bounds. Reimplementing NPY decoding is also rejected; BandScope parses only the declarations needed for admission and delegates actual decoding to NumPy with pickle disabled and a bounded header.

Repairing malformed synchronized timelines by padding, truncating, or resampling is rejected because it would fabricate rehearsal evidence after persistence corruption. Cache miss and recomputation from the admitted source are safer.

## Security Notes and claim boundary

MITRE CWE-367 describes TOCTOU as checking resource state and later using the resource after that state can change. The replay snapshot removes the concrete archive check/use split: one copied byte sequence is both checked and used. It does not make the writer transaction globally atomic while the snapshot is being copied; a concurrently torn writer could yield a snapshot that is subsequently accepted only if that byte sequence independently satisfies every ZIP/NPY and semantic invariant. The production cache writer already publishes temp files by replacement, but cross-file metadata/archive publication remains a separate transaction boundary.

Python 3.14 documents `SpooledTemporaryFile` as using memory until `max_size` is exceeded and then proceeding as `TemporaryFile`; the high-level temporary-file APIs support context-manager cleanup. BandScope uses that behavior only for an ephemeral replay snapshot. This does not claim immunity to operating-system termination, disk exhaustion, filesystem failure, or whole-process RSS pressure.

NumPy documents `numpy.load` as accepting seekable binary file-like objects, recommends `allow_pickle=False` for safer handling of untrusted data, and supports a `max_header_size` limit. `.npz` is ZIP-backed and arrays are loaded on access, so BandScope still performs its own exact-member and NPY-header admission before allowing materialization. Library defaults are not treated as a product resource policy.

The snapshot is not yet a cryptographic metadata/archive/source generation. A same-`stemKeys` metadata replacement can still change other sidecar fields between the API read and archive-owner read, and the cache does not yet bind its contents to the exact admitted source publication identity by digest. The next persistence contract should version and bind metadata plus archive plus admitted source identity in one immutable generation/manifest, while preserving atomic publication and cache-miss compatibility for older generations.

Persisted cache controls do not prove MIR or separation accuracy. Canonical identities, finite float32 buffers, synchronized lengths, and immutable replay bytes say nothing about bleed, interference, onset/section error, or model generalization. Production scientific acceptance still requires rights-cleared real decoded rehearsal audio, recognized MIR metrics, uncertainty/claim boundaries, and reproducible CPU/accelerator results.

## Evidence-to-control traceability

| Evidence | BandScope control |
| --- | --- |
| CWE-367: state checked before use can change and invalidate the check. | Archive declaration preflight and NumPy materialization consume one private copied snapshot rather than two reads from mutable source storage. |
| Python 3.14 `tempfile`: `SpooledTemporaryFile` remains memory-backed to `max_size`, then rolls to `TemporaryFile`, and can be context-managed. | Replay uses an 8 MiB in-memory spool ceiling and lets larger admitted archives roll to an automatically cleaned temporary file instead of duplicating the full cache in RAM. |
| NumPy `numpy.load` accepts binary seekable file-like objects, exposes `allow_pickle=False`, and bounds header parsing with `max_header_size`. | The private snapshot is passed directly to bounded declaration inspection and then `np.load(..., allow_pickle=False, max_header_size=16 KiB)`. |
| The current BandScope/Demucs separation contract produces `vocals`, `bass`, `drums`, and `other` waveform estimates from one mixture. | Cache replay accepts only that stem vocabulary and requires one shared sample timeline. |
| Exact-head regression `f94a4bf9…` keeps device, inode, size, and mtime unchanged while substituting equal-size sample bytes. | Metadata-only descriptor identity is no longer the authority for check/use consistency; immutable replay bytes are. |

## References

Défossez, A., Usunier, N., Bottou, L., & Bach, F. (2021). *Music source separation in the waveform domain*. Transactions of the International Society for Music Information Retrieval, 4(1), 123–136. https://doi.org/10.5334/tismir.76

MITRE. (2026). *CWE-367: Time-of-check time-of-use (TOCTOU) race condition* (Version 4.20). https://cwe.mitre.org/data/definitions/367.html

NumPy Developers. (2025). *numpy.load — NumPy v2.3 manual*. https://numpy.org/doc/2.3/reference/generated/numpy.load.html

Python Software Foundation. (2026). *tempfile — Generate temporary files and directories* (Python 3.14.7 documentation). https://docs.python.org/3/library/tempfile.html

## Follow-up acceptance

The next persistence RED should bind the metadata snapshot, NPZ snapshot, and exact admitted source publication identity to one versioned digest/generation rather than adding more pathname or timestamp checks. After that, Resource Admission still needs race-free Windows Job Object containment and rights-cleared full-length rehearsal-audio measurement for cancellation latency, inherited handle/pipe return, child temporary cleanup, decoder/resampler/downstream peak RSS/VRAM, and explicit per-job CPU/GPU budgets.

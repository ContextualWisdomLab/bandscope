# Persisted feature-cache resource admission

## Scope and decision

BandScope treats persisted stem features as a Resource Admission & Decode boundary, not trusted in-memory state. Cache bytes live below an app-owned path, but crash recovery, interrupted publication, restore, local modification, or version drift can make them disagree with the live decode/separation contract. Replaying them directly into MIR would let persistence bypass controls applied to freshly decoded audio.

The single replay owner is `feature_cache_admission.load_bounded_stem_archive`. `_load_cached_local_audio_features` validates the metadata/separation envelope and delegates archive admission with the live `DEFAULT_AUDIO_RESOURCE_POLICY`. MIR, UI, and project code do not implement parallel cache validators.

The current design copies exactly the initially admitted regular-file extent into a private `tempfile.SpooledTemporaryFile`, then performs ZIP/NPY declaration preflight and `numpy.load` against that same snapshot. Small archives remain in memory up to the explicit spool threshold; larger admitted archives roll over to `TemporaryFile` semantics. The snapshot is context-owned and is not a project artifact or a second persistent cache. Declaration preflight also returns the one synchronized non-zero stem sample count. When the second-read sidecar carries `separation.duration_seconds`, replay requires that duration to agree with `sample_count / sample_rate` within half one sample before NumPy materialization.

This replaces the earlier descriptor-metadata guard. The previous guard compared `(st_dev, st_ino, st_size, st_mtime_ns)` before preflight and after NumPy materialization. That detects ordinary writes, but it is not a content identity: an in-place writer can replace bytes with a same-size archive and restore the original modification timestamp. In that case every compared field can remain unchanged while `np.load` observes bytes that were never preflighted.

RED `f94a4bf919561f407ae28aaef6a3b781a0b60989` reproduces that exact bypass. It admits a 16-sample `bass` archive containing negative zero, prepares a same-size archive containing ones, overwrites the same inode immediately before `np.load`, restores `st_mtime_ns`, and requires replay to retain the already-admitted negative-zero generation. Production `0cfc54a465b07d73c9d98ca94f49639b395b4006` introduces the bounded spooled snapshot. Test descendant `d2b3f4931f5cbf5a86d3bdba765285f4f3946a34` preserves the same-metadata substitution regression, changes the older post-preflight path-mutation test to the stronger snapshot semantics, and covers fail-closed short-copy behavior.

RED refinement `ea23114061830753d02ba76142e7a0d9f0c5fd6b` covers a separate metadata boundary: Python's standard JSON decoder accepts the non-standard numeric token `Infinity` as `float('inf')`, so a persisted `separation.duration_seconds` can be non-finite even though RFC 8259 does not permit Infinity or NaN as JSON numbers. Production `8b3a512a3ea7b8f680b9eb787ac98f728d1e7929` rejects Boolean, non-numeric, non-finite, zero, and negative duration values when the field is present in the second-read sidecar.

Review of that production delta found one conversion edge case before completion: a JSON integer can be valid Python `int` yet too large for `float(...)`, which raises `OverflowError`. RED `559a95f1d838b50737203104169c2ec57a19f49d` persists a 401-digit duration and requires a cache miss rather than an escaping exception. Production `1350df871942cf87910aab65bba243674065107c` now contains numeric conversion and rejects overflow before the value can become rehearsal timing authority.

RED `dfbf288457a86f628e01488456c8f662093f8a60` closes the next stable-cache semantic gap. Its fixtures first make the valid cache duration sample-derived, then persist `17 / 44_100` seconds beside a synchronized 16-sample, 44.1 kHz stem archive and require a cache miss. The predecessor admitted that cache because both the duration and stem declarations were individually valid. Production `bbaf19a133b870c02a402b617fcabf7ed2f5b9aa` makes bounded NPY preflight return the synchronized sample count and checks second-read duration against `sample_count / sample_rate` with zero relative tolerance and an absolute half-sample tolerance. A one-sample timeline drift therefore fails before `np.load`; the product does not pad, truncate, stretch, or resample persistence to make contradictory timing appear valid.

The half-sample tolerance is deliberate. Exact binary-float equality would couple cache validity to serialization details rather than the discrete waveform extent, while a full-sample tolerance would permit one complete sample of contradictory timeline authority. The selected bound accepts representation noise smaller than the nearest-sample decision boundary and rejects a persisted duration that denotes another discrete sample count.

RED `aa9265c751a1219c123fed091a8260b27a82dfad` closes another second-read generation gap. The fixture now carries a sample-derived duration so every other replay invariant remains valid, then replaces only `schemaVersion: 1` with `schemaVersion: 2` between the API metadata read and archive admission. The predecessor accepted the second sidecar because the archive owner rechecked stem identity, sample rate, duration, and role semantics but did not re-admit the schema version. Production `e0fbb0307522b9901e19f1bac77a307ee0cfae32` requires the second-read sidecar to remain on feature-cache schema version 1 before any archive replay. This prevents a concurrent metadata replacement from crossing a schema-generation boundary while retaining values that happen to satisfy the old reader.

Earlier retained controls remain authoritative: canonical `vocals`, `bass`, `drums`, `other` stem identity; canonical role binding; second-read schema/stem/sample-rate consistency; one synchronized non-zero sample timeline across cached stems; exact deflated NPY member set; bounded header/sample/decoded-byte declarations before materialization; `allow_pickle=False`; canonical owned finite NumPy `float32` re-admission; and `MemoryError`/truncation containment as a cache miss. These are persistence/resource controls, not evidence of source-separation accuracy.

## Invariants

A replayable cache must satisfy all of the following.

- The archive path resolves to one non-empty regular file whose initially observed extent is within the aggregate archive ceiling derived from the live audio policy.
- The admitted source extent is copied in bounded chunks. A short read before the admitted byte count is reached fails closed. Bytes appended after that initial extent are not admitted into the snapshot.
- ZIP/NPY preflight and NumPy materialization use the same snapshot object. A pathname replacement, same-inode rewrite, timestamp restoration, or later growth of the original file cannot redirect those two phases to different bytes.
- The second metadata read must remain on feature-cache schema version 1 and preserve the caller-admitted `stemKeys` and sample rate. Metadata may name only a unique non-empty subset of `vocals`, `bass`, `drums`, and `other`. If role metadata is present, it must have exactly the same key set and preserve `vocals -> vocal`, `bass|drums|other -> instrument`.
- Persisted `separation.duration_seconds`, when present in the second-read sidecar, must convert to one finite positive real value and agree with the synchronized archive timeline within `0.5 / sample_rate` seconds. Python-specific `NaN`, `Infinity`, `-Infinity`, Boolean, zero, negative, integer values too large for finite-float conversion, and durations denoting another sample extent fail closed before archive materialization.
- The ZIP central directory contains exactly the corresponding `stem_<key>.npy` members: no extra/duplicate/directory/encrypted entries and no compression method other than the representation emitted by the current writer.
- Every member declares one non-empty floating one-dimensional array within the sample and visible-byte ceilings. All admitted stems declare the same sample count; replay never pads, truncates, stretches, or resamples malformed persistence into apparent synchronization.
- Loaded data is returned to MIR only after live `AudioResourcePolicy.validate_decoded_audio` rechecks sample rate, one-dimensional shape, canonical dtype, sample count, visible bytes, ownership/canonicalization, and finiteness.
- Optional-cache failures including malformed ZIP/NPY state, schema/identity/rate replacement, invalid or timeline-inconsistent persisted duration, allocator exhaustion, short snapshot copy, and unsupported representation become cache misses rather than authoritative rehearsal results.

## Alternatives considered

Keeping only the pre/post `fstat` comparison was rejected because file metadata is not a content digest and can be restored after an in-place rewrite. Re-statting the pathname was rejected because a pathname can resolve to another object while an already-open descriptor still refers to the original file.

Hashing the archive twice around `np.load` was rejected. It would still make preflight and materialization two reads from mutable source storage and would add two complete archive reads to an acceleration path. A single bounded byte snapshot is a smaller causal control: declaration inspection and use are performed on the same bytes.

Reading the entire archive into `bytes` was rejected because the policy permits multiple long canonical stems and a full in-memory duplicate would make cache admission itself a large peak-RSS event. `SpooledTemporaryFile` provides a bounded in-memory threshold and rolls larger content to `TemporaryFile` behavior without creating a named project artifact.

Direct `np.load` followed by post-load validation remains rejected because decompression/materialization would happen before BandScope checked the member declarations and resource bounds. Reimplementing NPY decoding is also rejected; BandScope parses only the declarations needed for admission and delegates actual decoding to NumPy with pickle disabled and a bounded header.

Accepting Python's default `json.loads` numeric extensions as trusted duration evidence was rejected. Python deliberately accepts `NaN`, `Infinity`, and `-Infinity` even though they are outside the JSON specification. The semantic reader therefore validates the decoded domain value and contains finite-float conversion overflow. Replacing the entire metadata parser in this patch was unnecessary. A future manifest writer should additionally emit strict JSON (`allow_nan=False`) and use one bounded/versioned parser contract so invalid numbers cannot be persisted by the canonical writer in the first place.

Treating `schemaVersion` as an API-only check was rejected. Archive admission intentionally performs a second metadata read to detect replacement between the outer metadata check and replay. Every field that defines the reader contract must therefore be re-admitted at that second boundary. Accepting another schema version because its current fields happen to look compatible would make future cache evolution depend on accidental structural overlap rather than an explicit migration contract.

Comparing persisted duration to `sample_count / sample_rate` with exact floating-point equality was rejected because the invariant is a discrete-sample identity, not a requirement that every producer serialize an identical binary float. Accepting a full sample of error was also rejected because that permits a duration corresponding to another discrete sample count. Half one sample is the nearest-sample boundary for this persistence check; scientific timing accuracy remains a separate real-audio acceptance problem.

Repairing malformed synchronized timelines by padding, truncating, or resampling is rejected because it would fabricate rehearsal evidence after persistence corruption. Cache miss and recomputation from the admitted source are safer.

## Security Notes and claim boundary

MITRE CWE-367 describes TOCTOU as checking resource state and later using the resource after that state can change. The replay snapshot removes the concrete archive check/use split: one copied byte sequence is both checked and used. The second-read schema check additionally prevents a metadata replacement from moving replay into a different cache-format contract after the API already admitted schema version 1. Neither control makes the writer transaction globally atomic while the snapshot is being copied; a concurrently torn writer could yield a snapshot that is subsequently accepted only if that byte sequence independently satisfies every ZIP/NPY and semantic invariant. The production cache writer already publishes temp files by replacement, but cross-file metadata/archive publication remains a separate transaction boundary.

Python 3.14 documents `SpooledTemporaryFile` as using memory until `max_size` is exceeded and then proceeding as `TemporaryFile`; the high-level temporary-file APIs support context-manager cleanup. BandScope uses that behavior only for an ephemeral replay snapshot. This does not claim immunity to operating-system termination, disk exhaustion, filesystem failure, or whole-process RSS pressure.

Python 3.14 also documents that `json.dumps`/`json.loads` accept `NaN`, `Infinity`, and `-Infinity` by default and that this behavior is outside the JSON specification. RFC 8259 states that numeric values outside its grammar, including Infinity and NaN, are not permitted. The current reader therefore treats those decoded values as invalid domain metadata rather than relying on the permissive library default. Numeric conversion is itself inside the fail-closed boundary so an otherwise parseable oversized integer cannot turn admission into an uncaught `OverflowError`.

NumPy documents `numpy.load` as accepting seekable binary file-like objects, recommends `allow_pickle=False` for safer handling of untrusted data, and supports a `max_header_size` limit. `.npz` is ZIP-backed and arrays are loaded on access, so BandScope still performs its own exact-member and NPY-header admission before allowing materialization. Library defaults are not treated as a product resource policy.

The second-read sidecar can no longer change schema version, stem identity, sample rate, canonical role mapping, or finite persisted duration/timeline semantics without becoming a cache miss. This is still not a cryptographic metadata/archive/source generation. `_load_cached_local_audio_features` retains its first metadata object while the archive owner performs a second sidecar read, so a concurrent replacement can still make those two reads observe different, individually admissible non-rate fields within schema version 1. The cache also does not bind its contents to the exact admitted source publication identity by digest. The next persistence contract should version and bind the API metadata snapshot, archive snapshot, and admitted source identity in one immutable generation/manifest, while preserving atomic publication and cache-miss compatibility for older generations.

Persisted cache controls do not prove MIR or separation accuracy. Canonical identities, finite float32 buffers, synchronized lengths, sample-derived duration consistency, schema consistency, and immutable replay bytes say nothing about bleed, interference, onset/section error, or model generalization. Production scientific acceptance still requires rights-cleared real decoded rehearsal audio, recognized MIR metrics, uncertainty/claim boundaries, and reproducible CPU/accelerator results.

## Evidence-to-control traceability

| Evidence | BandScope control |
| --- | --- |
| CWE-367: state checked before use can change and invalidate the check. | Archive declaration preflight and NumPy materialization consume one private copied snapshot rather than two reads from mutable source storage. |
| Python 3.14 `tempfile`: `SpooledTemporaryFile` remains memory-backed to `max_size`, then rolls to `TemporaryFile`, and can be context-managed. | Replay uses an 8 MiB in-memory spool ceiling and lets larger admitted archives roll to an automatically cleaned temporary file instead of duplicating the full cache in RAM. |
| RFC 8259 forbids Infinity and NaN as JSON numbers; Python 3.14 `json` accepts and decodes them by default. | Persisted separation duration is explicitly re-admitted as a finite positive domain value instead of inheriting Python's permissive JSON numeric extension. |
| Python numeric conversion can raise `OverflowError` when an integer is outside finite-float range. | Duration conversion is contained inside cache admission; an oversized integer becomes a cache miss rather than escaping into the analysis job. |
| NumPy `numpy.load` accepts binary seekable file-like objects, exposes `allow_pickle=False`, and bounds header parsing with `max_header_size`. | The private snapshot is passed directly to bounded declaration inspection and then `np.load(..., allow_pickle=False, max_header_size=16 KiB)`. |
| The current BandScope/Demucs separation contract fits every canonical stem to the decoded source length and computes source duration as `audio.size / sample_rate`. | Replay requires all cached stems to share one sample count and, when persisted duration is present, requires it to resolve to that same discrete timeline within half a sample. |
| Exact-head regression `f94a4bf9…` keeps device, inode, size, and mtime unchanged while substituting equal-size sample bytes. | Metadata-only descriptor identity is no longer the authority for check/use consistency; immutable replay bytes are. |
| Exact-head regression `ea231140…` persists an infinite separation duration beside an otherwise admissible stem archive. | Second-read metadata admission rejects non-finite or non-positive duration before reusable stem replay. |
| Exact-head regression `559a95f1…` persists a 401-digit positive integer duration. | Finite-float conversion overflow is caught and converted to cache miss semantics. |
| Exact-head regression `dfbf2884…` persists `17 / 44_100` seconds beside a 16-sample, 44.1 kHz canonical stem archive. | Bounded NPY preflight returns the synchronized sample count, and replay rejects duration that falls outside the half-sample agreement bound before NumPy materialization. |
| Exact-head regression `aa9265c7…` changes only the second-read sidecar from schema version 1 to version 2 while all other current-schema fields and archive bytes remain admissible. | Archive admission independently requires the second-read sidecar to remain on feature-cache schema version 1 before replay. |

## References

Bray, T. (Ed.). (2017). *The JavaScript Object Notation (JSON) data interchange format* (RFC 8259). RFC Editor. https://doi.org/10.17487/RFC8259

Défossez, A., Usunier, N., Bottou, L., & Bach, F. (2021). *Music source separation in the waveform domain*. Transactions of the International Society for Music Information Retrieval, 4(1), 123–136. https://doi.org/10.5334/tismir.76

MITRE. (2026). *CWE-367: Time-of-check time-of-use (TOCTOU) race condition* (Version 4.20). https://cwe.mitre.org/data/definitions/367.html

NumPy Developers. (2025). *numpy.load — NumPy v2.3 manual*. https://numpy.org/doc/2.3/reference/generated/numpy.load.html

Python Software Foundation. (2026). *json — JSON encoder and decoder* (Python 3.14.7 documentation). https://docs.python.org/3/library/json.html

Python Software Foundation. (2026). *tempfile — Generate temporary files and directories* (Python 3.14.7 documentation). https://docs.python.org/3/library/tempfile.html

## Follow-up acceptance

The next persistence RED should bind the first API metadata snapshot, private NPZ replay snapshot, and exact admitted source publication identity to one versioned digest/generation rather than adding more pathname, timestamp, or independently re-read semantic checks. After that, Resource Admission still needs race-free Windows Job Object containment and rights-cleared full-length rehearsal-audio measurement for cancellation latency, inherited handle/pipe return, child temporary cleanup, decoder/resampler/downstream peak RSS/VRAM, and explicit per-job CPU/GPU budgets.

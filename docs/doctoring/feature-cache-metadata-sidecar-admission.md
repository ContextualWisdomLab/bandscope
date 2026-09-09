# Feature-cache metadata sidecar admission

## Problem and boundary

BandScope persists feature-cache metadata beside stem arrays so an interrupted or restarted rehearsal can reuse admitted local-audio work. That sidecar is app-owned persistence, but after a crash, restore, local modification, or partial publication its bytes are not trusted runtime state.

The existing replay boundary bounded ZIP/NPY declarations before NumPy materialization, but both metadata reads still had a resource-policy asymmetry: the first API snapshot and the archive owner's independent second read used ordinary text `open()` followed by `json.load()`. A locally substituted sidecar could therefore consume memory in UTF-8/JSON materialization before BandScope applied a metadata-size admission rule. A special-file substitution could also make a persistence read behave differently from the regular file emitted by the canonical writer.

The repair introduces `read_bounded_feature_cache_metadata` in the Resource Admission & Decode owner. The helper opens the sidecar once, checks the already-open descriptor with `fstat`, requires a non-empty regular file no larger than 1 MiB, reads at most the admitted extent plus one probe byte, then performs UTF-8 decoding and JSON materialization. Growth or truncation during that read fails closed. Where the platform exposes them, `O_NONBLOCK` and `O_NOFOLLOW` are applied before the open descriptor is admitted. The 1 MiB ceiling is a BandScope product limit, not an external standard; the canonical writer emits only schema/source/sample-rate/separation/stem-key/role metadata, so the limit deliberately leaves substantial evolution headroom without accepting unbounded persistence.

RED `2f6e73250368f58c25524a9a61510bb4bc58f1ec` exposed the broader unbounded first-read path by making JSON materialization fail if an oversized sidecar reached it. Production `a7531f54c5c84f74c5be45663948d918a3ea048d` establishes the bounded reusable sidecar reader and moves the archive owner's second read onto it. Test refinement `4a89c629c9280ee95ecdb612538fa1e1895c5201` isolates the new owner contract. Production descendant `02deb79bcdfbf0ac7db5e4bc30556d4b0c845536` routes `_load_cached_local_audio_features` first metadata snapshot through the same primitive, removing the remaining direct `json.load()` feature-cache path. Test descendant `cbfaf3b56fe9c16545c5c60314cf06045539b28f` now proves both the primitive and the first API snapshot reject an oversized sidecar before `json.loads` can run.

## Invariants

Every feature-cache metadata read used for stem replay must pass the same bounded primitive. A sidecar admitted by that helper must be a non-empty regular file whose observed byte extent is at most 1 MiB. The descriptor is opened before type and size checks, so admission and the bounded read refer to the same opened object rather than a later pathname lookup. The read must return exactly the admitted extent; an early EOF or an appended probe byte makes the cache a miss. UTF-8 decode failure, malformed JSON, filesystem failure, and allocator exhaustion remain cache misses rather than rehearsal evidence.

The helper does not make metadata, NPZ bytes, and source publication one generation. It also does not authorize new stem identities, relax timeline/resource rules, or establish scientific MIR accuracy. The existing archive owner still performs schema, canonical stem/role, sample-rate, duration/timeline, ZIP/NPY, dtype, sample-count, finite-signal, and live `AudioResourcePolicy` checks.

## Alternatives and decision

Keeping `json.load()` on an unbounded text file and validating fields afterwards was rejected because resource consumption precedes semantic validation. Reading the entire sidecar into an unconstrained `str` or `bytes` object was rejected for the same reason.

Checking `Path.stat()` and reopening the pathname was rejected because the pathname can identify a different object between check and use. The selected helper opens first and uses `fstat()` plus the same descriptor for the bounded read. This is narrower than a cryptographic manifest: each metadata read is resource-bounded and descriptor-consistent, but two independently valid reads can still observe different publication generations.

A second parser implementation in `api.py` was rejected. First-read and archive-read feature metadata now consume the same bounded primitive, so future size/type/encoding policy changes have one owner.

A very small schema-derived byte ceiling was also rejected. Cache schemas evolve, and an excessively tight limit would turn benign version growth into avoidable recomputation. One MiB is intentionally far above the current canonical sidecar while still putting a concrete ceiling before parser allocation.

## Residual finding and follow-up

The unbounded feature-cache metadata parser gap is closed for both reads, but two calls to the bounded helper do not create one transactional metadata generation. A sidecar can still be replaced between the first API snapshot and the archive owner's second read with another independently admissible schema-v1 object whose already-checked semantic fields happen to agree. The persistence design therefore still needs the planned versioned immutable manifest that binds one admitted metadata snapshot, the private NPZ snapshot, and the #970-owned `contentSha256` / `sourceReference` publication identity after protected ancestry. Do not replace that with pathname/timestamp heuristics or duplicate Project Persistence source hashing in #866.

Windows process-tree containment remains a separate runtime gap. The current shared process owner establishes Unix process-group semantics, but Windows still requires race-free Job Object creation/assignment before whole-tree termination can be claimed.

## Security traceability

MITRE CWE-400 describes uncontrolled consumption of resources such as memory, CPU, storage, and other finite system capacity. The BandScope mapping here is narrow: persistence-controlled metadata bytes were allowed to reach JSON materialization without a product byte ceiling. Both replay metadata reads now impose the product ceiling before parser allocation; this is not a claim of whole-process memory containment.

Python 3.14 documents `O_NONBLOCK` as available on Unix and `O_NOFOLLOW` as an extension that may be absent when the C library does not define it. BandScope therefore treats these flags as defense in depth and keeps regular-file/size admission on the opened descriptor as the portable semantic requirement.

## References

MITRE. (2026). *CWE-400: Uncontrolled resource consumption* (CWE 4.20). Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/400.html

Python Software Foundation. (2026). *os — Miscellaneous operating system interfaces* (Python 3.14.7 documentation). https://docs.python.org/3/library/os.html

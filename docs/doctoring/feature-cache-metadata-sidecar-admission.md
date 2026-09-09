# Feature-cache metadata sidecar admission

## Problem and boundary

BandScope persists feature-cache metadata beside stem arrays so an interrupted or restarted rehearsal can reuse admitted local-audio work. That sidecar is app-owned persistence, but after a crash, restore, local modification, or partial publication its bytes are not trusted runtime state.

The existing replay boundary bounded ZIP/NPY declarations before NumPy materialization, but both metadata reads still had a resource-policy asymmetry: the first API snapshot and the archive owner's independent second read used ordinary text `open()` followed by `json.load()`. A locally substituted sidecar could therefore consume memory in UTF-8/JSON materialization before BandScope applied a metadata-size admission rule. A special-file substitution could also make a persistence read behave differently from the regular file emitted by the canonical writer.

The bounded parser originally still accepted duplicate JSON object member names through Python's default `json.loads` behavior. That is an authority ambiguity at a persistence boundary: a sidecar can physically contain two `schemaVersion` or nested `duration_seconds` members while a dictionary-shaped result exposes only one interpretation. RFC 8259 says object member names SHOULD be unique and warns that duplicate-name handling differs across implementations. Python exposes `object_pairs_hook` specifically at every decoded JSON object, so BandScope can reject duplicates before reducing the parsed representation to a dictionary.

The repair introduces `read_bounded_feature_cache_metadata` in the Resource Admission & Decode owner. The helper opens the sidecar once, checks the already-open descriptor with `fstat`, requires a non-empty regular file no larger than 1 MiB, reads at most the admitted extent plus one probe byte, then performs UTF-8 decoding and JSON materialization. Growth or truncation during that read fails closed. Where the platform exposes them, `O_NONBLOCK` and `O_NOFOLLOW` are applied before the open descriptor is admitted. The 1 MiB ceiling is a BandScope product limit, not an external standard; the canonical writer emits only schema/source/sample-rate/separation/stem-key/role metadata, so the limit deliberately leaves substantial evolution headroom without accepting unbounded persistence.

RED `2f6e73250368f58c25524a9a61510bb4bc58f1ec` exposed the broader unbounded first-read path by making JSON materialization fail if an oversized sidecar reached it. Production `a7531f54c5c84f74c5be45663948d918a3ea048d` establishes the bounded reusable sidecar reader and moves the archive owner's second read onto it. Test refinement `4a89c629c9280ee95ecdb612538fa1e1895c5201` isolates the new owner contract. Production descendant `02deb79bcdfbf0ac7db5e4bc30556d4b0c845536` routes `_load_cached_local_audio_features` first metadata snapshot through the same primitive, removing the remaining direct `json.load()` feature-cache path. Test descendant `cbfaf3b56fe9c16545c5c60314cf06045539b28f` proves both the primitive and the first API snapshot reject an oversized sidecar before `json.loads` can run.

Duplicate-member RED `c7721839fb31dcb6cb5720f03bf24ee73250b05b` adds both top-level `schemaVersion` and nested `separation.duration_seconds` ambiguity cases. Production `10f7a369ef1277d8a50e6db2a80047185b35a6af` supplies an `object_pairs_hook` that materializes each JSON object only when all member names are unique; a repeated name raises the already-contained `ValueError` and becomes a cache miss. The hook applies recursively because Python invokes it for every decoded JSON object.

## Invariants

Every feature-cache metadata read used for stem replay must pass the same bounded primitive. A sidecar admitted by that helper must be a non-empty regular file whose observed byte extent is at most 1 MiB. The descriptor is opened before type and size checks, so admission and the bounded read refer to the same opened object rather than a later pathname lookup. The read must return exactly the admitted extent; an early EOF or an appended probe byte makes the cache a miss. UTF-8 decode failure, malformed JSON, duplicate JSON member names at any object depth, filesystem failure, allocator exhaustion, and integer-conversion-limit failures remain cache misses rather than rehearsal evidence.

The helper does not make metadata, NPZ bytes, and source publication one generation. It also does not authorize new stem identities, relax timeline/resource rules, or establish scientific MIR accuracy. The existing archive owner still performs schema, canonical stem/role, sample-rate, duration/timeline, ZIP/NPY, dtype, sample-count, finite-signal, and live `AudioResourcePolicy` checks.

## Alternatives and decision

Keeping `json.load()` on an unbounded text file and validating fields afterwards was rejected because resource consumption precedes semantic validation. Reading the entire sidecar into an unconstrained `str` or `bytes` object was rejected for the same reason.

Accepting Python's default duplicate-member behavior was rejected because it silently collapses multiple physical claims into one dictionary value. Selecting the first or last duplicate was also rejected: feature-cache metadata is optional acceleration state, so recomputation is safer than inventing precedence for contradictory persistence authority. The selected `object_pairs_hook` rejects any duplicate member at any nesting depth while retaining the standard parser and the existing bounded `ValueError` cache-miss path.

Checking `Path.stat()` and reopening the pathname was rejected because the pathname can identify a different object between check and use. The selected helper opens first and uses `fstat()` plus the same descriptor for the bounded read. This is narrower than a cryptographic manifest: each metadata read is resource-bounded and descriptor-consistent, but two independently valid reads can still observe different publication generations.

A second parser implementation in `api.py` was rejected. First-read and archive-read feature metadata now consume the same bounded primitive, so future size/type/encoding/duplicate-member policy changes have one owner.

A very small schema-derived byte ceiling was also rejected. Cache schemas evolve, and an excessively tight limit would turn benign version growth into avoidable recomputation. One MiB is intentionally far above the current canonical sidecar while still putting a concrete ceiling before parser allocation.

## Residual finding and follow-up

Duplicate-member ambiguity is closed at the bounded JSON parser, but two calls to that parser do not create one transactional metadata generation. A sidecar can still be replaced between the first API snapshot and the archive owner's second read with another independently admissible schema-v1 object whose already-checked semantic fields happen to agree. The persistence design therefore still needs the planned versioned immutable manifest that binds one admitted metadata snapshot, the private NPZ snapshot, and the #970-owned `contentSha256` / `sourceReference` publication identity after protected ancestry. Do not replace that with pathname/timestamp heuristics or duplicate Project Persistence source hashing in #866.

Windows process-tree containment remains a separate runtime gap. The current shared process owner establishes Unix process-group semantics, but Windows still requires race-free Job Object creation/assignment before whole-tree termination can be claimed.

## Security traceability

MITRE CWE-400 describes uncontrolled consumption of resources such as memory, CPU, storage, and other finite system capacity. The BandScope mapping here remains narrow: persistence-controlled metadata bytes were allowed to reach JSON materialization without a product byte ceiling. Both replay metadata reads now impose the product ceiling before parser allocation; this is not a claim of whole-process memory containment.

RFC 8259 Section 4 requires interoperable JSON producers and consumers to treat unique object member names as the portable form and notes that duplicate-member behavior varies by implementation. BandScope chooses the stricter fail-closed interpretation because this JSON is persisted rehearsal evidence, not a user-authored document that benefits from permissive recovery.

Python 3.14 documents `object_pairs_hook` as receiving the ordered member pairs for every decoded JSON object, which provides the parser boundary needed to detect duplicates before dictionary collapse. Python also documents the integer-string conversion limit applied by the default `parse_int=int`, which remains contained by the same `ValueError` cache-miss path.

Python 3.14 documents `O_NONBLOCK` as available on Unix and `O_NOFOLLOW` as an extension that may be absent when the C library does not define it. BandScope therefore treats these flags as defense in depth and keeps regular-file/size admission on the opened descriptor as the portable semantic requirement.

## References

Bray, T. (2017). *The JavaScript Object Notation (JSON) Data Interchange Format* (RFC 8259). Internet Engineering Task Force. https://www.rfc-editor.org/rfc/rfc8259

MITRE. (2026). *CWE-400: Uncontrolled resource consumption* (CWE 4.20). Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/400.html

Python Software Foundation. (2026). *json — JSON encoder and decoder* (Python 3.14.7 documentation). https://docs.python.org/3/library/json.html

Python Software Foundation. (2026). *os — Miscellaneous operating system interfaces* (Python 3.14.7 documentation). https://docs.python.org/3/library/os.html

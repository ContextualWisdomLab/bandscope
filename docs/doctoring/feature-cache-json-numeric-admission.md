# Feature-cache JSON numeric admission

## Problem

BandScope bounds persisted feature-cache sidecars to 1 MiB before UTF-8 and JSON decoding, but the parser boundary previously caught `json.JSONDecodeError` without catching every failure that Python's default JSON numeric conversion can raise. A syntactically valid sidecar containing an integer longer than the interpreter's integer-string conversion limit causes the default `parse_int=int` path to raise `ValueError`. Because feature-cache replay is optional persistence, that exception must not escape as analysis-job failure; the cache must fail closed and be recomputed from the admitted local-audio source.

Corrected RED `f667a9ebf3562dbc1c9ca2c3947d9a95daa4ebb2` writes a bounded JSON object whose `sampleRate` value contains 5,000 decimal digits and requires `read_bounded_feature_cache_metadata()` to return `None`. Production `be336746179567032ef0bdcdd811eb590a319326` keeps the existing descriptor, regular-file, size, UTF-8, and JSON boundaries and extends only the parser exception containment to `ValueError`.

## Decision and alternatives

Catch `ValueError` at the bounded metadata parser owner. This is narrower than changing Python's process-wide integer conversion limit, which would weaken the interpreter's denial-of-service protection, and narrower than supplying a custom `parse_int`, which is unnecessary because BandScope does not need arbitrary-precision persisted numeric authority. Catching the error later in `_load_cached_local_audio_features` was rejected because both the first metadata read and archive admission's second metadata read use the same parser and should share one cache-miss contract.

The 1 MiB sidecar ceiling remains unchanged. This repair is exception containment, not permission for huge integers: the sidecar is rejected before its values can become sample-rate, duration, or rehearsal evidence.

## Evidence and traceability

Python Software Foundation. (2026). *json — JSON encoder and decoder* (Python 3.13.15 documentation). https://docs.python.org/3.13/library/json.html

Python documents that untrusted JSON may consume substantial CPU and memory and recommends limiting input size. Since Python 3.11, the default `parse_int` delegates to `int()` with the interpreter's maximum integer-string conversion limit specifically to help avoid denial-of-service attacks. BandScope retains that protection and converts its resulting parser failure into a cache miss rather than letting it cross the optional-persistence boundary.

MITRE. (2026). *CWE-248: Uncaught Exception* (CWE 4.20). https://cwe.mitre.org/data/definitions/248.html

CWE-248 describes an exception escaping its intended handling boundary and potentially affecting availability. The mapping here is narrow: a bounded but adversarial/corrupt persisted sidecar can trigger Python's numeric conversion `ValueError`; BandScope now handles that exception at the cache parser. This does not claim that every possible Python, NumPy, ZIP, filesystem, or downstream MIR failure is contained.

## Remaining claim boundary

This repair does not complete the versioned immutable feature-cache generation. `.features.json` and `.features.npz` are still independent persisted objects, and the bounded metadata snapshot, private NPZ replay snapshot, and native verified source digest are not yet cryptographically committed as one generation. That remains the next #866 Project Persistence/Resource Admission integration step; Project Persistence #970 continues to own durable `sourceReference/contentSha256` semantics.

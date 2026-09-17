# Structure experiment corpus admission

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228  
Parent contract: `docs/traceability/mir/structure-feature-noninferiority.md`

## Problem

The noninferiority registration names rights-cleared audio and annotation content by SHA-256 and provenance URI, but those declarations alone do not prove that a workstation actually measured the registered bytes. A local manifest can point at the wrong revision, a file can change after the manifest is prepared, or the decoder can normalize different bytes than reviewers believe were admitted.

The experiment therefore needs a local-only admission step before any CQT/STFT metric or latency measurement. Workstation paths are execution details and must not become scientific provenance or appear in durable receipts.

## Decision

`scripts/research/verify_structure_corpus.py` resolves a local manifest only at execution time. For every registered track it:

- requires the manifest order and track IDs to exactly match the preregistered corpus;
- opens audio and annotation inputs as regular files without following symlinks where the platform provides `O_NOFOLLOW`;
- computes SHA-256 from the opened descriptors and compares those digests with the preregistration before decoding;
- requires the current source commit, `uv.lock`, Python, librosa, and NumPy identities to match the registered runtime;
- decodes the already-admitted audio descriptor through `librosa.load(..., sr=<registered>, mono=True)` and computes a canonical little-endian float32 PCM SHA-256;
- emits only registration identity, runtime identity, content digests, decoded PCM digest/frame count, sample rate, channel count, and track ID. Local audio/annotation paths are never copied into the receipt.

The tool does not calculate MIR metrics, aggregate tracks, estimate uncertainty, or make a noninferiority decision. Those remain separate scientific steps. A passing corpus-admission receipt is therefore necessary evidence for a run, not sufficient evidence for a production representation change.

## Constraints and rejected alternatives

Dereferencing `source_uri` was rejected. Provenance URI is evidence metadata and may identify licensed material that cannot be fetched by CI. Network retrieval would also turn a local-first experiment into a mutable external dependency.

Hashing by pathname and then reopening for decode was rejected because the pathname can change between the two operations. Admission hashes the opened descriptor, rewinds that descriptor, duplicates it, and decodes the same opened file identity.

Persisting workstation paths in the receipt was rejected because they are neither stable provenance nor purpose-bound evidence and can expose local usernames, mounts, or project layout.

The decoded PCM digest does not by itself prove that two machines will decode a compressed source identically. It records the exact normalized signal used by one run. The preregistration already binds librosa/NumPy and the source/lock identity; if future production acceptance requires cross-decoder equivalence, the schema must explicitly bind the remaining decoder/backend contract rather than assuming it.

## Audio normalization authority

BandScope's registered structure input is mono at the registered sample rate. librosa 0.11.0 documents `load` as producing a floating-point time series, accepting file-like inputs, converting to mono when requested, and resampling to the requested `sr`; its documented default resampler is `soxr_hq`. The admission tool intentionally calls `librosa.load` without overriding `res_type`, so the decoder behavior is tied to the preregistered librosa version rather than duplicated in a second local normalization implementation.

MIREX 2025 Music Structure Analysis evaluates mono 44.1 kHz WAV input and uses frame-level functional-label accuracy plus boundary retrieval F-measures at 0.5 s and 3.0 s. Corpus admission does not claim those evaluation metrics; it only ensures that later metric computation starts from the registered local bytes and records the exact decoded PCM identity.

## Test boundary

Unit tests use tiny synthetic byte fixtures and an injected decoder to exercise hash drift, runtime drift, symlink rejection, path non-disclosure, duplicate JSON keys, and non-standard JSON numbers. These fixtures are not production scientific evidence and do not satisfy #1225's rights-cleared real-music corpus requirement.

## Remaining scientific work

A reviewed rights-cleared real corpus and independent annotation manifest are still required. Before candidate results are inspected, the actual aggregation, paired uncertainty, margins, latency threshold, dependence assumptions, claim boundary, and any failure/exclusion rule must be approved. The next runner must consume admitted decoded audio, calculate the recognized MIREX/mir_eval track metrics for both CQT and STFT on the same PCM, and derive aggregate/CI evidence from the preregistered procedure rather than accepting caller-authored summaries.

## References

- MIREX. (2025). *Music Structure Analysis*. International Music Information Retrieval Systems Evaluation Laboratory. https://music-ir.org/mirex/wiki/2025%3AMusic_Structure_Analysis
- McFee, B., et al. (2025). *librosa 0.11.0 documentation: Core IO and DSP*. https://librosa.org/doc/0.11.0/core.html

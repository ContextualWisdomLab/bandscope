# Structure experiment corpus admission

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228  
Parent contract: `docs/traceability/mir/structure-feature-noninferiority.md`

## Problem

The noninferiority registration names rights-cleared audio and annotation content by SHA-256 and provenance URI, but those declarations alone do not prove that a workstation actually measured the registered bytes. A local manifest can point at the wrong revision, a file can change after the manifest is prepared, or the decoder can normalize different bytes than reviewers believe were admitted.

The experiment therefore needs a local-only admission step before any CQT/STFT metric or latency measurement. Workstation paths are execution details and must not become scientific provenance or appear in durable receipts.

A digest-only receipt is also not a measurement handoff. Earlier admission code decoded the verified audio snapshot, recorded its PCM digest/frame count, then discarded both the snapshot and decoded signal before returning. A later experiment runner would therefore have had to reopen or re-decode workstation material, making it impossible to prove that the PCM identified by the admission receipt was the exact signal supplied to CQT and STFT.

## Decision

`scripts/research/verify_structure_corpus.py` resolves a local manifest only at execution time. For every registered track it:

- requires the manifest order and track IDs to exactly match the preregistered corpus;
- opens audio and annotation inputs as regular files without following symlinks where the platform provides `O_NOFOLLOW`;
- copies the opened audio stream into a process-owned temporary snapshot while computing the SHA-256, then compares that digest with the preregistration before decoding;
- snapshots and hashes annotation bytes from the opened annotation descriptor and compares them with the registered annotation identity;
- requires the current source commit, `uv.lock`, Python, librosa, and NumPy identities to match the registered runtime;
- treats Git commit and SHA-256 values as case-insensitive hexadecimal identities and emits them lowercase, matching the validator contract, while Python/librosa/NumPy version strings remain exact;
- decodes the immutable admitted audio snapshot through `librosa.load(..., sr=<registered>, mono=True)`, converts it to canonical little-endian float32, marks that NumPy array read-only, and computes the PCM SHA-256 over the same byte view;
- optionally invokes an in-process `track_consumer` only after both registered audio and annotation identities have passed. The callback receives that exact canonical PCM byte view, the process-owned annotation snapshot, track ID, and sample rate. It receives no workstation path. Because the temporary annotation handle is writable internally, admission re-hashes it after the callback and rejects the run if the consumer changed any admitted annotation byte;
- emits only registration identity, runtime identity, content digests, decoded PCM digest/frame count, sample rate, channel count, and track ID. Local audio/annotation paths are never copied into the receipt.

The standalone CLI still writes only the path-free receipt. A scientific runner that claims "same admitted PCM" must use the in-process consumer boundary, or a future equivalently strong content-addressed handoff, rather than reading the receipt and reopening source paths afterward.

The tool does not calculate MIR metrics, aggregate tracks, estimate uncertainty, or make a noninferiority decision. Those remain separate scientific steps. A passing corpus-admission receipt is therefore necessary evidence for a run, not sufficient evidence for a production representation change.

## RED -> GREEN lineage

The initial implementation `83e59f220eba26272840f3f901cdaaf50d86d3c2` hashed an opened audio descriptor and decoded that same live descriptor. Hostile review found that pathname substitution was prevented but same-inode byte mutation between hash and decode was not.

RED `1f653439a31b27ff905dd2e825a99f79188598d6` required post-admission source mutation not to change decoder input. GREEN `47184b8aa8bff7a0405d30ef79a6274e64e9d483` moved decode onto a process-owned snapshot created while hashing. `f28764fc20322a1405e730245185cc8dba12f888` made the mutation regression portable across Windows and POSIX.

A second gap remained: the verified normalized PCM was destroyed before any scientific consumer could use it. RED `af927bbd429647f5cb655ec488ea6e7f16f8a7a2` requires a consumer to receive the exact admitted PCM and annotation snapshot, and verifies that mutating the original annotation path after admission cannot change what the consumer reads. GREEN `813dd925ec80d66e23a57c03ff52c143d569f9c7` exposes that in-process handoff while preserving the path-free durable receipt and legacy hash-only verifier use.

That handoff still exposed the process-owned annotation snapshot as a writable `BinaryIO`. The source path could no longer drift, but the runner itself could mutate the hashed snapshot and then compute MIR metrics from bytes that no longer matched `annotation_sha256`. RED `1e5aa12bd4965cfc709e35a626fa5727397c9a6d` requires such a mutation to invalidate admission. GREEN `61a74d6753f58069f4ff91c910dd237bd21c98fc` flushes and re-hashes the annotation snapshot after the consumer returns, failing closed before a receipt is emitted when the admitted bytes changed.

Earlier RED `f3abb6489836fd775cf67ae48cdc2c320f64a518` -> GREEN `174c6d33b44ef8e20e7e923ad638d7489442a460` aligned runtime identity with the evidence validator by comparing Git commit and SHA-256 fields as case-insensitive hexadecimal identities while keeping version strings exact.

## Constraints and rejected alternatives

Dereferencing `source_uri` was rejected. Provenance URI is evidence metadata and may identify licensed material that cannot be fetched by CI. Network retrieval would also turn a local-first experiment into a mutable external dependency.

Hashing an opened source descriptor and then decoding that still-live source descriptor was rejected. A pathname cannot be swapped once the descriptor is open, but another writer can still change the underlying regular-file bytes between the hash and decode. Admission therefore snapshots the source bytes while hashing and decodes only that process-owned snapshot.

Treating the durable receipt as the experiment input was rejected. The receipt proves identities but does not contain the admitted signal or annotations. Reopening source paths from a later process would create a second admission event and sever the claim that baseline and candidate consumed the exact PCM whose digest is recorded. The current safe boundary is therefore in-process consumption during admission; a future persistent artifact bundle would need its own atomic, content-addressed and resource-bounded contract before it could replace this boundary.

Treating a writable temporary annotation handle as intrinsically immutable was rejected. The current callback API remains file-like for streaming parsers, but the snapshot digest is checked again after callback execution. A future read-only snapshot abstraction may tighten capability exposure further; until then, any consumer mutation invalidates the run and produces no admitted receipt.

Persisting workstation paths in the receipt was rejected because they are neither stable provenance nor purpose-bound evidence and can expose local usernames, mounts, or project layout.

The decoded PCM digest does not by itself prove that two machines will decode a compressed source identically. It records the exact normalized signal used by one admission/consumer run. The preregistration already binds librosa/NumPy and the source/lock identity; if future production acceptance requires cross-decoder equivalence, the schema must explicitly bind the remaining decoder/backend contract rather than assuming it.

## Audio normalization authority

BandScope's registered structure input is mono at the registered sample rate. librosa 0.11.0 documents `load` as producing a floating-point time series, accepting file-like inputs, converting to mono when requested, and resampling to the requested `sr`; its documented default resampler is `soxr_hq`. The admission tool intentionally calls `librosa.load` without overriding `res_type`, so the decoder behavior is tied to the preregistered librosa version rather than duplicated in a second local normalization implementation.

MIREX 2025 Music Structure Analysis evaluates mono 44.1 kHz WAV input and uses frame-level functional-label accuracy plus boundary retrieval F-measures at 0.5 s and 3.0 s. Corpus admission does not claim those evaluation metrics; it only ensures that later metric computation can start from the same registered local bytes and exact decoded PCM identity.

## Test boundary

Unit tests use tiny synthetic byte fixtures and an injected decoder to exercise hash drift, runtime drift, symlink rejection, path non-disclosure, duplicate JSON keys, non-standard JSON numbers, case-insensitive Git/SHA-256 identity, source mutation after snapshot admission, exact PCM/annotation consumer handoff, and consumer-side annotation mutation detection. These fixtures are not production scientific evidence and do not satisfy #1225's rights-cleared real-music corpus requirement.

The handoff regression deliberately mutates the original annotation file after its process-owned snapshot has been created and requires the consumer to observe the admitted bytes, not the mutated path content. It also requires the consumer's PCM bytes to hash to the digest emitted in the receipt. A separate hostile-case regression writes directly through the borrowed annotation snapshot and requires admission to fail instead of emitting a receipt for post-hash annotation bytes.

## Remaining scientific work

A reviewed rights-cleared real corpus and independent annotation manifest are still required. Before candidate results are inspected, the actual aggregation, paired uncertainty, margins, latency threshold, dependence assumptions, claim boundary, and any failure/exclusion rule must be approved.

The next runner must execute through the in-process admitted-track consumer boundary, interpret the admitted annotation snapshot without mutating it, run CQT and STFT on the exact same read-only PCM, calculate the recognized MIREX/mir_eval track metrics and latency/memory measurements, and derive aggregate/CI evidence from the preregistered procedure rather than accepting caller-authored summaries. The standalone receipt is evidence for that run, not a license to reopen media after admission.

## References

- MIREX. (2025). *Music Structure Analysis*. International Music Information Retrieval Systems Evaluation Laboratory. https://music-ir.org/mirex/wiki/2025%3AMusic_Structure_Analysis
- McFee, B., et al. (2025). *librosa 0.11.0 documentation: Core IO and DSP*. https://librosa.org/doc/0.11.0/core.html

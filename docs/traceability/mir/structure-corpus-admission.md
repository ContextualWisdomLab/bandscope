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

`scripts/research/verify_structure_corpus.py` resolves a local manifest only at execution time. The manifest itself is admitted as bounded UTF-8 JSON from one already-open regular-file descriptor: size metadata comes from `fstat`, JSON bytes are read from that same descriptor with a 2 MiB cap, and pathname-level stat/read reopening is not used after resolution.

Runtime source identity is admissible only from a clean Git worktree. `git rev-parse HEAD` alone is insufficient because tracked, staged, or untracked non-ignored files can alter the code or imports used by a scientific run without changing `HEAD`. Admission therefore rejects any non-empty `git status --porcelain=v1 --untracked-files=all --ignore-submodules=none` before binding the registered source commit and `uv.lock` identity. Local corpus/manifest/output material must live outside the repository or be intentionally ignored if it is not source evidence.

For every registered track the admission tool:

- requires the manifest order and track IDs to exactly match the preregistered corpus;
- opens audio and annotation inputs as regular files without following symlinks where the platform provides `O_NOFOLLOW`;
- copies the opened audio stream into a process-owned temporary snapshot while computing the SHA-256, then compares that digest with the preregistration before decoding;
- snapshots and hashes annotation bytes from the opened annotation descriptor and compares them with the registered annotation identity;
- requires the clean current source commit, `uv.lock`, Python, librosa, and NumPy identities to match the registered runtime;
- treats Git commit and SHA-256 values as case-insensitive hexadecimal identities and emits them lowercase, matching the validator contract, while Python/librosa/NumPy version strings remain exact;
- decodes the immutable admitted audio snapshot through `librosa.load(..., sr=<registered>, mono=True)`, converts it to canonical little-endian float32, and computes a PCM SHA-256;
- requires every decoder implementation to expose the exact decoded PCM bytes together with its claimed digest and frame count. Admission recomputes the digest and mono-float32 frame count from that byte sequence, rejects a digest-only decoder receipt or any inconsistency, rejects NaN and positive/negative infinity in the decoded float32 signal, and copies the sequence into immutable `bytes` before the callback boundary;
- optionally invokes an in-process `track_consumer` only after both registered audio and annotation identities have passed. The callback receives a read-only `memoryview` over the immutable PCM bytes and another read-only `memoryview` over immutable admitted annotation bytes, plus track ID and sample rate. It receives no workstation path and has no write capability over either scientific input;
- emits only registration identity, runtime identity, content digests, decoded PCM digest/frame count, sample rate, channel count, and track ID. Local audio/annotation paths are never copied into the receipt.

The standalone CLI still writes only the path-free receipt. A scientific runner that claims "same admitted PCM" must use the in-process consumer boundary, or a future equivalently strong content-addressed handoff, rather than reading the receipt and reopening source paths afterward.

The tool does not calculate MIR metrics, aggregate tracks, estimate uncertainty, or make a noninferiority decision. Those remain separate scientific steps. A passing corpus-admission receipt is therefore necessary evidence for a run, not sufficient evidence for a production representation change.

## RED -> GREEN lineage

The initial implementation `83e59f220eba26272840f3f901cdaaf50d86d3c2` hashed an opened audio descriptor and decoded that same live descriptor. Hostile review found that pathname substitution was prevented but same-inode byte mutation between hash and decode was not.

RED `1f653439a31b27ff905dd2e825a99f79188598d6` required post-admission source mutation not to change decoder input. GREEN `47184b8aa8bff7a0405d30ef79a6274e64e9d483` moved decode onto a process-owned snapshot created while hashing. `f28764fc20322a1405e730245185cc8dba12f888` made the mutation regression portable across Windows and POSIX.

A second gap remained: the verified normalized PCM was destroyed before any scientific consumer could use it. RED `af927bbd429647f5cb655ec488ea6e7f16f8a7a2` requires a consumer to receive the exact admitted PCM and annotation snapshot, and verifies that mutating the original annotation path after admission cannot change what the consumer reads. GREEN `813dd925ec80d66e23a57c03ff52c143d569f9c7` exposes that in-process handoff while preserving the path-free durable receipt and legacy hash-only verifier use.

That handoff initially exposed the process-owned annotation snapshot as a writable `BinaryIO`. RED `1e5aa12bd4965cfc709e35a626fa5727397c9a6d` required persistent mutation to invalidate admission, and GREEN `61a74d6753f58069f4ff91c910dd237bd21c98fc` re-hashed the snapshot after the callback. Hostile review found that this was still not an integrity boundary: a consumer could mutate annotation bytes, calculate metrics from the modified content, then restore the original bytes before returning, causing the post-callback digest to match while the measurements were already contaminated.

RED `59cb9dc4c41b4208a0c6e25d9365e924061c98a7` therefore requires the consumer-facing annotation object itself to be intrinsically read-only and exercises the mutate/use/restore attack shape. GREEN `62d7d0b601503e5f83b872d8bd3f6ac202da95fc` removes write capability from the callback boundary by passing a `memoryview` over immutable admitted annotation `bytes` instead of the temporary writable handle. `4da0bd97b761dd7d098041daec7a32f7606840f4` updates the end-to-end handoff regression to consume those immutable bytes while still proving that later mutation of the workstation annotation path cannot affect the admitted input.

A parallel PCM capability gap remained. The default decoder marked its NumPy array read-only, but the consumer boundary accepted whatever `memoryview` the decoder returned and trusted the decoder-supplied digest. A custom or future decoder could expose a mutable buffer, or report a digest that did not describe the bytes actually handed to CQT/STFT. RED `e6a62f393daf5ca1fb7e44271777dbac6f1956e1` requires the PCM handoff to be immutable even when the decoder owns mutable memory and requires admission to reject a decoder digest that disagrees with the handoff bytes. GREEN `5b0660e49e4d01246cafeea988e2b8c222713be9` recomputes SHA-256 and mono-float32 frame count from the exact exposed PCM, then copies it into immutable `bytes` before any scientific consumer runs.

That repair still preserved a digest-only compatibility path: an injected decoder could return only `(decoded_pcm_sha256, decoded_frames)`, in which case admission emitted those caller-claimed values without ever seeing the PCM bytes. That meant a path-free receipt could claim a normalized signal identity that admission had no way to verify. RED `cd4818ff329a5214a152ec0a485b50177498b2e1` requires such a decoder to fail even when no `track_consumer` is configured. Fixture alignment `f6085084721478c4440eb723487e1696e8087a99` makes the successful injected decoder expose its synthetic PCM. GREEN `4bd685ad500b53bb0a4d70da35139fd92a2aaa35` removes the digest-only decoder contract: every admitted receipt now derives its PCM digest and frame count from the exact exposed bytes before it can be emitted.

A further scientific-validity gap remained after byte identity was bound. Any four-byte-aligned payload can be interpreted as float32, including NaN and positive or negative infinity. Such a signal can have a perfectly matching SHA-256 and frame count while making downstream spectral features or MIR metrics non-finite, so byte integrity alone is not sufficient signal admissibility. RED `f453e9b8152e36590ed73afbb3d41c8b41e81ed9` injects each IEEE-754 non-finite class and requires failure before the measurement callback can run. GREEN `c87d9806d960ee6c1200d0be3c9e65a3c893453c` interprets the exact immutable little-endian float32 handoff and requires `numpy.isfinite(...).all()` before evidence is emitted or measurement begins. `acf7adf54342a2d29afa85947bd06c22af8b6ac1` only normalizes the regression formatting for the repository's Ruff gate.

The manifest loader had a separate pathname TOCTOU: it called `Path.stat()` for the 2 MiB admission decision and then reopened the path with `Path.read_text()`. A rename or replacement between those calls could make the bounded metadata and parsed bytes refer to different files. RED `106d4e37e98a76f48f73db1ba1854209de873040` requires both size and JSON bytes to come from one already-open descriptor without pathname stat/read reopening. GREEN `ad5daf36a51b3db859ec25475b883c101a89a28e` now uses the regular-file admission helper, `fstat`, and a bounded descriptor read, with a second byte-count guard for concurrent growth.

Source identity then exposed a different reproducibility gap. `git rev-parse HEAD` can report the registered commit while the worktree contains modified or additional executable source. RED `986170737dc3b1a11a04abf47b90a868e93362e7` creates an isolated Git repository, modifies a tracked analysis file after commit, and requires runtime admission to reject it. GREEN `4e8f3fa277a411a45f012daa5083f9ea5193cd17` requires a clean porcelain status before the source commit can enter the receipt.

Earlier RED `f3abb6489836fd775cf67ae48cdc2c320f64a518` -> GREEN `174c6d33b44ef8e20e7e923ad638d7489442a460` aligned runtime identity with the evidence validator by comparing Git commit and SHA-256 fields as case-insensitive hexadecimal identities while keeping version strings exact.

## Constraints and rejected alternatives

Dereferencing `source_uri` was rejected. Provenance URI is evidence metadata and may identify licensed material that cannot be fetched by CI. Network retrieval would also turn a local-first experiment into a mutable external dependency.

Checking manifest size by pathname and then reopening the pathname for JSON was rejected. Size admission and parsed bytes must describe the same opened regular file. The loader therefore resolves once, uses descriptor metadata, and reads at most the configured limit plus one byte from that descriptor.

Treating `HEAD` as sufficient source evidence while allowing a dirty worktree was rejected. The registered commit must describe the source actually executed. Uncommitted tracked changes, staged changes, and untracked non-ignored files therefore fail admission rather than being silently attributed to the registered commit.

Hashing an opened source descriptor and then decoding that still-live source descriptor was rejected. A pathname cannot be swapped once the descriptor is open, but another writer can still change the underlying regular-file bytes between the hash and decode. Admission therefore snapshots the source bytes while hashing and decodes only that process-owned snapshot.

Treating the durable receipt as the experiment input was rejected. The receipt proves identities but does not contain the admitted signal or annotations. Reopening source paths from a later process would create a second admission event and sever the claim that baseline and candidate consumed the exact PCM whose digest is recorded. The current safe boundary is therefore in-process consumption during admission; a future persistent artifact bundle would need its own atomic, content-addressed and resource-bounded contract before it could replace this boundary.

Re-hashing a writable annotation handle only after consumer execution was rejected as insufficient. Integrity-after-return does not prove integrity-during-measurement: a consumer can mutate, use, and restore bytes before the check. The callback therefore receives an immutable `bytes`-backed read-only `memoryview`, so the capability to alter annotation evidence is absent rather than detected after the fact.

Trusting a decoder-supplied PCM digest or a read-only flag on decoder-owned memory was rejected. A scientific receipt must identify the bytes actually given to the measurement code, and the consumer must not be able to recover a mutable backing object. Admission therefore derives the digest/frame count from the exposed byte sequence and crosses the consumer boundary only after copying it into immutable `bytes`.

Retaining a digest-only decoder compatibility path was rejected for the same reason. A decoder-provided SHA-256 string is not evidence of decoded PCM identity unless admission can recompute it from the bytes that were actually produced. Decoder implementations used for scientific admission must therefore expose the PCM byte sequence even when the standalone caller only wants a durable receipt and no measurement callback.

Treating byte-aligned PCM as scientifically admissible solely because its digest and frame count match was rejected. IEEE-754 float32 includes non-finite values; those bytes are structurally valid floats but are not valid measurement input for this experiment because they can contaminate spectral features and paired metrics. Admission therefore rejects NaN and both infinities before the consumer is invoked. It does not impose clipping or amplitude normalization, which would change the signal rather than validate it.

Persisting workstation paths in the receipt was rejected because they are neither stable provenance nor purpose-bound evidence and can expose local usernames, mounts, or project layout.

The decoded PCM digest does not by itself prove that two machines will decode a compressed source identically. It records the exact normalized signal used by one admission/consumer run. The preregistration already binds librosa/NumPy and the source/lock identity; if future production acceptance requires cross-decoder equivalence, the schema must explicitly bind the remaining decoder/backend contract rather than assuming it.

## Audio normalization authority

BandScope's registered structure input is mono at the registered sample rate. librosa 0.11.0 documents `load` as producing a floating-point time series, accepting file-like inputs, converting to mono when requested, and resampling to the requested `sr`; its documented default resampler is `soxr_hq`. The admission tool intentionally calls `librosa.load` without overriding `res_type`, so the decoder behavior is tied to the preregistered librosa version rather than duplicated in a second local normalization implementation.

MIREX 2025 Music Structure Analysis evaluates mono 44.1 kHz WAV input and uses frame-level functional-label accuracy plus boundary retrieval F-measures at 0.5 s and 3.0 s. Corpus admission does not claim those evaluation metrics; it only ensures that later metric computation can start from the same registered local bytes and exact decoded PCM identity.

## Test boundary

Unit tests use tiny synthetic byte fixtures and an injected decoder to exercise bounded single-descriptor manifest loading, clean-source identity, hash drift, runtime drift, symlink rejection, path non-disclosure, duplicate JSON keys, non-standard JSON numbers, case-insensitive Git/SHA-256 identity, source mutation after snapshot admission, exact PCM/annotation consumer handoff, intrinsic annotation immutability, mutable-decoder PCM confinement, decoder-digest mismatch rejection, digest-only decoder rejection, and NaN/positive-infinity/negative-infinity PCM rejection. These fixtures are not production scientific evidence and do not satisfy #1225's rights-cleared real-music corpus requirement.

The handoff regression deliberately mutates the original annotation file after its process-owned snapshot has been created and requires the consumer to observe the admitted bytes, not the mutated path content. The annotation hostile case makes writes fail at the boundary instead of relying on a later digest comparison. The PCM hostile cases start from mutable decoder-owned memory, from a deliberately false decoder digest, from a decoder that withholds the PCM bytes entirely, and from byte-identical non-finite float32 samples; admission must convert exposed PCM to immutable bytes, reject a false digest, reject an unverifiable digest-only receipt, and reject non-finite measurement input before any scientific evidence or callback execution occurs.

## Remaining scientific work

A reviewed rights-cleared real corpus and independent annotation manifest are still required. Before candidate results are inspected, the actual aggregation, paired uncertainty, margins, latency threshold, dependence assumptions, claim boundary, and any failure/exclusion rule must be approved.

The next runner must execute from the exact clean registered source/lock identity through the in-process admitted-track consumer boundary, interpret the admitted read-only annotation bytes, run CQT and STFT on the exact same immutable finite PCM, calculate the recognized MIREX/mir_eval track metrics and latency/memory measurements, and derive aggregate/CI evidence from the preregistered procedure rather than accepting caller-authored summaries. The standalone receipt is evidence for that run, not a license to reopen media after admission.

## References

- MITRE. (2026). *CWE-367: Time-of-check Time-of-use (TOCTOU) Race Condition*. https://cwe.mitre.org/data/definitions/367.html
- MIREX. (2025). *Music Structure Analysis*. International Music Information Retrieval Systems Evaluation Laboratory. https://music-ir.org/mirex/wiki/2025%3AMusic_Structure_Analysis
- McFee, B., et al. (2025). *librosa 0.11.0 documentation: Core IO and DSP*. https://librosa.org/doc/0.11.0/core.html

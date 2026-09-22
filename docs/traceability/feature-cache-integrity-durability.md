# Reusable feature-cache integrity, durability, admission, and MIR generation

## Scope

This note covers the derived local-audio feature cache written as a compressed NumPy stem archive plus a JSON manifest. It does not make the cache a Resource Admission authority and it does not make cached stems scientific ground truth. Native Resource Admission remains authoritative for the admitted source byte count and SHA-256; Signal/MIR Analysis owns the scientific separation generation; Project Persistence owns durable publication and cache reuse policy.

## Problem

The earlier feature cache wrote `*.features.npz.tmp` and `*.features.json.tmp`, then renamed the arrays file and the metadata file. The manifest did not contain a digest of the exact NPZ bytes and did not carry the native admitted-audio identity. A valid-looking NPZ with the expected stem keys could therefore be substituted under an existing manifest and still be reused. The two pathname replacements also did not establish the same file-sync and directory-entry durability boundary already required for final rehearsal-result publication.

The integrity repair then exposed a second boundary: locally replaceable cache artifacts were still admitted through unbounded `json.load`, an unbounded NPZ digest pass, and NumPy allocation after only structural member-name checks. Python JSON decoding also permits duplicate object names unless the caller rejects them. A malicious or corrupted cache could therefore turn a disposable optimization into excessive read/parse/allocation work or ambiguous last-key-wins metadata.

After those repairs, cache equivalence still depended on source identity and artifact integrity alone. The same admitted audio could reuse stems after a BandScope separation-code change, a Demucs/torch runtime change, or a configured `htdemucs` checkpoint-generation change. Integrity answers “are these the same cached bytes?”; it does not answer “were these bytes produced by the same scientific computation?”

That distinction matters for a rehearsal decision tool. A reusable cache may skip expensive MIR work, but it must not silently carry a prior model/runtime generation across a scientifically material change.

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

Cache reuse is now also bound to a versioned MIR generation. `admitted_audio_cache_identity()` still consumes native source byte-count/SHA-256 evidence rather than recomputing source identity, but its cache-only envelope additionally includes `mirGeneration` from Signal/MIR Analysis. That generation records:

- BandScope separation implementation generation;
- model name and canonical checkpoint filename;
- checkpoint signature and encoded checksum prefix parsed by the existing Demucs model-admission owner;
- installed Demucs and torch distribution versions;
- production default target sample rate, overlap, and device.

The generation adapter reads the checkpoint mapping and parser from the existing `audio_separator` owner rather than copying model identifiers into Project Persistence. Installed package versions come from `importlib.metadata.version()` without importing the heavy ML runtimes. If required distribution metadata or a canonical checkpoint identity is unavailable, cache identity construction fails closed and reuse is disabled. The final-result analysis generation is advanced at the same boundary so final rehearsal-result reuse cannot outlive a separation-generation change either.

If NPZ publication succeeds but manifest publication fails, an older manifest cannot authorize the new arrays unless the bytes are exactly identical, because its digest must still match. A missing or rejected manifest is a cache miss. This is deliberate fail-closed behavior; the feature cache is derived and recomputable.

The NPZ digest is a derived-artifact integrity binding, and `mirGeneration` is a cache-equivalence discriminator. Neither becomes a second source-admission authority.

## Alternatives rejected

- **Path/size-only reuse:** rejected because neither identifies the admitted source bytes nor the stem archive bytes.
- **Source SHA-256 + NPZ SHA-256 as scientific equivalence:** rejected because identical input and cached bytes do not identify the code/model/runtime generation that produced those bytes.
- **Bind only the string `htdemucs`:** rejected because package runtime, checkpoint generation, and BandScope implementation changes can alter the computation while keeping that model alias.
- **Use the full checkpoint digest on every cache hit:** rejected for this cache-admission slice because model admission already verifies the canonical checksum prefix before inference and repeated full-checkpoint hashing would move release provenance work into the hot reuse path. Full release digest/signature provenance remains Distribution evidence.
- **Import torch/Demucs to discover versions before every cache hit:** rejected. Installed distribution metadata supplies the version strings without executing heavyweight runtime imports or extension loading.
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
- `efcffad68c5f0e1af4f14729bc7e063d9ce5bc82` — executable RED proving cache identity did not yet bind MIR generation and did not fail closed when that generation was unavailable.
- `33ebea0219e0341dd574af395b1b6b4c93d888d5` — canonical separation-generation adapter consumes the existing checkpoint owner and installed Demucs/torch package metadata without loading the ML runtime.
- `3b1c2378abfad1a08f0e20e22617bbc06447b283` — Project Persistence cache identity adopts that generation, advances the final-result analysis generation, and treats missing MIR generation as a cache-disable condition.
- `f17051f8e2fe9fc2b2857232573f617f12d4da44` — edge coverage for canonical generation composition plus missing/malformed checkpoint and missing-runtime-metadata failure paths.

Hosted exact-head checks remain authoritative. These commits are source evidence, not protected or release evidence.

## Security Notes

### Attack surface

The reusable feature cache admits locally replaceable JSON and ZIP/NPY bytes and also consumes version/model-generation metadata that decides whether expensive MIR work may be skipped. Local corruption, stale recovery residue, or deliberate replacement can therefore target parsing/allocation cost, cache identity, or derived-audio reuse without modifying the original admitted audio.

### Trust boundary

Native Resource Admission remains the sole authority for source byte count and SHA-256. Signal/MIR Analysis owns the separation/model generation. Project Persistence owns only durable publication, bounded admission, exact derived-byte integrity, and reuse policy. Neither the NPZ digest nor `mirGeneration` is source authenticity or scientific-accuracy authority.

### Mitigations

Manifest and NPZ admission is bounded and regular-file-only, rejects duplicate JSON keys, limits archive/stem cardinality and declared bytes, preflights NPY headers before NumPy allocation, keeps `allow_pickle=False`, validates finite floating-point stems, and binds archive digest/load to one opened descriptor. Publication is arrays-first/manifest-last through the existing durable publication owner. Reuse fails closed when native source evidence, exact derived-byte integrity, or MIR generation evidence is missing or mismatched.

### Test points

Regression coverage includes native source binding, exact NPZ-byte binding, publication order/failure, duplicate-key rejection, manifest/archive byte ceilings, exact ZIP member sets, oversized NPY shape declarations before allocation, malformed role metadata, canonical MIR generation composition, malformed/missing checkpoint identity, missing package metadata, and final-result propagation of the same generation identity.

### Realistic threats

Realistic threats include local replacement of cache artifacts, partial cache recovery after a crash or downgrade, archive/header values crafted to trigger excessive work, stale stems surviving a code/model/runtime change, and path replacement between validation steps. Same-descriptor admission, resource ceilings, generation binding, and fail-closed recomputation address these cases without trusting cache location or filenames.

### Remaining risk

The current generation identity prevents reuse across the declared BandScope separation generation, canonical checkpoint filename/signature/checksum prefix, installed Demucs/torch versions, target sample rate, overlap, or device. It is not full checkpoint release provenance and does not prove MIR accuracy. Full checkpoint digest/signature/acquisition provenance/rights, packaged SBOM linkage, rights-cleared real decoded audio metrics, and destructive packaged Windows/macOS crash/power-loss/disk-full evidence remain release/scientific acceptance work.

## Remaining scientific/release boundary

The current generation identity is sufficient to prevent reuse across a changed BandScope separation generation, canonical checkpoint filename/signature/checksum prefix, installed Demucs/torch version, target sample rate, overlap, or device. It is **not** release provenance for the checkpoint bytes. `AudioStemSeparator` verifies that the local checkpoint's full SHA-256 begins with the checksum prefix encoded by `955717e8-8726e21a.th`, but immutable release evidence still needs the full checkpoint digest/signature, acquisition provenance, license/rights record, and package/SBOM linkage.

Scientific acceptance also remains distinct from cache identity. Rights-cleared real decoded audio must demonstrate recognized source-separation/MIR metrics, uncertainty and claim boundaries, and reproducibility on the packaged Windows/macOS paths. A feature-cache hit now means “same admitted source + same declared MIR generation + same admitted derived bytes”; it still does not by itself prove accuracy.

Packaged Windows/macOS power-loss, disk-full, and fault-injection acceptance also remains release evidence. Unit/integration tests cannot substitute for that destructive packaged-build evidence.

## Primary implementation and scientific references

Python Software Foundation. (2026). *importlib.metadata — Accessing package metadata*. Python documentation. https://docs.python.org/3/library/importlib.metadata.html

Python Software Foundation. (2026). *json — JSON encoder and decoder*. Python 3 documentation. https://docs.python.org/3/library/json.html

Python Software Foundation. (2026). *os — Miscellaneous operating system interfaces: `os.fsync`*. Python 3 documentation. https://docs.python.org/3/library/os.html#os.fsync

Python Software Foundation. (2026). *zipfile — Work with ZIP archives*. Python 3 documentation. https://docs.python.org/3/library/zipfile.html

Microsoft. (2024). *MoveFileExW function (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/windows/win32/api/winbase/nf-winbase-movefileexw

NumPy Developers. (2026). *Input and output: NumPy binary files (`npz`)*. NumPy reference. https://numpy.org/doc/stable/reference/routines.io.html

NumPy Developers. (2026). *numpy.load*. NumPy reference. https://numpy.org/doc/stable/reference/generated/numpy.load.html

Rouard, S., Massa, F., & Défossez, A. (2023). Hybrid Transformers for music source separation. In *ICASSP 2023 - 2023 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)*. IEEE. https://arxiv.org/abs/2211.08553

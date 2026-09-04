# Playable stem native admission traceability

- **Status:** Draft implementation evidence; not a release or acceptance claim
- **Date:** 2026-09-04
- **Bounded contexts:** Source Separation → Native Resource Admission → Active Player
- **Source implementation head before this documentation update:** `feat/playable-stem-native-contract-961@85c474c177306b13fc54eda76fecb517cdcd7801`
- **Parent publication owner:** PR #1159, `22a9f18d960cc7df93db890b2a5aa9594428c2b4`
- **Canonical playback owner:** PR #971, `9c1b20e6df778e303fada3e170c93418c496394b`
- **Decision:** ADR-0001 remains **Proposed** until the source-to-audible acceptance criteria are executable on one current stack.

## Problem and trust boundary

The analysis process can publish four real mono PCM16 WAV files and return a path-free artifact reference. That reference proves only that the producer reported an artifact identity, byte length, media metadata, and SHA-256 value. It is not authority to read or serve a native path.

The native boundary derives the only permitted locations from the already-authorized project temporary root:

```text
{project_temp_root}/playable-stems-v1/{artifact_set_id}/vocals.wav
{project_temp_root}/playable-stems-v1/{artifact_set_id}/bass.wav
{project_temp_root}/playable-stems-v1/{artifact_set_id}/drums.wav
{project_temp_root}/playable-stems-v1/{artifact_set_id}/other.wav
```

No path returned by the Python subprocess is accepted. Native paths, hashes and file identities do not cross into renderer analysis status. The existing `bandscope-playback` authority remains the only media-serving authority; stem support extends that authority rather than creating a second transport store.

## Implemented native admission and authority binding

`apps/desktop/src-tauri/src/playable_stem_admission/` performs a fail-closed preflight. The current implementation checks:

- an absolute project temp root and plain, non-symlink/non-reparse owned directory chain;
- exact artifact-set directory membership: `vocals.wav`, `bass.wav`, `drums.wav`, `other.wav`, with no additional entry;
- regular-file and canonical containment checks for every derived artifact path;
- expected byte length on path metadata and the opened file;
- canonical BandScope producer layout: RIFF/WAVE, a 16-byte PCM `fmt ` chunk, PCM format tag 1, one channel, expected sample rate, byte rate, block alignment, 16 bits per sample, immediate `data` chunk, and the contract-derived sample/data length;
- streaming SHA-256 over the complete opened file;
- unchanged file length after hashing;
- complete four-stem success before a set value is returned;
- native file identity captured from the same opened file after header/hash verification.

The 44-byte layout is deliberately a **BandScope producer contract**, not a claim that every valid WAVE file has a 44-byte header. RIFF is chunk-based and permits other chunk arrangements. BandScope can be stricter because PR #1159 owns the producer and Python's `wave` writer emits the canonical PCM layout consumed by this internal contract.

Native file identity is now one shared desktop primitive in `native_file_identity.rs`. Unix uses device/inode plus ctime; Windows uses volume serial, file index and last-write time from the opened handle. `playable_stem_admission` and the pre-existing full-mix playback authority both consume that primitive. This avoids a second, divergent identity implementation.

`PlaybackAuthority` now keeps the full mix and an optional complete four-stem map under the same revocation mutex. When a local-audio analysis is queued, `begin_stem_analysis(project_id, job_id)` makes that job the only generation allowed to register stems and clears any older generated set. A successful terminal analysis can retain its native artifact reference, preflight it against the request-owned temp root, and call `activate_stems(project_id, job_id, preflight)`.

`activate_stems` first constructs all four canonical source authorities from preflighted path/size/identity values, then takes the existing playback-authority lock and installs the complete set only if the current project and latest-analysis job token still match. A partial set cannot be registered. A stale same-project analysis cannot overwrite a newer generation. Project/source replacement revokes the full mix, generation token and prior stems together.

The JSONL worker now transports one validated `AnalysisProcessStatus` envelope per update instead of splitting renderer status and stem metadata into independent channels. The native worker retains the whole newest envelope while emitting only its renderer-safe `AnalysisJobStatus`. Authority binding consults `playableStemArtifactSet` only on that exact final retained envelope. A later succeeded status without stem metadata therefore replaces an earlier succeeded-with-stems envelope and cannot leave the earlier native reference eligible for binding.

The custom protocol accepts only opaque native tokens:

```text
/{project_id}
/{project_id}/stem/vocals
/{project_id}/stem/bass
/{project_id}/stem/drums
/{project_id}/stem/other
```

Every serve reopens the canonical path and compares current native file identity with the identity captured during admission. Same-size replacement after preflight therefore fails closed rather than inheriting the old authority. No native path is embedded in the renderer-visible handle.

A stem preflight or authority-binding failure deliberately does **not** turn an otherwise valid rehearsal analysis/full mix into a failed analysis. The buyer still has the full-mix rehearsal result; unavailable stems remain unavailable.

## SHA-256 decision

The Tauri lock graph already contains `sha2` transitively, but `bandscope-desktop` does not declare it as a direct dependency. Depending on an undeclared transitive crate or hand-editing `Cargo.lock` would make dependency ownership and reproducibility ambiguous.

For this preflight increment, the native admission module therefore owns a small private streaming SHA-256 implementation whose operations and constants follow FIPS 180-4. Tests include the empty message, `abc`, the longer standard message, the million-`a` vector, multi-block interrupted short reads, and reader-error propagation. These are implementation-correctness checks only. NIST explicitly states that use of CAVP test vectors does **not** replace CAVP validation; BandScope therefore makes no CAVP, FIPS 140, or validated-cryptographic-module claim from these tests.

**Removal condition:** replace the private implementation if BandScope adopts a reviewed direct Rust SHA-256 dependency through normal Cargo resolution and exact-head parity tests show identical complete-file digests without weakening the admission boundary. The lockfile must be generated by Cargo, not edited manually.

## Standards and evidence mapping

| Evidence | BandScope decision | Current executable evidence |
| --- | --- | --- |
| NIST FIPS 180-4 SHA-256 | Complete-file content identity uses SHA-256; implementation follows the specified SHA-256 operations/constants. | Native known-answer/unit tests in `playable_stem_admission/sha256.rs`; hosted exact-head receipt is still absent. |
| NIST CAVP Secure Hashing | Test vectors may informally check correctness but do not confer validation. | Documentation and module rustdoc explicitly prohibit a CAVP/FIPS validation claim. |
| RIFF/WAVE chunk model | Verify `RIFF`/`WAVE`, `fmt ` and `data` semantics and RIFF size relationships. | `validate_wave_header` plus malformed-header unit test. |
| BandScope path-free contract | Python metadata cannot choose a path; native derives fixed locations. | `PlayableStemArtifactSetReference::derive_artifact_path` plus native exact-membership/containment checks. |
| BandScope single playback authority | Stem files extend the current revocable authority instead of creating another transport store. | Shared native identity primitive, latest-job token, atomic four-stem map, opaque protocol routes, replacement-revocation tests. |
| Exact final process envelope | Native artifact metadata must belong to the same final status returned to the renderer. | `retain_latest_process_status` regression covers succeeded-with-stems followed by succeeded-without-stems; `run_analysis_engine` channels whole envelopes. Hosted exact-head receipt is still absent. |

## Threat cases and current result

| Threat / defect | Current result | Remaining risk |
| --- | --- | --- |
| Extra file in artifact-set directory | Rejected before any set result is returned. | Hosted Windows/macOS exact-head evidence is still required. |
| Symlinked stem | Rejected on Unix test path; Windows reparse attribute is rejected in production code. | Windows exact-head executable evidence is still required. |
| Same-size content replacement before preflight | Complete-file SHA-256 mismatch rejects it. | None at the metadata/hash boundary; exact-head execution is still required. |
| Same-size path replacement after preflight | Reopened file identity differs and serving fails with `GONE`. | In-place mutation semantics still depend on the platform identity primitive and need exact-head platform evidence. |
| Older same-project analysis finishes after a newer job | `job_id` generation token prevents the older result from replacing the newer stem set. | Exact-head executable evidence is still required. |
| Earlier succeeded status has stems, later succeeded status does not | Whole-envelope replacement means only the final status can contribute a stem reference. | Exact-head executable evidence is still required. |
| Non-empty malformed/unknown JSONL status after a valid status | `parse_analysis_process_status` rejects that line, but the worker currently skips parser failures and can retain the previous valid envelope. | Native worker must propagate parser failure so malformed producer output cannot fall back to earlier status. |
| Partial four-stem publication | Exact directory membership, all-four preflight and atomic authority installation prevent partial registration. | Renderer selector has not shipped. |
| Project/source replacement | One authority replacement revokes full mix, pending stem token and generated stems together. | Reopened-project persistence/recovery remains the #962 boundary. |
| Renderer path disclosure | Analysis status strips native metadata and playback protocol uses project/stem tokens only. | The UI contract must continue to consume opaque handles only. |

## Current RED and acceptance boundary

The exact-final-status stale-reference defect is repaired in production source, but the source-to-native-authority path is not GREEN.

First, `run_analysis_engine` still uses `if let Ok(process_status) = parse_analysis_process_status(...)` and silently skips a non-empty JSONL line that fails strict parsing. If a malformed or future producer emits a valid succeeded envelope and then an invalid status before exiting successfully, the worker can still retain and return the earlier valid envelope. The next minimal causal repair is to propagate parser failure through the stdout reader and fail the native analysis response rather than falling back to an earlier envelope. Empty lines can remain ignorable; invalid non-empty JSONL must not be.

Second, no shipped source selector yet exposes `Full mix | Vocals | Bass | Drums | Other instruments`. The next buyer-visible slice must use opaque handles from the existing protocol and verify source changes without resetting rehearsal position/range semantics, then cover pointer, touch, keyboard and screen-reader behavior, selection persistence/reload/stale race, and rights-cleared audible macOS/Windows behavior.

Third, the stacked exact head has no hosted pull-request workflow run. Source-level RED/GREEN commits and unit contracts cannot substitute for current-head Rust format/test/Clippy/coverage, repository/central CI/security/SAST/dependency/SBOM/package/release/review evidence. ADR-0001 therefore stays Proposed and this PR stays Draft.

## References

Microsoft. (2021, January 7). *Resource Interchange File Format (RIFF).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/xaudio2/resource-interchange-file-format--riff-

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS) (FIPS PUB 180-4).* U.S. Department of Commerce. https://doi.org/10.6028/NIST.FIPS.180-4

National Institute of Standards and Technology. (2026, August 12). *Cryptographic Algorithm Validation Program: Secure hashing.* https://csrc.nist.gov/projects/cryptographic-algorithm-validation-program/secure-hashing

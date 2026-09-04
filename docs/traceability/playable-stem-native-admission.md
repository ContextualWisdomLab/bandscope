# Playable stem native admission traceability

- **Status:** Draft implementation evidence; not a release or acceptance claim
- **Date:** 2026-09-04
- **Bounded contexts:** Source Separation → Native Resource Admission → Active Player
- **Implementation source head before this documentation update:** `feat/playable-stem-native-contract-961@810c4b88d8186c083363e068dc7b67acd0ce1c60`
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

Native file identity is one shared desktop primitive in `native_file_identity.rs`. Unix uses device/inode plus ctime; Windows uses volume serial, file index and last-write time from the opened handle. `playable_stem_admission` and the pre-existing full-mix playback authority both consume that primitive rather than maintaining divergent identity implementations.

`PlaybackAuthority` keeps the full mix and an optional complete four-stem map under the same revocation mutex. When local-audio analysis is queued, `begin_stem_analysis(project_id, job_id)` makes that job the only generation allowed to register stems and clears an older generated set. `activate_stems(project_id, job_id, preflight)` constructs all four canonical source authorities before taking the authority lock, then installs the complete set only when the current project and latest-analysis job token still match. Project/source replacement revokes full mix, generation token and generated stems together.

The JSONL worker transports one validated `AnalysisProcessStatus` envelope per update. It retains the complete newest native envelope and exposes only renderer-safe `AnalysisJobStatus`. During subprocess execution, only genuine `queued` and `running` producer updates are stored/emitted as progress. Producer `succeeded` and `failed` envelopes are retained natively but withheld from the renderer until process exit, complete stdout validation, final-job/state validation, and—when applicable—stem preflight/authority binding have finished. The outer analysis worker remains the single terminal `store_status_and_emit` owner.

The process stream reads `playableStemArtifactSet` only from the exact final retained envelope. A later succeeded status without stem metadata therefore replaces an earlier succeeded-with-stems envelope. The process contract also fails closed on malformed non-empty JSONL, reader errors, producer job-ID mismatch, contradictory state payloads, absence of a final status, and successful process exit whose final state is still `queued` or `running`. Whitespace-only JSONL separators remain ignorable. A `succeeded` status requires a result and no error; a `failed` status requires an error and no result; `queued`/`running` may carry neither. These invariants are checked before producer status can be accepted for the requested native job.

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
| Exact final process envelope | Native artifact metadata must belong to the same final status returned to the renderer. | Whole-envelope retention regression plus production `run_analysis_engine` coupling. Hosted exact-head receipt is still absent. |
| Fail-closed JSONL/job contract | Invalid non-empty JSONL, mismatched job identity, contradictory state payloads and nonterminal final output are not accepted as a successful native process result. | `analysis_process_status` and `analysis_process_contract` Rust regressions; production stdout reader propagates parse/identity failure. Hosted exact-head receipt is still absent. |
| Terminal-event ordering | Producer terminal states are not buyer-visible until subprocess exit and complete stream validation. | `only_nonterminal_status_is_renderer_progress` plus production `drain_analysis_process_status_updates` gating; hosted exact-head receipt is still absent. |

## Threat cases and current result

| Threat / defect | Current result | Remaining risk |
| --- | --- | --- |
| Extra file in artifact-set directory | Rejected before any set result is returned. | Hosted Windows/macOS exact-head evidence is still required. |
| Symlinked stem | Rejected on Unix test path; Windows reparse attribute is rejected in production code. | Windows exact-head executable evidence is still required. |
| Same-size content replacement before preflight | Complete-file SHA-256 mismatch rejects it. | None at the metadata/hash boundary; exact-head execution is still required. |
| Same-size path replacement after preflight | Reopened file identity differs and serving fails with `GONE`. | In-place mutation semantics still depend on the platform identity primitive and need exact-head platform evidence. |
| Older same-project analysis finishes after a newer job | `job_id` generation token prevents the older result from replacing the newer stem set. | Exact-head executable evidence is still required. |
| Earlier succeeded status has stems, later succeeded status does not | Whole-envelope replacement means only the final status can contribute a stem reference. | Exact-head executable evidence is still required. |
| Non-empty malformed/unknown JSONL status after a valid terminal status | Reader returns a process-contract error; the native result becomes failed, and the earlier producer terminal state was never emitted to the renderer. | Exact-head executable evidence is still required. |
| Status for another job ID | Rejected before storage/emission by the native stdout reader. | Exact-head executable evidence is still required. |
| Process exits successfully with queued/running final status | Rejected as an invalid native response. | Exact-head executable evidence is still required. |
| Contradictory succeeded/failed/result/error payload | Rejected by strict process-status semantics even without stem metadata. | Exact-head executable evidence is still required. |
| Partial four-stem publication | Exact directory membership, all-four preflight and atomic authority installation prevent partial registration. | Renderer selector has not shipped. |
| Project/source replacement | One authority replacement revokes full mix, pending stem token and generated stems together. | Reopened-project persistence/recovery remains the #962 boundary. |
| Renderer path disclosure | Analysis status strips native metadata and playback protocol uses project/stem tokens only. | The UI contract must continue to consume opaque handles only. |

## Current RED and acceptance boundary

The native process/file-admission and terminal-ordering source contracts are now connected, but the source-to-audible vertical is not GREEN. Hosted exact-head Rust format/test/Clippy/coverage and repository/central gates have not yet established current-head executable evidence for this stacked branch, so source-level regressions and source inspection are non-passing evidence.

The next buyer-visible gap is the source selector: no shipped control yet exposes `Full mix | Vocals | Bass | Drums | Other instruments`. The slice must use only opaque handles from the existing playback authority, preserve position/loop/range semantics across source changes, and cover pointer, touch, keyboard and screen-reader behavior, selection persistence/reload/stale race, KO/EN/JA/ZH/VI/ES/DE/FR expansion, and rights-cleared audible macOS/Windows behavior. It must not claim guitar/keyboard identity for the `other` stem.

The stacked exact head has no qualifying hosted pull-request workflow receipt at the time of this documentation update. ADR-0001 therefore stays Proposed and this PR stays Draft.

## References

Microsoft. (2021, January 7). *Resource Interchange File Format (RIFF).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/xaudio2/resource-interchange-file-format--riff-

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS) (FIPS PUB 180-4).* U.S. Department of Commerce. https://doi.org/10.6028/NIST.FIPS.180-4

National Institute of Standards and Technology. (2026, August 12). *Cryptographic Algorithm Validation Program: Secure hashing.* https://csrc.nist.gov/projects/cryptographic-algorithm-validation-program/secure-hashing

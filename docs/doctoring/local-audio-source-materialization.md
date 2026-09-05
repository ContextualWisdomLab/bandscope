# Local audio source materialization

## Problem

The desktop intake boundary previously validated an OS-selected local audio file, then stored the canonical external filesystem path in `ProjectBootstrapSummaryPayload`. Analysis could therefore reopen bytes from a path the application did not own after the original metadata admission. A source could be moved, replaced, truncated, or grown between selection and analysis, and process restart could not reconstruct a trustworthy full-mix source from app-owned project state.

Issue #962 now makes durable local-source re-admission a Project Persistence prerequisite. That satisfies the existing application-security condition that copying selected media is justified when persistence requirements require an additional storage boundary. Resource Admission & Decode owns creation of that app-owned audio artifact; Project Persistence owns only the versioned reference and migration contract that consumes it.

A later review found a narrower diagnostics defect in the bounded-copy port. `std::io::copy` reports both reader and writer failures through one `io::Error`, and the predecessor mapped every such error to `Could not read the selected audio file.` A full or failing app-owned destination could therefore be reported as corrupt/unreadable source media. The same implementation also wrote the one-byte overflow probe into the disposable stage before rejecting an over-limit source. Neither behavior widened published authority, but both weakened failure diagnosis and the stated encoded-byte staging boundary.

The next persistence handoff exposed a separate evidence gap: the bounded copy returned only a byte count. Project Persistence therefore had no native content identity that proved which admitted bytes were staged. A renderer-generated digest would invert the trust boundary, and hashing a mutable external path later would no longer identify the app-owned artifact that analysis actually consumes.

## Constraints

- Local analysis remains local-first and introduces no network or generic filesystem capability.
- The renderer must not choose an arbitrary path for analysis or persistence.
- The encoded-byte ceiling remains 100 MiB.
- An initial metadata length is not sufficient evidence if the selected file changes while it is being admitted.
- Source-read failures and app-owned destination-write failures must remain distinguishable without exposing paths or OS error details.
- Transient `Interrupted` reads must be retried rather than misdiagnosed as unreadable media.
- Content identity must be computed from the exact byte slices whose staging writes succeeded; the one-byte overflow probe is not part of the digest.
- SHA-256 is used only as content-identity evidence. This implementation does not claim CAVP validation, FIPS 140 validation, authenticity, or protection against a malicious actor who can replace both an artifact and its stored digest.
- The user-visible source label may preserve the selected filename, but analysis authority must move to app-owned storage.
- The change must not claim that Tauri already persists the new receipt, project reopen is complete, YouTube source persistence is complete, power-loss recovery is complete, or commercial decoder licensing is solved.

## Alternatives

1. Keep the canonical external path and revalidate immediately before every analysis. Rejected because process restart still depends on mutable external authority and durable project references remain non-portable.
2. Persist the absolute external path in the `.bscope` document. Rejected because #962 explicitly separates portable project identity from arbitrary host paths and because it widens disclosure and authority.
3. Copy the selected local file into the project root after native admission. Selected. It produces the stable `source.<extension>` artifact expected by the Project Persistence source-reference contract without allowing the renderer to mint filesystem authority.
4. Keep `std::io::copy` and surface one generic copy error. Rejected because it cannot distinguish an untrusted source read failure from failure to write BandScope-owned project storage. A bounded explicit read/write loop preserves the same byte ceiling while keeping those trust-boundary failures separate.
5. Compute the persistence digest in the renderer or later from the original absolute path. Rejected because neither source is authoritative for the bytes successfully staged into BandScope-owned storage.
6. Add a second SHA-256 implementation or a new hashing path in Project Persistence. Rejected. The GUI-independent desktop core is the minimal Shared Kernel for this byte-identity primitive. Active Player's existing local playable-stem SHA-256 implementation must migrate to this canonical primitive when its dependent stack is restacked rather than remain a divergent copy.

## Implementation and exact evidence

- `dbeee9c7407c72f999f584eb0eb9342ddc39fddd` adopted protected `develop@314ddeae7b775a4957594b599358c8255617eb2e` as an ordinary second parent with no force push. The Resource Admission semantic delta remains a descendant of the current protected base.
- RED `804a2867e877947feaffb1da6c6072e6a49049fe` added bounded-copy regressions for exact-limit acceptance and one-byte-over growth rejection.
- Core fix `0beee45b98e51ba46b571a82c6d0d93db61ea8d6` added `copy_bounded_local_audio` and the 100 MiB admission boundary.
- Native integration `a2b1bd9e33a69be75f813f005abd37345200ce55` creates the project root before source admission, opens the OS-selected source natively, stages bytes under that project root, flushes the staged file, and publishes `source.<extension>` only after bounded copy succeeds. `ProjectBootstrapSummaryPayload.source.sourcePath` now points at the app-owned artifact for local-file intake.
- Source review of that integration found that the new core port was public inside `audio_resource.rs` but not re-exported from the crate root consumed by Tauri. `323a7fac00c4954af12b382802a9d6f8359ef4c5` is the minimal causal repair: it re-exports `copy_bounded_local_audio` without changing the admission policy or widening authority.
- Diagnostics RED `131d6d7220985abd207559e6eb5dc122ac989cf4` requires a failing staging writer to produce the bounded workspace error rather than the source-media read error.
- Causal fix `ac4adfdb5df82f48aadd5e028433e3336d3ce2ae` replaces the ambiguous `std::io::copy` mapping with an explicit bounded read/write loop. It writes at most 100 MiB, performs a one-byte read-only probe after reaching the ceiling, preserves the media-read error for reader failures, and maps writer failures to the existing app-owned workspace error. It also adds the inverse reader-failure regression so the two diagnoses cannot collapse again.
- Content-identity RED `dc413794fb84c736085ab77b763854ba0f58bdf1` requires the Resource Admission port to return the exact staged byte count plus the SHA-256 known for bytes `01 02 03 04`. The predecessor has no such receipt API, so this is a genuine missing-contract RED rather than a mock success.
- Causal fix `566cd1f991296e7f3c288cb07a11c2d2effb258a` adds `LocalAudioCopyReceipt` and `copy_bounded_local_audio_with_receipt`. SHA-256 is updated only after the corresponding `write_all` succeeds, so a failed writer never yields identity evidence for an incomplete stage. The compatibility byte-count adapter remains for the current Tauri caller, and `Interrupted` source reads are retried without changing the resulting identity.
- The shared SHA-256 state is in GUI-independent core and is checked against NIST SHA-256 known-answer vectors including the empty message, `abc`, the multi-block standard vector, and one million `a` bytes. These are correctness regressions only; they are not CAVP or module-validation evidence.

Hosted evidence must be reacquired on the final descendant rather than transferred from any predecessor head.

## Security Notes

### Untrusted inputs and trust boundaries

The selected audio path, file metadata, and media bytes remain untrusted. The OS file dialog supplies the initial path, but the path is used only to resolve and open the user-selected source. The resulting app-owned project root is the storage trust boundary used for subsequent analysis authority. The content digest is evidence about bytes that successfully crossed that boundary into the staging writer; it is not authorization to reopen an arbitrary host path.

### Validation and safe failure

The extension allowlist and descriptor-observed non-zero/100 MiB encoded-size policy remain unchanged. The bounded copy writes no more than 100 MiB. If exactly 100 MiB has been staged, it reads only one additional source byte to determine whether the source grew past the ceiling; that probe byte is never written or hashed as admitted content. A source read failure returns the bounded media-read message, while a destination write failure returns the bounded workspace message. `Interrupted` reads are retried. Neither failure path exposes the source path, destination path, raw OS error, media contents, or a misleading partial digest. A unique private stage is removed by the native caller on copy or flush failure. The final source artifact is not published until the staged file has been synchronized successfully.

The receipt is currently bound to the byte stream whose writes succeeded, not yet to a post-rename descriptor identity. Tauri must switch from the compatibility byte-count adapter to the receipt API and then verify that the synchronized/published artifact is the same app-owned object before the digest becomes durable `sourceReference` truth. Same-size external mutation of a staging or final artifact remains a threat until that publication binding and reopen verification are complete.

### Logging and privacy

No new logging, telemetry, network transfer, or path exposure is introduced. SHA-256 is persisted only as non-secret content identity when the Project Persistence owner consumes the receipt; the current slice does not log it. The original filename remains a user-facing label already present in the bootstrap contract; the original absolute path is no longer the local-analysis source path after successful admission.

### Test points

- exact encoded-byte limit remains accepted;
- one-byte-over growth is rejected without staging or hashing the probe byte;
- empty source remains rejected;
- reader failure retains the bounded selected-audio diagnosis;
- transient interrupted reads are retried and preserve the expected digest;
- destination writer failure reports the bounded app-owned workspace diagnosis and cannot return a partial receipt;
- SHA-256 matches authoritative known-answer vectors across short, multi-block, chunked, and one-million-byte inputs;
- failed copy or flush does not publish the final project-owned source artifact;
- Tauri must compile against the exported Resource Admission ports;
- hosted Rust/Tauri, Windows, macOS, security, SBOM, and review gates must be reacquired on the final exact PR head.

## Remaining risks and follow-up

The core can now emit native streaming content identity for exactly the bytes successfully staged, but the current Tauri `materialize_local_audio_source` caller still uses the compatibility byte-count adapter and therefore does not yet carry the digest into its bootstrap/persistence handoff. The next owner slice is to consume the receipt at that native caller, bind it to the synchronized and published `source.<extension>` artifact, and expose only the path-free identity fields needed by #970/#962. Reopen must then resolve only the app-owned artifact, revalidate regular/no-link containment, observed size, digest, and decode admission, and reconstruct a fresh bootstrap before #1160 mints playback authority.

The private playable-stem SHA-256 implementation already present in #1160 is now a consolidation finding: once this Resource Admission foundation is available in that stack, #1160 must consume the shared core primitive and delete its local copy rather than maintain two security-sensitive implementations. YouTube intake still uses its owned cache artifact and needs an explicit durable-source promotion decision. Parent-directory durability and exhaustive power-loss injection remain separate recovery work. Issue #1129 remains the commercial decoder dependency gate and is not changed by this materialization boundary.

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (FIPS PUB 180-4). https://doi.org/10.6028/NIST.FIPS.180-4

National Institute of Standards and Technology. (2023, March 7). *Decision to revise FIPS 180-4, Secure Hash Standard (SHS).* https://csrc.nist.gov/news/2023/decision-to-revise-fips-180-4

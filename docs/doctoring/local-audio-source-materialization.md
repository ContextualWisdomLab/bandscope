# Local audio source materialization

## Problem

The desktop intake boundary previously validated an OS-selected local audio file, then stored the canonical external filesystem path in `ProjectBootstrapSummaryPayload`. Analysis could therefore reopen bytes from a path the application did not own after the original metadata admission. A source could be moved, replaced, truncated, or grown between selection and analysis, and process restart could not reconstruct a trustworthy full-mix source from app-owned project state.

Issue #962 now makes durable local-source re-admission a Project Persistence prerequisite. That satisfies the existing application-security condition that copying selected media is justified when persistence requirements require an additional storage boundary. Resource Admission & Decode owns creation of that app-owned audio artifact; Project Persistence owns only the versioned reference and migration contract that consumes it.

A later review found a narrower diagnostics defect in the bounded-copy port. `std::io::copy` reports both reader and writer failures through one `io::Error`, and the predecessor mapped every such error to `Could not read the selected audio file.` A full or failing app-owned destination could therefore be reported as corrupt/unreadable source media. The same implementation also wrote the one-byte overflow probe into the disposable stage before rejecting an over-limit source. Neither behavior widened published authority, but both weakened failure diagnosis and the stated encoded-byte staging boundary.

The next persistence handoff exposed a separate evidence gap: the bounded copy returned only a byte count. Project Persistence therefore had no native content identity that proved which admitted bytes were staged. A renderer-generated digest would invert the trust boundary, and hashing a mutable external path later would no longer identify the app-owned artifact that analysis actually consumes.

A post-fix review found one more ownership defect. The new SHA-256 state was private to Resource Admission, while #1160 already had a second private playable-stem SHA-256 implementation. Merely documenting future consolidation was not enough: without a reusable core reader port, the dependent Active Player stack could not actually delete its copy. The Shared Kernel therefore needs a reader-based digest API that preserves the same bounded authority model without opening paths itself.

The staged receipt still did not prove that the object eventually published as `source.<extension>` retained those same bytes. A same-size mutation after staging could preserve `file_size_bytes` while changing content. Treating a pre-publication digest as durable project truth would therefore leave a gap exactly where Project Persistence needs native evidence. Resource Admission needs a bounded re-read verifier that compares both size and SHA-256 of an already-open published artifact against the staging receipt before that receipt can be handed to persistence.

A further review found that the first publication verifier bounded its re-read only by the global 100 MiB admission ceiling. If a 4 MiB staged artifact were replaced by a much larger app-owned object before verification, the verifier could hash the entire replacement up to 100 MiB before discovering the receipt mismatch. The staging receipt already contains a native exact byte count, so publication verification should use that value as the tighter read ceiling and inspect only one additional probe byte for growth. This does not change what can be accepted; it reduces the work performed on an already-invalid published object and makes the publication check proportional to the admitted artifact rather than the product-wide maximum.

## Constraints

- Local analysis remains local-first and introduces no network or generic filesystem capability.
- The renderer must not choose an arbitrary path for analysis or persistence.
- The encoded-byte ceiling remains 100 MiB.
- An initial metadata length is not sufficient evidence if the selected file changes while it is being admitted.
- Source-read failures and app-owned destination-write failures must remain distinguishable without exposing paths or OS error details.
- Transient `Interrupted` reads must be retried rather than misdiagnosed as unreadable media.
- Content identity must be computed from the exact byte slices whose staging writes succeeded; the one-byte overflow probe is not part of the digest.
- SHA-256 is used only as content-identity evidence. This implementation does not claim CAVP validation, FIPS 140 validation, authenticity, or protection against a malicious actor who can replace both an artifact and its stored digest.
- A reusable SHA-256 port may hash only a caller-owned `Read`; it must not open arbitrary paths, log bytes, or introduce new filesystem authority.
- Publication verification likewise accepts only an already-authorized `Read`; path resolution and no-link containment stay with the native caller that owns app storage authority.
- Publication verification must reject an invalid native receipt length before reading and must read at most the expected admitted byte count plus one probe byte when checking for growth.
- The user-visible source label may preserve the selected filename, but analysis authority must move to app-owned storage.
- The change must not claim that Tauri already persists the new receipt, project reopen is complete, YouTube source persistence is complete, power-loss recovery is complete, or commercial decoder licensing is solved.

## Alternatives

1. Keep the canonical external path and revalidate immediately before every analysis. Rejected because process restart still depends on mutable external authority and durable project references remain non-portable.
2. Persist the absolute external path in the `.bscope` document. Rejected because #962 explicitly separates portable project identity from arbitrary host paths and because it widens disclosure and authority.
3. Copy the selected local file into the project root after native admission. Selected. It produces the stable `source.<extension>` artifact expected by the Project Persistence source-reference contract without allowing the renderer to mint filesystem authority.
4. Keep `std::io::copy` and surface one generic copy error. Rejected because it cannot distinguish an untrusted source read failure from failure to write BandScope-owned project storage. A bounded explicit read/write loop preserves the same byte ceiling while keeping those trust-boundary failures separate.
5. Compute the persistence digest in the renderer or later from the original absolute path. Rejected because neither source is authoritative for the bytes successfully staged into BandScope-owned storage.
6. Add a second SHA-256 implementation or a new hashing path in Project Persistence. Rejected. The GUI-independent desktop core is the minimal Shared Kernel for this byte-identity primitive. Active Player's existing local playable-stem SHA-256 implementation must migrate to this canonical primitive when its dependent stack is restacked rather than remain a divergent copy.
7. Keep the core SHA-256 state private and ask each consumer to wrap or copy it. Rejected because that makes the documented consolidation impossible. A public reader-only `sha256_hex_reader` is the narrow reusable boundary: consumers retain authority over which already-authorized descriptor they supply, while the core owns one digest implementation.
8. Treat the staging receipt as publication identity immediately after rename. Rejected because a same-size content change would not be detected by byte-count checks alone. Selected instead: re-read an already-open published artifact through the same bounded SHA-256 path and require exact receipt equality before persistence may consume the identity.
9. Re-read every published artifact up to the global 100 MiB ceiling before comparing the receipt. Rejected because the native receipt already supplies a tighter exact byte count. Selected instead: use `expected.file_size_bytes` as the publication read ceiling and read one additional probe byte. Growth then fails immediately after the expected boundary, while truncation and same-size mutation still fail through exact size/digest comparison.

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
- Shared-kernel RED `373824c7bbb40f2df1bb2721316680378c104834` requires a public core reader boundary to reproduce the FIPS 180-4 `abc` SHA-256 vector. The predecessor cannot satisfy the import because its digest state is private to Resource Admission.
- Causal fix `d1ba40683772019577fec4d8c767ff8b23294e38` exports `sha256_hex_reader` from desktop core. It consumes only a caller-owned `Read`, retries `Interrupted`, propagates other I/O failures, does not open a path, and uses the same SHA-256 state as the local-audio receipt. This makes #1160 consolidation executable instead of aspirational.
- Publication-binding RED `fdfdd7003b8a9162f846dcf22ffe66a3afd5f47e` requires an unchanged published byte stream to reproduce the staging receipt and a same-size mutation to fail with the bounded project-workspace diagnosis. The predecessor has no publication verifier.
- Causal fix `a1c85cbfbdc7051169f097e8ad235e3bbac439d3` adds `verify_local_audio_publication_receipt`. It accepts only an already-open reader, reuses the same bounded staging/hash path with an in-memory sink, and requires exact byte-count plus SHA-256 equality. Read failure, growth, truncation, or content mismatch is normalized to the project-workspace error because original source admission has already completed by this boundary.
- Export repair `20e7faaddd619c6cbd053876ca6de27b9933a4a2` exposes the publication verifier from `bandscope_desktop_core`, making the next Tauri caller integration executable without source copying.
- Verification-bound RED `6a0692ee288d3b126bd0598e07e03c88a702d567` adds a counting-reader regression for an artifact expected to be 4 bytes but grown to 8 bytes. The predecessor verifier scans all 8 bytes because it uses the global 100 MiB ceiling; the contract requires it to stop after the four expected bytes plus one growth probe.
- Causal fix `c65a9fd312f4d67e6d1cad83b80b1213e692c8dd` validates the native expected length, uses `expected.file_size_bytes` as the publication-read ceiling, and maps the one-byte growth probe back to the bounded workspace diagnosis. A grown published object is therefore rejected after `expected + 1` bytes rather than being hashed up to the product-wide ceiling.
- The shared SHA-256 state is checked against NIST SHA-256 known-answer vectors including the empty message, `abc`, the multi-block standard vector, and one million `a` bytes. The reader port also has interrupted-short-read and non-interrupted-failure regressions. These are correctness regressions only; they are not CAVP or module-validation evidence.

Hosted evidence must be reacquired on the final descendant rather than transferred from any predecessor head.

## Security Notes

### Untrusted inputs and trust boundaries

The selected audio path, file metadata, and media bytes remain untrusted. The OS file dialog supplies the initial path, but the path is used only to resolve and open the user-selected source. The resulting app-owned project root is the storage trust boundary used for subsequent analysis authority. The content digest is evidence about bytes that successfully crossed that boundary into the staging writer; it is not authorization to reopen an arbitrary host path.

The shared reader and publication-verification ports accept no path and create no descriptor. Callers such as Resource Admission or future Active Player stem admission must supply a descriptor they already own under their bounded-context authority. That keeps hashing reusable without turning the Shared Kernel into a filesystem service. The publication verifier additionally refuses to promote a staging receipt when the published bytes do not reproduce both its exact size and digest.

### Validation and safe failure

The extension allowlist and descriptor-observed non-zero/100 MiB encoded-size policy remain unchanged. The bounded copy writes no more than 100 MiB. If exactly 100 MiB has been staged, it reads only one additional source byte to determine whether the source grew past the ceiling; that probe byte is never written or hashed as admitted content. A source read failure returns the bounded media-read message, while a destination write failure returns the bounded workspace message. `Interrupted` reads are retried. Neither failure path exposes the source path, destination path, raw OS error, media contents, or a misleading partial digest. A unique private stage is removed by the native caller on copy or flush failure. The final source artifact is not published until the staged file has been synchronized successfully.

`verify_local_audio_publication_receipt` rejects an expected length of zero or greater than 100 MiB before consuming the published reader. For a valid staging receipt it reads and hashes at most the exact admitted byte count and then one probe byte. Any verification read failure, one-byte-or-greater growth, truncation, or digest mismatch fails closed as a project-workspace error and exposes no path or OS detail. The current Tauri caller has not yet been switched to this verifier, so descriptor acquisition/no-link containment and final handoff remain incomplete production integration rather than claimed behavior.

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
- the public reader boundary reproduces the same digest, retries interrupted reads, and propagates non-interrupted reader failure;
- an unchanged published reader reproduces the staging receipt;
- same-size published-content mutation is rejected even when byte count is unchanged;
- publication-verification read failure is normalized to the bounded project-workspace diagnosis;
- a grown published artifact is rejected after the expected byte count plus one probe byte rather than scanning unrelated tail bytes up to 100 MiB;
- invalid expected publication lengths fail before consuming published bytes;
- failed copy or flush does not publish the final project-owned source artifact;
- Tauri must compile against the exported Resource Admission, publication-verification, and shared SHA-256 ports;
- hosted Rust/Tauri, Windows, macOS, security, SBOM, and review gates must be reacquired on the final exact PR head.

## Remaining risks and follow-up

The core can now emit native streaming identity for exactly the bytes successfully staged and can verify that an already-open published byte stream reproduces that receipt without scanning beyond the expected artifact plus one growth probe. The current Tauri `materialize_local_audio_source` caller still uses the compatibility byte-count adapter, so this run does not claim production publication binding complete. The next owner slice is to switch that native caller to `copy_bounded_local_audio_with_receipt`, synchronize and publish `source.<extension>`, open the published object under app-owned/no-link authority, call `verify_local_audio_publication_receipt`, and only then expose the path-free identity fields needed by #970/#962. Reopen must resolve only the app-owned artifact, revalidate regular/no-link containment, observed size, digest, and decode admission, and reconstruct a fresh bootstrap before #1160 mints playback authority.

The private playable-stem SHA-256 implementation already present in #1160 is now a concrete consolidation finding with a consumable replacement port: when this Resource Admission foundation is available in that stack, #1160 must replace its local implementation with `bandscope_desktop_core::sha256_hex_reader` while retaining stem identity/error tests. YouTube intake still uses its owned cache artifact and needs an explicit durable-source promotion decision. Parent-directory durability and exhaustive power-loss injection remain separate recovery work. Issue #1129 remains the commercial decoder dependency gate and is not changed by this materialization boundary.

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (FIPS PUB 180-4). https://doi.org/10.6028/NIST.FIPS.180-4

National Institute of Standards and Technology. (2023, March 7). *Decision to revise FIPS 180-4, Secure Hash Standard (SHS).* https://csrc.nist.gov/news/2023/decision-to-revise-fips-180-4

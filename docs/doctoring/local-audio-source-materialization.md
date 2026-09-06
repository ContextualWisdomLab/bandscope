# Local audio source materialization

## Problem

BandScope originally validated an OS-selected local audio file and then let later analysis reopen the canonical external filesystem path. That left analysis and restart dependent on mutable host authority: the selected file could be moved, replaced, truncated, or grown after admission. Project Persistence #962 also needs a durable source identity that does not serialize an arbitrary user filesystem path.

Resource Admission & Decode therefore owns creation and verification of the app-owned `source.<extension>` artifact and the native content identity for that publication. Project Persistence owns the later versioned project reference that consumes this evidence; it does not copy or hash user media itself.

The hardening sequence exposed distinct defects:

- source-read and app-owned destination-write failures were initially collapsed into one diagnosis;
- the one-byte over-limit probe was initially written into the disposable stage;
- the bounded copy returned only a byte count, so there was no native identity for the exact bytes written;
- SHA-256 existed in more than one security-sensitive implementation and initially had no reusable reader-only core port;
- a staging receipt alone did not prove that the final published object still contained the same bytes;
- publication verification initially read against the product-wide 100 MiB ceiling instead of the receipt's tighter expected length;
- the production Tauri materializer initially discarded the receipt and stayed on the byte-count-only adapter;
- publication initially used `destination.exists()` followed by overwrite-capable `rename`, creating a check-then-act clobber window;
- even after publication verification existed, Project Persistence still had no typed path-free handoff value for `projectId + artifactName + extension + fileSizeBytes + contentSha256`;
- after that type existed, the production selector still discarded the verified identity instead of retaining it in native state for the persistence owner.

The canonical #866 branch now repairs those defects through native retention. Production local-file materialization consumes the native receipt, synchronizes the stage, publishes with a same-filesystem no-clobber hard link, removes the private stage name, verifies the published bytes, derives `LocalAudioPublicationIdentity` from that verified receipt, and retains the path-free value in native Tauri state keyed by the locally minted project id before returning bootstrap authority. The strict analysis-runtime `LocalAudioSource` wire remains unchanged.

The remaining integration is now across the owning persistence boundary rather than the intake copy/hash path: #970 must consume this native identity when constructing durable `sourceReference`, and restart must re-admit the app-owned artifact before fresh playback authority is minted. Platform-atomic no-follow descriptor acquisition, parent-directory crash durability, YouTube durable-source policy, and decoder licensing remain separate open work.

## Constraints and invariants

- Local analysis remains local-first; this boundary adds no network authority.
- Renderer input never selects an arbitrary analysis or persistence path.
- The encoded-byte ceiling remains exactly 100 MiB.
- Metadata length before copying is not final evidence when the selected source can change during admission.
- Source-read failure and app-owned write/publication failure remain distinguishable without exposing paths or raw OS errors.
- `Interrupted` reads are retried.
- SHA-256 covers only byte slices whose staging writes succeeded. The one-byte growth probe is not admitted content and is not hashed into the receipt.
- SHA-256 is content-identity/correctness evidence only. This code does not claim CAVP validation, FIPS 140 validation, authenticity, or protection against an actor who can replace both artifact and stored digest.
- Reusable SHA-256 and publication-verification APIs accept caller-owned `Read` values and acquire no path authority.
- Publication verification consumes at most `expected.file_size_bytes + 1` bytes and rejects invalid expected lengths before reading.
- Publication must not overwrite an existing app-owned source name. Same-project hard-link publication fails closed when the destination exists or the filesystem cannot provide that primitive; it does not fall back to overwrite-capable rename.
- The analysis-runtime `LocalAudioSource` contract remains `sourcePath + fileName + extension + fileSizeBytes`. `contentSha256` is not injected into that strict Rust/TypeScript/Python request without a versioned contract change.
- The persistence identity is a distinct contract. It contains exactly `projectId + artifactName + extension + fileSizeBytes + contentSha256`; it contains no `path` or `sourcePath` field.
- The persistence identity accepts only an existing BandScope project-id grammar, canonical lowercase admitted extension, byte size `1..=100 MiB`, and exactly 64 lowercase hexadecimal SHA-256 characters. `artifactName` is derived as `source.<extension>` rather than accepted from renderer input.
- Verified persistence identity is retained only in native Tauri state keyed by the minted project id. The renderer does not author or supply that evidence.
- If native identity state cannot be retained, local-source selection fails closed rather than returning bootstrap authority without persistence evidence.
- Portable `symlink_metadata` / open / re-check logic narrows linked-object substitution but does not claim atomic `O_NOFOLLOW` or Windows reparse-point-equivalent semantics.
- The parent project directory is not yet explicitly synchronized after destination-link creation and stage unlink, so power-loss durability of the directory entries is not claimed.

## Decision record

1. Keep the external canonical path and revalidate before every analysis — rejected. Restart and persistence would still depend on mutable host authority.
2. Persist the absolute external path — rejected. It widens disclosure and violates #962's path-free direction.
3. Copy the selected file into app-owned `source.<extension>` — selected. Later analysis can use BandScope-owned authority.
4. Keep `std::io::copy` and one generic error — rejected. Explicit bounded read/write preserves the ceiling while distinguishing source and destination failures.
5. Hash later in the renderer or from the original path — rejected. Neither is authoritative for bytes actually staged into BandScope storage.
6. Add another SHA-256 implementation in persistence or Active Player — rejected. `bandscope_desktop_core::sha256_hex_reader` is the reader-only Shared Kernel.
7. Treat the staging receipt as publication truth without rereading — rejected. Same-size mutation would evade byte-count checks.
8. Re-read every published object up to 100 MiB — rejected. The native receipt gives a tighter expected length.
9. Leave the Tauri caller on `copy_bounded_local_audio -> u64` — rejected. Production publication must retain native size+digest evidence and verify the publication before bootstrap authority is returned.
10. Check `destination.exists()` and then rename the stage — rejected. On overwrite-capable rename semantics the sequence is racy.
11. Create the destination with `std::fs::hard_link(stage, destination)` and remove the private stage name — selected for the same-filesystem project root. It creates the destination without clobbering an existing name and keeps the synchronized bytes unchanged.
12. Add `contentSha256` to the existing analysis `LocalAudioSource` payload — rejected. Python admission is strict and this would mix persistence evidence with a narrower runtime request.
13. Define a separate path-free `LocalAudioPublicationIdentity` whose artifact name is derived from canonical native evidence — selected. This keeps Resource Admission as the copy/hash authority and gives #970 a serializable persistence input without absolute paths.
14. Return bootstrap authority while leaving the verified identity only in a local stack variable — rejected. The selector now retains the typed identity in native Tauri state keyed by project id before returning; #970 can adopt that native evidence without trusting renderer-authored digest/path data.

## Implementation and exact evidence

The cumulative hardening remains test-first where behavior changed:

- `dbeee9c7407c72f999f584eb0eb9342ddc39fddd` adopted protected `develop@314ddeae7b775a4957594b599358c8255617eb2e` through ordinary non-force ancestry.
- RED `804a2867e877947feaffb1da6c6072e6a49049fe` and fix `0beee45b98e51ba46b571a82c6d0d93db61ea8d6` established exact-limit acceptance and one-byte-over rejection.
- `a2b1bd9e33a69be75f813f005abd37345200ce55` moved successful local-file intake to an app-owned same-project stage; `323a7fac00c4954af12b382802a9d6f8359ef4c5` exported the core port to Tauri.
- Diagnostics RED `131d6d7220985abd207559e6eb5dc122ac989cf4` and fix `ac4adfdb5df82f48aadd5e028433e3336d3ce2ae` separated source-read and destination-write failures and made the one-byte over-limit check read-only.
- Content-identity RED `dc413794fb84c736085ab77b763854ba0f58bdf1` and fix `566cd1f991296e7f3c288cb07a11c2d2effb258a` introduced `LocalAudioCopyReceipt { file_size_bytes, content_sha256 }`.
- Shared-kernel RED `373824c7bbb40f2df1bb2721316680378c104834` and fix `d1ba40683772019577fec4d8c767ff8b23294e38` exposed reader-only `sha256_hex_reader`.
- Publication RED `fdfdd7003b8a9162f846dcf22ffe66a3afd5f47e` and fix `a1c85cbfbdc7051169f097e8ad235e3bbac439d3` introduced `verify_local_audio_publication_receipt`; `20e7faaddd619c6cbd053876ca6de27b9933a4a2` exported it.
- Bounded-verification RED `6a0692ee288d3b126bd0598e07e03c88a702d567` and fix `c65a9fd312f4d67e6d1cad83b80b1213e692c8dd` changed publication verification to stop after expected bytes plus one growth probe.
- Production-integration RED `ed9fe7eba6261753dc0f68e820e2b642703fe2cd` and fix `bdf8f87d5e5c9db423537c7633e7ff4b92bec5b6` moved the Tauri materializer onto native receipt + publication verification.
- No-clobber RED `45b1f72abeded4e478775d31085244621f68c9f0` and fix `eb972e951ef090c92b595c752b18d66f11f6b96e` replaced check-then-rename with same-filesystem hard-link publication.
- Path-free handoff RED `bad908c83bfb89f545f0f2f637d96ac8fdfa3e0e` requires exact camelCase serialization of the five persistence fields, no path fields, and fail-closed rejection of invalid native evidence.
- Path-free handoff fix `87bdeea92d3bb6dc45eb666f422bd8a3d36f3872` adds `LocalAudioPublicationIdentity` and `build_local_audio_publication_identity`; export `344a9a39f32ac40b3e137c76e2cfd46243827bb5` makes the contract available from `bandscope_desktop_core` to the #970 owner.
- An earlier exploratory retention RED `cbfa967b16e94f2d84940665ce38537075a8ce41` was intentionally neutralized by `d8c57ce1d64d0bc9963219740aeaa83d9569a90b` rather than leaving a known failing head; those two commits add no production claim.
- Production native-retention RED `106ae75cad85553e56964a9844ea7a01f6ce456c` requires the materializer to derive the typed identity from the verified receipt, the selector to store it in native state, and Tauri to register that state.
- Native-retention fix `e4e2ba734bc80304a754ce2eb52e473fd9ee3631` returns `LocalAudioSourcePayload + LocalAudioPublicationIdentity` from materialization, stores the identity in `LocalAudioPublicationIdentityState` before bootstrap authority is returned, and registers the native state with the Tauri runtime.

The SHA-256 implementation is checked against standard known-answer vectors including the empty message, `abc`, the multi-block vector, and one million `a` bytes. Those are correctness regressions, not validation-module evidence.

## Security Notes

The selected audio path, file metadata, and media bytes are untrusted. The OS file dialog supplies initial user authority; BandScope uses that path only to canonicalize and open the source. The project-owned artifact is the authority after successful admission.

The production Tauri materializer synchronizes the stage, creates the destination through a no-clobber same-filesystem hard link, removes the private stage name, requires regular/non-symlink path observations, opens the publication, checks descriptor size, verifies exact receipt equality, and performs a post-verification path check. Publication mismatch or read failure is normalized to the bounded project-workspace diagnosis; source/destination paths, raw OS errors, and audio bytes are not exposed.

`LocalAudioPublicationIdentity` does not acquire filesystem authority. It converts already verified native evidence into a deterministic, path-free value for the persistence boundary. Invalid project ids, extensions, byte counts, or digest encodings fail closed. Production local-file selection now retains that value in native Tauri state before returning the ordinary bootstrap summary, so the renderer does not need to invent a digest or persist a host path. Durable project serialization and restart re-admission remain #970 responsibilities.

No new logging, telemetry, network transfer, or raw-media export is introduced. The SHA-256 receipt and publication identity are non-secret content identity.

## Test and acceptance points

- exact 100 MiB encoded-byte limit accepted; one byte over rejected;
- empty source rejected;
- source-reader and destination-writer failures remain distinct and path-safe;
- `Interrupted` reads retry without changing identity;
- failed writes cannot return a partial receipt;
- the growth probe is neither staged nor hashed;
- unchanged published bytes reproduce the staging receipt;
- same-size mutation, truncation, growth, or publication-read failure fails closed;
- grown publication stops after expected bytes plus one probe;
- production publication cannot use existence-check plus overwrite-capable rename;
- production Tauri local-file materialization consumes receipt and publication-verification ports, not the compatibility byte-count adapter;
- path-free identity serializes exactly the five persistence fields and cannot serialize `path`/`sourcePath`;
- invalid project ids, uppercase/unsupported extensions, zero/oversized byte counts, and noncanonical SHA-256 encodings are rejected;
- production local-file selection derives identity from the verified receipt and retains it in registered native Tauri state before returning bootstrap authority;
- hosted Rust/Tauri, Windows, macOS, security, SBOM, coverage/package, and independent-review evidence must be reacquired on the final exact #866 head.

Synthetic arrays or source-text checks do not substitute for production scientific acceptance. Rights-cleared real decoded audio still has to exercise the integrated Windows/macOS intake/decode/analysis/playback path where the relevant commercial claim is made.

## Remaining risks and follow-up

The local-file path now has two separate native contracts: `LocalAudioCopyReceipt` proves the exact bytes staged/published, and retained `LocalAudioPublicationIdentity` represents the path-free durable evidence intended for Project Persistence. The next cross-owner step is for #970 to consume that retained identity when writing `sourceReference`; it must not reconstruct digest/path evidence from renderer JSON or re-hash the user's original media.

After #970 persists `projectId + artifactName + extension + fileSizeBytes + contentSha256`, restart must resolve only the app-owned artifact, re-establish regular/no-link containment, bounded size/SHA-256 and applicable decode admission, reconstruct a fresh bootstrap, and only then let #1160 combine persisted `selectedPlaybackSource` intent with fresh native stem availability. Missing preferred stems fail closed to Full mix.

When #866 enters #1160 ancestry, the private playable-stem SHA-256 implementation should be deleted in favor of `bandscope_desktop_core::sha256_hex_reader` while preserving stem identity/error tests. YouTube intake still uses its owned cache artifact and needs an explicit durable-source promotion decision. Platform-atomic no-follow acquisition and parent-directory crash durability remain Resource Admission/platform work. Issue #1129 remains the commercial decoder-dependency gate.

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (FIPS PUB 180-4). https://doi.org/10.6028/NIST.FIPS.180-4

National Institute of Standards and Technology. (2023, March 7). *Decision to revise FIPS 180-4, Secure Hash Standard (SHS).* https://csrc.nist.gov/news/2023/decision-to-revise-fips-180-4

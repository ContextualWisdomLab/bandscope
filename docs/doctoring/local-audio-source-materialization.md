# Local audio source materialization

## Problem

BandScope originally validated an OS-selected local audio file and then let later analysis reopen the canonical external filesystem path. That left analysis and restart dependent on mutable host authority: the selected file could be moved, replaced, truncated, or grown after admission. Project Persistence #962 also needs a durable source identity that does not serialize an arbitrary user filesystem path.

Resource Admission & Decode therefore owns creation and verification of the app-owned `source.<extension>` artifact. Project Persistence owns the later versioned reference that consumes native evidence from that artifact; it does not copy or hash user media itself.

The implementation accumulated several narrower defects while that boundary was being hardened:

- `std::io::copy` collapsed source-read and app-owned destination-write failures into the same buyer diagnosis;
- the one-byte over-limit probe was initially written into the disposable stage;
- the bounded copy returned only a byte count, so persistence had no native identity for the exact bytes written;
- SHA-256 existed in more than one security-sensitive implementation and initially had no reusable reader-only core port;
- a staging receipt alone did not prove that the final published object still contained the same bytes;
- publication verification initially used the product-wide 100 MiB ceiling rather than the receipt's tighter expected length;
- after the core receipt and verifier existed, the production Tauri materializer still called the compatibility byte-count-only adapter and discarded SHA-256 evidence;
- publication initially used `destination.exists()` followed by overwrite-capable `rename`, leaving a check-then-act window where another entry could appear at `source.<extension>` between the check and publication.

The receipt/verifier and no-clobber publication defects are now repaired on the canonical #866 branch: the production local-file materializer consumes the native receipt, synchronizes the stage, creates the app-owned publication with a same-filesystem hard link that fails if the destination name already exists, removes the private stage name, and re-verifies the published object before returning bootstrap authority. Path-free digest handoff into #970, restart re-admission, platform-atomic no-follow acquisition, parent-directory crash durability, YouTube durable-source policy, and decoder licensing remain separate open work.

## Constraints

- Local analysis remains local-first; this boundary adds no network authority.
- Renderer input never selects an arbitrary analysis or persistence path.
- The encoded-byte ceiling remains exactly 100 MiB.
- Metadata length before copying is not final evidence when the selected source can change during admission.
- Source-read failure and app-owned write/publication failure remain distinguishable without exposing paths or raw OS errors.
- `Interrupted` reads are retried.
- SHA-256 covers only byte slices whose staging writes succeeded. The one-byte growth probe is not admitted content and is not hashed into the receipt.
- SHA-256 is content-identity/correctness evidence only. This code does not claim CAVP validation, FIPS 140 validation, authenticity, or protection against an actor who can replace both artifact and stored digest.
- Reusable SHA-256 and publication-verification APIs accept only caller-owned `Read` values. They do not open arbitrary paths or create filesystem authority.
- Publication verification rejects an invalid native receipt length before reading and consumes at most `expected.file_size_bytes + 1` bytes.
- Publication must not overwrite an existing app-owned source name. The same-project staging file and destination share a filesystem; hard-link publication therefore provides a narrow no-clobber create, while unsupported filesystems fail closed rather than falling back to overwrite-capable rename.
- The selected filename may remain a user-facing label, but local-analysis authority moves to app-owned storage.
- Portable `symlink_metadata` / open / re-check logic narrows linked-object substitution but does not claim atomic `O_NOFOLLOW` or Windows reparse-point-equivalent semantics.
- This slice does not claim that the digest is already persisted in `.bscope`, restart/reopen is complete, YouTube persistence is complete, parent-directory publication is crash-durable, or the commercial decoder-license gate is solved.

## Decision record

1. Keep the external canonical path and revalidate before every analysis — rejected. Restart and persistence would still depend on mutable host authority.
2. Persist the absolute external path — rejected. It widens disclosure and violates the path-free #962 direction.
3. Copy the selected file into a project-owned `source.<extension>` artifact — selected. This gives later analysis a stable app-owned authority.
4. Keep `std::io::copy` and one generic error — rejected. Explicit bounded read/write preserves the same ceiling while separating source and destination failures.
5. Hash later in the renderer or from the original path — rejected. Neither is authoritative for the bytes actually staged into BandScope storage.
6. Add another SHA-256 implementation in persistence or Active Player — rejected. `bandscope_desktop_core::sha256_hex_reader` is the minimal reader-only Shared Kernel.
7. Treat the staging receipt as publication truth without rereading — rejected. Same-size mutation would evade byte-count checks.
8. Re-read every published object up to 100 MiB — rejected. The native receipt supplies a tighter expected length, so verification reads only expected bytes plus one growth probe.
9. Leave the Tauri caller on `copy_bounded_local_audio -> u64` — rejected. Production publication must retain the native receipt, synchronize and publish the stage, reopen the app-owned object, and require exact size+SHA-256 equality before bootstrap authority is returned.
10. Check `destination.exists()` and then rename the stage — rejected. On platforms where rename replaces an existing target, the check and rename form a race that can clobber an entry created after the check.
11. Create the destination with `std::fs::hard_link(stage, destination)` and then remove the private stage name — selected for this same-filesystem project root. The create fails when the destination already exists and preserves the synchronized bytes without a second copy. Failure to create or remove the stage fails closed and does not fall back to overwrite-capable rename.

## Implementation and exact evidence

The hardening chain remains cumulative and test-first where behavior changed:

- `dbeee9c7407c72f999f584eb0eb9342ddc39fddd` adopted protected `develop@314ddeae7b775a4957594b599358c8255617eb2e` through an ordinary non-force ancestry update.
- RED `804a2867e877947feaffb1da6c6072e6a49049fe` and fix `0beee45b98e51ba46b571a82c6d0d93db61ea8d6` established exact-limit acceptance and one-byte-over rejection in the bounded-copy port.
- `a2b1bd9e33a69be75f813f005abd37345200ce55` moved successful local-file intake to an app-owned same-project stage and published `source.<extension>` only after bounded copy; `323a7fac00c4954af12b382802a9d6f8359ef4c5` exported that core port to Tauri.
- Diagnostics RED `131d6d7220985abd207559e6eb5dc122ac989cf4` and fix `ac4adfdb5df82f48aadd5e028433e3336d3ce2ae` separated source-read from destination-write failures and made the one-byte over-limit check read-only.
- Content-identity RED `dc413794fb84c736085ab77b763854ba0f58bdf1` and fix `566cd1f991296e7f3c288cb07a11c2d2effb258a` introduced `LocalAudioCopyReceipt { file_size_bytes, content_sha256 }` and streaming SHA-256 over successfully written bytes only.
- Shared-kernel RED `373824c7bbb40f2df1bb2721316680378c104834` and fix `d1ba40683772019577fec4d8c767ff8b23294e38` exposed reader-only `sha256_hex_reader` so dependent contexts can reuse one implementation without acquiring path authority.
- Publication RED `fdfdd7003b8a9162f846dcf22ffe66a3afd5f47e` and fix `a1c85cbfbdc7051169f097e8ad235e3bbac439d3` introduced `verify_local_audio_publication_receipt`, requiring exact byte-count and SHA-256 equality for an already-open published reader; `20e7faaddd619c6cbd053876ca6de27b9933a4a2` exported it.
- Bounded-verification RED `6a0692ee288d3b126bd0598e07e03c88a702d567` and fix `c65a9fd312f4d67e6d1cad83b80b1213e692c8dd` changed publication verification to stop after expected bytes plus one growth probe instead of hashing an invalid replacement up to the global ceiling.
- Production-integration RED `ed9fe7eba6261753dc0f68e820e2b642703fe2cd` added a focused Tauri contract requiring the actual local-audio materializer to consume both `copy_bounded_local_audio_with_receipt` and `verify_local_audio_publication_receipt`, and forbidding the compatibility byte-count-only call on that function.
- Causal production fix `bdf8f87d5e5c9db423537c7633e7ff4b92bec5b6` switched `materialize_local_audio_source` to the receipt API, calls `sync_all` on the same-project stage, publishes app-owned `source.<extension>`, rejects a published path observed as symlink/non-file, reopens the publication, checks descriptor length, requires `verify_local_audio_publication_receipt` equality, re-checks published path metadata, and returns the receipt's admitted byte count.
- No-clobber RED `45b1f72abeded4e478775d31085244621f68c9f0` requires production publication to use an atomic no-clobber destination create and explicitly forbids the `destination.exists()` plus overwrite-capable `rename` sequence.
- No-clobber fix `eb972e951ef090c92b595c752b18d66f11f6b96e` replaces check-then-rename with same-filesystem `hard_link(stage, destination)`, removes the private stage name only after the destination link exists, and fails closed if either publication or stage cleanup cannot complete.

The SHA-256 implementation is checked against standard known-answer vectors including the empty message, `abc`, the multi-block vector, and one million `a` bytes. Reader tests cover short reads, `Interrupted`, and non-interrupted failure. These are correctness regressions, not validation-module evidence.

## Security Notes

The selected audio path, file metadata, and media bytes are untrusted. The OS file dialog supplies initial user authority; BandScope uses that path only to canonicalize and open the source. The project-owned artifact is the authority used after successful admission.

The core hash and publication-verification ports accept no path and create no descriptor. Resource Admission or another owning context supplies an already-authorized reader. A staging receipt cannot be promoted when the published bytes do not reproduce both its length and digest.

The production Tauri caller now synchronizes the stage, creates the destination through a no-clobber same-filesystem hard link, removes the private stage name, requires regular/non-symlink observations of the published path, opens the published object, checks descriptor size, verifies exact receipt equality, and performs a post-verification path check. Any publication mismatch or read failure is normalized to the bounded project-workspace diagnosis; no source/destination path, raw OS error, or audio bytes are exposed. If hard-link creation is unavailable on the project filesystem, admission fails closed rather than silently downgrading to an overwrite-capable publication primitive.

Those portable checks materially narrow name clobbering and linked-object substitution but are not an atomic no-follow open guarantee. A platform-specific descriptor acquisition design remains necessary if BandScope needs `O_NOFOLLOW`/reparse-point-equivalent race semantics against a same-user adversary. The parent directory is also not yet explicitly synchronized after destination-link creation and stage unlink, so power-loss durability of the directory entries is not claimed here.

No new logging, telemetry, network transfer, or raw-media export is introduced. The SHA-256 receipt is non-secret content identity. It is not yet part of the current bootstrap/persistence wire contract.

## Test and acceptance points

- exact 100 MiB encoded-byte limit accepted; one byte over rejected;
- empty source rejected;
- source-reader failure keeps the selected-audio diagnosis;
- destination-writer failure keeps the project-workspace diagnosis;
- `Interrupted` reads retry without changing identity;
- failed writes cannot return a partial receipt;
- the growth probe is neither staged nor included in the receipt digest;
- SHA-256 standard vectors and chunked/short-read paths agree;
- unchanged published bytes reproduce the staging receipt;
- same-size content mutation, truncation, growth, or publication-read failure fails closed;
- invalid receipt lengths fail before reading publication bytes;
- grown publication is rejected after expected bytes plus one probe;
- production publication cannot use an existence-check plus overwrite-capable rename and must fail closed when the fixed destination name already exists;
- production Tauri local-file materialization must compile against and call the receipt and publication-verification ports, not the compatibility byte-count adapter;
- hosted Rust/Tauri, Windows, macOS, security, SBOM, coverage/package, and independent-review evidence must be reacquired on the final exact #866 head.

Synthetic arrays or source-text checks do not substitute for the later production scientific acceptance requirement. Rights-cleared real decoded audio still has to exercise the integrated Windows/macOS intake/decode/analysis/playback path where the relevant commercial claim is made.

## Remaining risks and follow-up

The local-file production path now binds bootstrap authority to a no-clobber app-owned publication whose bytes reproduce the native staging receipt. The next cross-context step is **not** another copy or hash implementation: #866 must expose a path-free publication-identity receipt suitable for #970 v3, while the analysis engine may continue to consume its narrower runtime `LocalAudioSource` path metadata. The current Rust/TypeScript/Python analysis `LocalAudioSource` contract does not include `contentSha256`, so injecting a new field into that runtime request without a versioned contract change would break strict Python admission. A distinct bootstrap/persistence source-identity boundary is therefore preferred.

After Project Persistence receives `projectId + artifactName + extension + fileSizeBytes + contentSha256`, restart must resolve only the app-owned artifact, re-establish regular/no-link containment, bounded size/SHA-256 and applicable decode admission, reconstruct a fresh bootstrap, and only then let #1160 combine persisted `selectedPlaybackSource` intent with fresh native stem availability. Missing preferred stems fail closed to Full mix.

When #866 enters the #1160 ancestry, the private playable-stem SHA-256 implementation should be deleted in favor of `bandscope_desktop_core::sha256_hex_reader` while preserving its stem identity/error tests. YouTube intake still uses its owned cache artifact and needs an explicit durable-source promotion decision. Platform-atomic no-follow acquisition and parent-directory crash durability remain Resource Admission/platform work. Issue #1129 remains the commercial decoder-dependency gate.

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (FIPS PUB 180-4). https://doi.org/10.6028/NIST.FIPS.180-4

National Institute of Standards and Technology. (2023, March 7). *Decision to revise FIPS 180-4, Secure Hash Standard (SHS).* https://csrc.nist.gov/news/2023/decision-to-revise-fips-180-4

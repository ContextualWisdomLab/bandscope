# Updater staging cleanup path identity

## Problem

`distribution-download` retained the staging descriptor and lease through cancellation or sealing, but cleanup was pathname-only: `Drop` closed the owned descriptor and then unconditionally removed the remembered pathname. If the owned staging entry was renamed away while the descriptor remained open and an unrelated regular file was created at the original basename, cleanup could delete that replacement object even though BandScope never opened or wrote it.

The staging lease serializes cooperating BandScope attempts. It is not a filesystem namespace capability and does not stop another same-user process from renaming or replacing a pathname. Cleanup therefore must not infer object ownership from a stale path string.

## RED evidence

Commit `4aca07e177198b75cfe166208b48808704b170e4` adds `apps/desktop/distribution-download/tests/path_replacement_cleanup.rs` for Unix desktop semantics.

The regression covers both lifecycle paths:

- a cancelled `StagedArtifactFile` whose owned inode is renamed away before `Drop`;
- a `SealedArtifactFile` whose owned inode is renamed away before verifier-owner cleanup.

Each case creates an unrelated replacement at the original staging basename before dropping the BandScope owner and requires those replacement bytes to survive. The previous close-then-`remove_file(path)` implementation deletes the replacement and violates the contract.

## Causal repair

Commit `bc72745df92fc048b25a84cca349a6ecf0d9daf1` routes both staged and sealed cleanup through one owner helper.

On Unix, cleanup reads the still-open descriptor identity (`dev`, `ino`) and compares it with `symlink_metadata` for the current pathname. The pathname is removed only when it is a direct regular non-symlink object with the same device/inode identity as the owned descriptor. A missing, symlinked, non-regular, or replaced pathname is left untouched. The descriptor is then closed and the staging lease is released.

The helper deliberately keeps the descriptor open until the identity comparison and optional unlink have completed; closing first would discard the strongest object reference available to the owner.

## Alternatives considered

- **Close then unconditionally remove the remembered path** — rejected because the pathname may now identify another filesystem object.
- **Check only that the pathname exists and is a regular file** — rejected because type equality is not object identity.
- **Never clean up on `Drop`** — rejected because cancelled and unverified updater artifacts would accumulate and make crash-safe restart semantics unreliable.
- **Claim equivalent Windows identity from unstable standard-library metadata extensions** — rejected. The stable implementation must not depend on nightly-only Windows by-handle metadata APIs merely to preserve a source-level parity claim.

## Claim boundary and residual risk

This repair closes the deterministic Unix/macOS/Linux case where a replacement pathname is already present when cleanup performs its identity check. It does not claim to defeat a malicious process that can win the remaining metadata-check-to-unlink race after the comparison. Descriptor-relative unlink or an equivalent OS capability would be required for that stronger hostile same-user guarantee.

Windows retains the prior best-effort close-then-remove behavior in this commit because stable Rust does not expose an equivalent file-index identity through the same portable metadata API used here. Windows path replacement, hard-link identity, and delete-sharing behavior therefore remain explicit Distribution acceptance gaps rather than being reported as parity-complete.

## Product effect

Cancellation and unverified-artifact cleanup no longer intentionally deletes a pathname merely because it has the same basename as the staging object BandScope originally created on Unix desktop targets. This protects unrelated local data from a stale cleanup action without promoting staging bytes to trusted release artifacts or changing the updater trust order.

The release trust order remains: provisional metadata and transport admission → authenticated release identity → cryptographic updater signature verification → sealed-descriptor digest/authenticated-size binding → explicit verified-artifact promotion → anti-replay decision and durable highest-seen mutation.

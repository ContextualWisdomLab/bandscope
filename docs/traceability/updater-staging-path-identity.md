# Updater staging cleanup path identity

## Problem

`distribution-download` retained the staging descriptor and lease through cancellation or sealing, but cleanup was pathname-only: `Drop` closed the owned descriptor and then unconditionally removed the remembered pathname. If the owned staging entry was renamed away while the descriptor remained open and an unrelated regular file was created at the original basename, cleanup could delete that replacement object even though BandScope never opened or wrote it.

The staging lease serializes cooperating BandScope attempts. It is not a filesystem namespace capability and does not stop another same-user process from renaming or replacing a pathname. Cleanup therefore must not infer object ownership from a stale path string.

The first repair closed this on Unix by comparing the still-open descriptor's `(dev, ino)` with the current pathname. Fresh review found that Windows still used the old close-then-`remove_file(path)` fallback. Rust 1.98.1 documents that Windows `OpenOptions` uses `FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE` by default, so another process can rename or delete the file while BandScope still has the handle open. The Windows fallback therefore preserved the exact replacement-path deletion class that the Unix repair was intended to remove.

## RED evidence

Commit `4aca07e177198b75cfe166208b48808704b170e4` originally added `apps/desktop/distribution-download/tests/path_replacement_cleanup.rs` for Unix desktop semantics.

Commit `308f4a618cbbfd07fc9380b721f9987b3cb373d1` extends those same cancelled and sealed replacement-path contracts to Windows. On the preceding implementation both tests reach the non-Unix cleanup helper, which closes the descriptor and unconditionally removes the remembered pathname; the unrelated replacement therefore does not survive.

The regression covers both lifecycle paths:

- a cancelled `StagedArtifactFile` whose owned file is renamed away before `Drop`;
- a `SealedArtifactFile` whose owned file is renamed away before verifier-owner cleanup.

Each case creates an unrelated replacement at the original staging basename before dropping the BandScope owner and requires those replacement bytes to survive.

## Causal repair

Commit `bc72745df92fc048b25a84cca349a6ecf0d9daf1` remains the Unix owner repair. Unix cleanup reads the still-open descriptor identity (`dev`, `ino`) and compares it with `symlink_metadata` for the current pathname. The pathname is removed only when it is a direct regular non-symlink object with the same device/inode identity as the owned descriptor. A missing, symlinked, non-regular, or replaced pathname is left untouched.

Commit `1d603316b0ff4ff8b737aea2ef57c76250e326d0` removes the unsafe Windows/non-Unix pathname unlink. Where stable Rust cannot prove that a remembered path still denotes the owned descriptor, `Drop` now closes the descriptor and leaves the app-owned scratch pathname untouched. This chooses a bounded stale-file cost over deleting an object whose ownership cannot be established.

The existing `StagedArtifactFile::create` restart path already acquires `.bandscope-staging.lock` before classifying a pre-existing child as stale and only reclaims a direct regular file. Commit `1a6ee097106cf2204cf9bdbcc0040999988f4e14` adds a Windows-specific contract proving that a deferred stale `update.bin` survives `Drop` and is reclaimed by the next leased staging attempt. The fix therefore does not turn deferred cleanup into permanent accumulation during subsequent updater attempts.

## Alternatives considered

- **Close then unconditionally remove the remembered path** — rejected because the pathname may now identify another filesystem object.
- **Check only that the pathname exists and is a regular file** — rejected because type equality is not object identity.
- **Use unstable Windows by-handle identity APIs** — rejected because production Distribution builds use stable Rust and must not depend on nightly-only metadata extensions merely to claim parity.
- **Treat default Windows sharing as an ownership lock** — rejected. Rust documents that the default share mode includes `FILE_SHARE_DELETE`, which permits delete/rename operations by compatible subsequent handles.
- **Disable delete sharing and unlink after closing the descriptor** — rejected because closing first recreates a pathname replacement race between handle close and `remove_file(path)`.
- **Never reclaim stale scratch** — rejected. Windows now defers destructive pathname cleanup on `Drop`, but the next app-owned staging attempt still reclaims a stale regular child only while holding the shared staging lease.

## Claim boundary and residual risk

On Unix/macOS/Linux, this repair closes the deterministic case where a replacement pathname is already present when cleanup performs its identity comparison. It does not claim to defeat a malicious process that can win the remaining metadata-check-to-unlink race after the comparison. Descriptor-relative unlink or an equivalent OS capability would be required for that stronger hostile same-user guarantee.

On Windows, this repair makes the stronger conservative claim that `Drop` will not delete any remembered staging pathname when stable source code cannot prove descriptor/path identity. It consequently leaves cancelled or sealed-but-unpromoted scratch bytes until the next staging attempt or another explicitly owner-safe cleanup path. This is a storage-retention tradeoff, not trust promotion: deferred bytes remain unverified scratch and are never accepted as a release artifact or freshness authority.

The regression depends on ordinary Windows rename behavior while a Rust file handle is open. Rust's Windows `OpenOptionsExt` documentation states that the default share mode includes `FILE_SHARE_DELETE`, allowing delete/rename by another process while the handle is open. Microsoft documents that `FILE_SHARE_DELETE` permits subsequent delete/rename access and that path-based deletion acts on the current pathname target, which is why close-then-delete cannot establish ownership.

## Product effect

Cancellation and unverified-artifact cleanup no longer intentionally deletes a pathname merely because it has the same basename as the staging object BandScope originally created on either Unix desktop targets or Windows. Unix removes only identity-matching paths; Windows defers path deletion to the next leased stale-file admission rather than guessing ownership.

The release trust order remains: provisional metadata and transport admission → authenticated release identity → cryptographic updater signature verification → sealed-descriptor digest/authenticated-size binding → explicit verified-artifact promotion → anti-replay decision and durable highest-seen mutation.

## References

Microsoft. (n.d.). *CreateFileA function (fileapi.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilea

Microsoft. (n.d.). *DeleteFile function (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-deletefile

The Rust Project Developers. (2026). *OpenOptionsExt in std::os::windows::fs* (Rust standard library 1.98.1). https://doc.rust-lang.org/std/os/windows/fs/trait.OpenOptionsExt.html

# Project Persistence Windows durability boundary

Last updated: 2026-09-19

## Problem

Project Persistence stages and `sync_all`s complete project bytes before publication, but the Windows existing-target path used `ReplaceFileW(..., dwReplaceFlags = 0)` and then treated replacement plus the existing `sync_parent_directory` no-op as if `ReplaceFileW` itself supplied write-through durability. That claim was not supported by the Win32 contract.

Microsoft documents `REPLACEFILE_WRITE_THROUGH` (`0x00000001`) for `ReplaceFileW` as **not supported**. Microsoft also documents that file-system metadata is always cached and that metadata changes must be flushed with `FlushFileBuffers` or written through. `MoveFileExW(MOVEFILE_WRITE_THROUGH)` does provide a write-through move contract, but that is a different API and did not cover the `ReplaceFileW` existing-target path or the hard-link first-save path.

The defect is therefore not “candidate bytes were never synchronized”: staged candidate bytes were already flushed before replacement. The defect is narrower and buyer-relevant: BandScope could acknowledge an existing-target replacement or retire rollback material without an explicit post-`ReplaceFileW` durability boundary for the exact published/restored file object. That is incompatible with the current crash-safe/power-loss claim boundary.

## Constraints

- Keep `ReplaceFileW` as the Windows atomic existing-target owner; do not introduce a second persistence engine.
- Preserve the durable prepared journal and rollback artifact until the published candidate is verified and flushed.
- If candidate verification or flush fails, restore the expected predecessor and flush that exact restored file before retiring rollback artifacts.
- Bind every post-replacement flush to the expected native volume/file-index identity so a pathname swap cannot redirect the durability operation.
- Keep Linux/macOS exchange + directory `fsync` behavior unchanged.
- Do not pretend that file-level flushing proves full packaged power-loss safety; packaged fault injection remains required.

## RED

Commit `eebe2eea6f43637f3fb3ee3a0709d6e0f9b43c90` adds the Windows-native regression `existing_project_replacement_rolls_back_when_candidate_flush_fails`. The regression requires the existing-target replacement owner to expose a test-only injected durability boundary. On the RED commit the required adapter did not exist, so the Windows owner could not satisfy the contract.

The regression models the causal failure after `ReplaceFileW`: the candidate is visible at the target pathname, its durability flush fails, the known-good predecessor is restored, and cleanup is allowed only after the restored predecessor reaches the durability boundary. Commit `336836a459c2f218d5c03e8430cd55b87a46674a` strengthens the same test to require candidate-stage and recovery-journal cleanup only after restored-target durability succeeds.

## GREEN source

Commit `5455fc84d7c465285ec2fa53cd01ed59204b10e6` makes the minimal causal repair:

- adds an identity-bound Windows file flush using a read/write no-reparse handle, exact `WindowsFileIdentity`, and `File::sync_all` (`FlushFileBuffers` on Windows);
- keeps `ReplaceFileW` for existing-target publication but requires the exact candidate flush before the prepared journal is promoted and rollback material is retired;
- if candidate validation/flush fails, restores the predecessor with `ReplaceFileW`, requires an identity-bound flush of the restored predecessor, and only then permits rollback cleanup;
- applies the same conservative flush rule when recovery encounters a published candidate or a prepared rollback state;
- requires Windows first-save hard-link publication to flush the exact linked file before removing its staging name; the `MoveFileExW(MOVEFILE_WRITE_THROUGH)` fallback retains its documented write-through move and is additionally identity-flushed before success.

The production path does not use a test fake. The injectable flush exists only under `cfg(all(windows, test))` and delegates to the same replacement state machine; normal production calls supply the identity-bound flush owner directly.

## Rejected alternatives

Using `REPLACEFILE_WRITE_THROUGH` is rejected because Microsoft explicitly documents the flag as unsupported.

Treating `MoveFileExW(MOVEFILE_WRITE_THROUGH)` as evidence for `ReplaceFileW` is rejected because the APIs have different contracts and the existing-target path calls `ReplaceFileW` with zero flags.

Changing the Windows parent-directory helper into a fabricated Unix-style directory `fsync` is rejected. The current repair uses a supported file-handle durability boundary and leaves directory-handle semantics outside the claim.

Deleting the journal/backup after a failed candidate flush is rejected because it would destroy the only recovery evidence before the restored predecessor is durably acknowledged.

Skipping the Windows regression, accepting a flush error, or weakening it to a source-string assertion is rejected because the buyer-visible invariant is state-machine behavior: failed candidate durability must not be reported as successful publication.

## Evidence boundary

This repair closes the unsupported source-level assertion that `ReplaceFileW` itself provides write-through durability and gives the Windows replacement/recovery state machine an explicit identity-bound flush before success or cleanup. It does **not** prove survival of hypervisor reset, physical power loss, controller-cache failure, filesystem corruption, disk-full during all journal phases, or packaged-app termination at every instruction boundary. Those remain #962 packaged fault-injection and recovery-evidence work.

The RED/GREEN source commits are not terminal release evidence. The final semantic/document descendant must reacquire Windows and macOS Project Persistence native results, general CI/build/security/SBOM/SAST gates, and qualifying independent review before merge or release.

## Primary references

Microsoft. (2023). *ReplaceFileW function (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew

Microsoft. (2021). *File caching*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/fileio/file-caching

Microsoft. (2021). *FlushFileBuffers function (fileapi.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers

Microsoft. (2023). *MoveFileExW function (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw

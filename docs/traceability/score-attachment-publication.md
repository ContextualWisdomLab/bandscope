# Score attachment publication

Issue: #1239  
Canonical owner: Score Storage / Score Attachment

## Problem

The desktop command admitted a selected PDF and then copied it into `<project>/scores` with `std::fs::copy`. That left the buyer-visible write contract implicit: first-visible Unix mode depended on copy/platform behavior, the source could change after path validation, an existing destination had no explicit no-clobber invariant, and partial-copy cleanup was not owned by a Score Storage boundary.

The native read-time 25 MiB allocation/content guard remains #865. Project/workspace directory authority remains Project Persistence #970. This slice owns score attachment publication and its lifecycle semantics.

Deletion had a separate authority gap. `remove_score_pdf` first resolved and canonicalized `<score_id>.pdf`, then later called pathname-based `std::fs::remove_file`. A local replacement between those operations could make validation apply to one object while deletion applied to another object at the same name.

## Decision

`publish_score_pdf_attachment` is the native Score Storage publication boundary.

- Reopen the already-admitted source once and bind copy to that descriptor.
- Snapshot descriptor length and reject `0` or `> 25 MiB` before copying.
- Copy through a fixed 64 KiB buffer. Early EOF is truncation; a one-byte probe after the snapshot detects growth. Both fail closed.
- Revalidate `%PDF-` on the bytes that are actually copied.
- Stage with `create_new`. Rust documents `create_new` as atomic with respect to an existing target; Unix `OpenOptionsExt::mode` supplies the creation mode before `umask` is applied. Unix therefore requests `0600` instead of creating broad permissions and tightening them later.
- Windows intentionally uses the app-owned scores directory ACL/inheritance model rather than claiming POSIX-equivalent `0600`. Its staging handle denies sharing while bytes are written, is synchronized, and is then closed before hard-link publication and stage cleanup.
- Publish with a hard link from the synchronized stage to `<score_id>.pdf`, so an existing score id is not overwritten.
- On Unix, stage identity is captured from the open file and cleanup compares device/inode before unlinking.
- On Windows, stage identity is captured from the original handle with `GetFileInformationByHandleEx(FileIdInfo)` as the volume serial number plus 128-bit file id. Cleanup reopens the stage pathname and requires that exact identity before unlinking. A different regular file at the same pathname is therefore not cleanup authority.
- Return the byte count from the descriptor-bound copy to IPC rather than trusting the earlier path-validation size snapshot.

`remove_score_pdf_attachment` owns the final score-file deletion authority after the caller has resolved the id inside the app-owned score root.

- Windows opens the exact file object with `DELETE | FILE_READ_ATTRIBUTES`, allows normal read/write/delete sharing, and uses `FILE_FLAG_OPEN_REPARSE_POINT` so a late reparse replacement is not followed. `SetFileInformationByHandle(FileDispositionInfo)` marks that same open file object for deletion. Microsoft requires `DELETE` access for this information class and documents deletion on handle close.
- Unix opens and pins the parent directory, opens the score basename through that directory with `openat(..., O_NOFOLLOW)`, captures device/inode from the opened file, and reopens the basename under the same parent descriptor before `unlinkat`. A replacement observed before that second identity check is preserved and deletion fails closed.
- Unix does **not** claim race-free object deletion: there remains a narrow identity-check-to-`unlinkat` basename replacement interval because portable POSIX `unlinkat` removes a directory entry, not an already-open file object. The stable parent descriptor removes ancestor-substitution authority but not that final name race.

## Hosted findings and repairs

Exact-source run `35451457938` on `69463eba53b61ba0505e4121317e3d726bfa4096` separated a platform contract from test/workflow noise. macOS passed the owned Score Storage unit and publication regressions. Windows passed all three owned unit tests but failed both publication regressions: the success path returned `Could not attach the score PDF.`, and the duplicate-destination case left the stage pathname behind. The common cause was the Windows stage handle opened with `share_mode(0)` remaining live while `hard_link` or `remove_file` needed pathname mutation.

The first repair kept `share_mode(0)` during the untrusted write, captured the stage identity while the handle was live, called `sync_all`, and dropped the handle before publication or cleanup. No sharing flag was loosened merely to make the test pass.

That exposed a second Windows-specific cleanup authority defect: after the protected write handle closed, the non-Unix cleanup path only checked that the stage pathname currently named a regular file. RED `a7373ca153e8740923ad13098953a61a7c263cc0` replaced the original stage after handle close and required cleanup to preserve the foreign file. Exact run `35452152802`, Windows job `105921067591`, checked out that exact SHA with Rust 1.97.1 and failed only `score_storage::tests::windows_cleanup_preserves_replaced_stage_path`; macOS job `105921067494` stayed green because the regression is Windows-only.

GREEN `49976461c7158869d1f10a6a43b46e0ee522352f` uses the Windows `FILE_ID_INFO` contract through a narrow `Kernel32` FFI call. Microsoft defines `FILE_ID_INFO` as a volume serial number plus 128-bit file identifier and states that the pair uniquely identifies a file on one computer. `FileIdInfo` is requested through `GetFileInformationByHandleEx`; the implementation compares that identity from the original open staging handle with the identity obtained after reopening the cleanup pathname. Stable Rust 1.97.1 does not need a nightly-only `MetadataExt` file-id surface or a new Windows dependency for this query.

The stage-cleanup repair is intentionally narrower than descriptor-relative deletion. After the reopened file identity is checked, the implementation still closes that handle and calls pathname-based `remove_file`; a replacement in that final compare-to-unlink interval remains residual TOCTOU risk. This PR does not claim to have eliminated that interval.

Deletion RED `06cc24a1b0bf89d1525cfb0b06921e9229e7b5dd` added a Tauri wiring contract requiring `remove_score_pdf` to consume the Score Storage deletion boundary rather than calling `std::fs::remove_file` directly. Exact `score-storage-native` run `35453934315` failed on both native lanes after all owned unit tests passed: macOS job `105925792583` and Windows Server 2025 job `105925792679` failed the publication/wiring regression step. This isolates the product-wiring authority gap rather than a compiler or dependency failure.

The deletion repair moves the final operation behind `remove_score_pdf_attachment`. Windows uses handle-bound `FileDispositionInfo`; a native replacement regression renames the opened score and creates a foreign file at the original pathname before disposition, and requires the foreign replacement to survive while only the originally opened object is deleted. Unix performs the analogous replacement before its second descriptor-relative identity check and requires fail-closed preservation of both the foreign replacement and the moved original.

## Alternatives rejected

`std::fs::copy` was rejected because it does not express the Score Storage invariants above as one auditable boundary. Process-wide `umask` mutation was rejected because it affects unrelated threads. Create-then-`chmod` was rejected because bytes can be visible before tightening. Overwriting an existing UUID destination was rejected even though collision probability is very small: storage correctness must not rely on UUID probability when a no-clobber primitive is available. Allowing Windows path sharing during the write was rejected as the first repair for the hosted failure; closing only after `sync_all` keeps the stronger write-phase boundary and makes the completed stage publishable. A 64-bit Windows file index was also rejected as the cleanup identity contract because Microsoft exposes a 128-bit `FILE_ID_INFO` specifically for file identity and documents the volume-serial-plus-file-id pair as the comparison key.

For retention deletion, a second pathname `stat`/metadata check was rejected because it only moves the race. Windows supports a stronger object-bound operation through a handle with `DELETE` authority, so pathname unlink is unnecessary there. On Unix, reopening by absolute pathname after validation was rejected in favor of pinning the parent directory and using `openat`/`unlinkat`; this narrows authority to the admitted directory even though portable `unlinkat` still cannot guarantee object-bound deletion across the last identity-check/name-removal interval.

## Security Notes

**Untrusted input.** The selected local PDF and any pre-existing pathname in the score workspace are untrusted. The file-dialog path itself is not sent by the WebView.

**Trust boundaries.** OS-selected path → existing score source admission → one opened source descriptor → app-owned Score Storage staging file → no-clobber buyer-visible attachment. Removal is validated score id → canonical in-root path → Score Storage OS-object deletion boundary.

**Safe failure.** Oversize, truncation, growth, wrong magic, duplicate destination, copy error, sync error, reparse/symlink object, or identity mismatch returns a payload-safe error. The implementation does not log or return PDF bytes or absolute source paths. After a successful hard link, an unexpected destination metadata mismatch is preserved rather than blindly unlinked because a pathname swap could make that destination foreign. Windows stage cleanup likewise preserves a replaced stage pathname when its `FILE_ID_INFO` identity no longer matches the captured stage. Retention deletion preserves a foreign replacement in the tested Windows handle-bound and Unix pre-`unlinkat` replacement cases.

**Privacy.** New Unix score bytes request `0600` at first visibility. Windows uses native ACL inheritance and does not claim POSIX permission equivalence.

**Test points.** Core tests cover valid publication, no-clobber publication, permissive-`umask(000)` Unix first visibility, descriptor growth, descriptor truncation, wrong magic, Tauri call-site wiring, Windows post-close stage-path replacement, ordinary authorized deletion, Windows foreign-path replacement after handle acquisition, and Unix foreign-path replacement before the second descriptor-relative identity check. Windows/macOS hosted exact-head results are required before this PR can advance.

## Remaining risk / claim boundary

This change does not prove packaged app crash/power-loss durability and does not make Score Storage part of Project Persistence. Parent-directory durability, project deletion semantics, detach retention policy beyond explicit attachment removal, actual Windows ACL/inheritance acceptance, and stage-cleanup descriptor-relative deletion remain acceptance work under #1239. Current path/workspace authority also depends on the eventual protected integration/reconciliation of #970; this PR does not copy Project Persistence directory-authority code.

Windows retention deletion is object-bound to the opened file handle for the tested local filesystem contract. Unix retention deletion pins the parent descriptor and verifies device/inode through `openat`, but the final identity-check-to-`unlinkat` interval remains a documented residual race. A future threat-model decision may require a platform-specific stronger primitive or a storage layout that makes untrusted concurrent pathname replacement impossible.

The implementation is stacked on #865 because write-time publication and read-time bounded validation share the score-native crate surface, but #865 remains the owner of reads. #1239 must be non-force reconciled after #865 and the relevant Project Persistence prerequisite integrate; predecessor CI evidence is not transferable to a restacked head.

## References

Microsoft. (2024, February 22). *FILE_ID_INFO structure (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_id_info

Microsoft. (2024, February 22). *GetFileInformationByHandleEx function (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getfileinformationbyhandleex

Microsoft. (2024, February 22). *FILE_DISPOSITION_INFO structure (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_disposition_info

Microsoft. (2024). *SetFileInformationByHandle function (fileapi.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle

Microsoft. (n.d.). *CreateFileA function (fileapi.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilea

The Open Group. (2024). *unlink, unlinkat — remove a directory entry*. POSIX.1-2024 / The Open Group Base Specifications Issue 8. https://pubs.opengroup.org/onlinepubs/9799919799/functions/unlink.html

The Open Group. (2024). *open, openat — open file relative to directory file descriptor*. POSIX.1-2024 / The Open Group Base Specifications Issue 8. https://pubs.opengroup.org/onlinepubs/9799919799/functions/open.html

The Rust Project Developers. (2026). *OpenOptions — std::fs*. Rust documentation. https://doc.rust-lang.org/std/fs/struct.OpenOptions.html

The Rust Project Developers. (2026). *OpenOptionsExt — std::os::unix::fs*. Rust documentation. https://doc.rust-lang.org/std/os/unix/fs/trait.OpenOptionsExt.html

The Rust Project Developers. (2026). *MetadataExt — std::os::windows::fs*. Rust documentation. https://doc.rust-lang.org/beta/std/os/windows/fs/trait.MetadataExt.html

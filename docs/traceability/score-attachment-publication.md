# Score attachment publication and retention

Issue: #1239  
Canonical owner: Score Storage / Score Attachment

## Problem

The desktop attachment command originally admitted a PDF and copied it into `<project>/scores` with `std::fs::copy`. That left first-visible permissions, source mutation during copy, no-clobber publication, partial-copy cleanup, and retention semantics implicit.

The native read-time 25 MiB allocation/content guard remains #865. Project/workspace directory authority remains Project Persistence #970. This lane owns score attachment publication and explicit attachment removal only.

Deletion had a separate authority gap. `remove_score_pdf` first resolved and canonicalized `<score_id>.pdf`, then later called pathname-based `std::fs::remove_file`. A local replacement between validation and deletion could make those operations refer to different file objects.

Publication cleanup also retained one Windows gap after the first identity repair: cleanup reopened the stage, compared `FILE_ID_INFO`, closed that handle, then called pathname-based `remove_file`. A replacement after the identity check could redirect cleanup to a foreign file.

## Publication decision

`publish_score_pdf_attachment` is the native Score Storage publication boundary.

- Reopen the already-admitted source once and bind copy to that descriptor.
- Snapshot descriptor length and reject `0` or `> 25 MiB` before copy.
- Copy through a fixed 64 KiB buffer. Early EOF is truncation; a one-byte probe after the snapshot detects growth. Both fail closed.
- Revalidate `%PDF-` on the bytes actually copied.
- Stage with `create_new`. Unix requests `0600` at first visibility rather than creating broad permissions and tightening them later.
- Windows does not synthesize a POSIX-style child ACL. The stage is created inside the app-owned scores directory and inherits that parent DACL. Native acceptance requires the published score DACL to remain unprotected (`SE_DACL_PROTECTED` clear) and to contain at least one ACE marked `INHERITED_ACE` on the Windows Server 2025 runner.
- Windows denies sharing during the untrusted write. The synchronized stage handle is closed before hard-link publication because pathname mutation is intentionally denied while that handle is live.
- Publish with a hard link to `<score_id>.pdf` so an existing attachment is never overwritten.
- Return the byte count from the descriptor-bound copy rather than the earlier path-validation size snapshot.

### Stage cleanup authority

On Unix, stage identity is device/inode from the owned stage. Cleanup compares that identity before pathname unlink. This still has a documented final identity-check-to-unlink race.

On Windows, cleanup now uses the same object-bound deletion model as explicit retention removal. It opens the stage with `DELETE | FILE_READ_ATTRIBUTES`, `FILE_FLAG_OPEN_REPARSE_POINT`, and normal read/write/delete sharing; rejects reparse/non-regular objects; verifies `FILE_ID_INFO` volume serial + 128-bit file id against the identity captured from the original staging handle; then calls `SetFileInformationByHandle(FileDispositionInfo)` on that same open handle. A later pathname replacement cannot redirect cleanup to the replacement.

## Retention/delete decision

`remove_score_pdf_attachment` owns the final score-file deletion authority after the caller resolves the id inside the app-owned score root.

- Windows opens the exact file object with `DELETE | FILE_READ_ATTRIBUTES`, rejects reparse objects, and marks that handle with `SetFileInformationByHandle(FileDispositionInfo)`. Microsoft documents `FILE_DISPOSITION_INFO.DeleteFile` as the request to delete the file and requires DELETE authority for this information class.
- Unix pins the parent directory, opens the score basename with `openat(..., O_NOFOLLOW)`, captures device/inode, then reopens the basename under the same parent descriptor immediately before `unlinkat`.
- A Unix replacement observed before the second identity check is preserved and deletion fails closed.
- Portable POSIX `unlinkat` removes a directory entry rather than an arbitrary already-open object, so the final identity-check-to-`unlinkat` basename interval remains a documented residual race. Pinning the parent removes ancestor substitution but does not erase that last name race.

## Hosted findings and repairs

### Publication and first Windows cleanup repair

Initial publication RED `f8ba40d10458ed6b7b3b0e9d4d8f79ec866c50df` added the publication contract before production code. That source-level RED was superseded before a hosted terminal compiler verdict, so no hosted claim is made for it.

Exact-source run `35451457938` on `69463eba53b61ba0505e4121317e3d726bfa4096` separated a Windows platform contract from workflow noise. macOS passed the owned Score Storage regressions. Windows passed the owned unit tests but failed publication because a `share_mode(0)` stage handle was still live while hard-link/unlink needed pathname mutation. The repair keeps exclusive sharing during untrusted write, captures stage identity, synchronizes, then closes the handle before publication.

A second Windows cleanup defect remained: post-close cleanup accepted any regular file at the stage pathname after its earlier identity assumptions. RED `a7373ca153e8740923ad13098953a61a7c263cc0` replaced the stage with a foreign regular file. Run `35452152802`, Windows job `105921067591`, failed the dedicated regression; macOS job `105921067494` stayed green. GREEN `49976461c7158869d1f10a6a43b46e0ee522352f` switched the comparison identity to `GetFileInformationByHandleEx(FileIdInfo)`, using volume serial plus 128-bit file id.

### Product deletion authority

RED `06cc24a1b0bf89d1525cfb0b06921e9229e7b5dd` added a Tauri wiring contract requiring `remove_score_pdf` to use a Score Storage deletion boundary rather than direct `std::fs::remove_file`. Exact run `35453934315` failed on both native lanes after owned unit tests passed: macOS job `105925792583` and Windows Server 2025 job `105925792679` failed the publication/wiring regression step.

GREEN `09610fb26127408f818a754a42b75a083e0e5045` routed the command through `remove_score_pdf_attachment`. Run `35454259017` was terminal-success on exact current source at that point: macOS job `105926649166` and Windows job `105926649120` both passed owned unit and publication/wiring regressions.

The Windows retention regression acquires the delete handle, renames the opened score, creates a foreign file at the old pathname, then marks the open handle for deletion. The replacement survives and only the originally opened object is deleted. The Unix counterpart replaces the basename before the second descriptor-relative identity check and requires fail-closed preservation of both files.

### Windows stage cleanup final-name race

RED `89f136e312ded829b89f2beafda68ca1c373044c` inserted a hook after Windows stage identity validation but before the old pathname unlink. The hook renames the owned stage and creates a foreign file at the former stage pathname. Exact run `35454589087` behaved as expected: macOS job `105927525260` stayed **SUCCESS** because the regression is Windows-only; Windows Server 2025 job `105927525168` failed in the owned Score Storage unit-test step. This is hosted RED evidence that identity-check-then-pathname-unlink was still redirectable.

GREEN `d36969bf4e3ed2c470c00db0bb07b1de0ec2fa70` keeps the identity-matched stage handle open with DELETE authority and applies `FileDispositionInfo` to that exact object. The same helper is used by retention deletion, avoiding two divergent Windows delete contracts. Exact native run `35454808019` passed on macOS job `105928096806` and Windows Server 2025 job `105928096678`.

### Windows ACL inheritance acceptance

Commit `579a67d4767d098d0dd608b5678d59e66efe1701` adds native inspection of the published score security descriptor using `GetNamedSecurityInfoW`, `GetSecurityDescriptorControl`, `GetAclInformation`, and `GetAce`. The test does not compare Windows permissions to Unix `0600`; it verifies the chosen Windows contract directly: the child DACL is not protected from parent inheritance and the resulting DACL contains at least one ACE carrying `INHERITED_ACE`.

Exact `score-storage-native` run `35455174325` passed on macOS job `105929062031` and Windows Server 2025 job `105929062235`, including the Windows ACL regression. This closes the file-level ACL-inheritance evidence gap for the current parent directory model. It does not pre-approve whatever parent-directory ACL #970 eventually establishes; workspace reconciliation still requires a fresh exact-head run.

## Alternatives rejected

`std::fs::copy` was rejected because it does not express the publication invariants as one auditable boundary. Process-wide `umask` mutation was rejected because it affects unrelated threads. Create-then-`chmod` was rejected because bytes can be visible before tightening. Overwriting a UUID destination was rejected because correctness must not rely on collision probability when a no-clobber primitive exists.

A second pathname `stat` before deletion was rejected because it only moves the race. Windows provides an object-bound delete operation through a handle with DELETE authority, so closing the identity handle and later unlinking the name is unnecessary. For Unix, absolute-path reopening was rejected in favor of a pinned parent descriptor plus `openat`/`unlinkat`; this narrows authority while retaining an explicit residual POSIX name race.

Weakening the Windows staging write share mode was also rejected. The write remains non-shareable until `sync_all`; only the completed stage is reopened under the narrower deletion contract.

## Security Notes

**Untrusted input.** Selected PDF bytes/path and any pre-existing score destination, staging, or retention name are untrusted. File-dialog paths and PDF bytes are not echoed to the WebView in errors.

**Trust boundaries.** OS-selected source → source admission → descriptor-bound Score Storage stage → no-clobber attachment. Explicit removal is validated in-root score path → Score Storage OS-object deletion boundary.

**Safe failure.** Oversize, truncation, growth, wrong magic, duplicate destination, copy/sync failure, reparse/symlink object, or identity mismatch fails closed with payload-safe diagnostics. Unexpected foreign replacements are preserved in the tested Windows object-bound races and Unix pre-`unlinkat` replacement case.

**Privacy.** Unix publication requests `0600` at first visibility. Windows publication deliberately inherits the app-owned parent DACL; the native acceptance test verifies that the child is not DACL-protected and contains inherited ACEs rather than asserting POSIX-equivalent permissions.

**Test points.** Core/native tests cover valid publication, no-clobber publication, permissive-`umask(000)` Unix first visibility, Windows parent-DACL inheritance, descriptor growth/truncation, wrong magic, Tauri call-site wiring, Windows post-close stage replacement, Windows stage replacement after identity acquisition, ordinary authorized deletion, Windows retention replacement after delete-handle acquisition, and Unix retention replacement before the second descriptor-relative identity check.

## Remaining risk / claim boundary

This work does not prove packaged-app crash or power-loss durability and does not make Score Storage part of Project Persistence. Parent-directory durability, project deletion semantics, buyer-visible detach/project lifecycle, and Project Persistence #970 workspace reconciliation remain open. The Windows file-level inheritance contract is now tested, but a changed workspace ACL after #970 integration requires fresh acceptance rather than evidence transfer.

Windows explicit removal and Windows stage cleanup are object-bound to the handles used by `FileDispositionInfo` for the tested local-filesystem contract. Unix explicit removal and Unix stage cleanup still retain final pathname/name races unless a stronger platform-specific primitive or storage invariant is adopted. Those risks must remain visible in the threat model rather than being described as race-free.

The implementation is stacked on #865 because write-time publication and read-time bounded validation share the score-native crate surface. #865 remains the owner of reads and must integrate first. Any later restack requires fresh exact-head evidence; predecessor CI is not transferable.

## References

Microsoft. (2024, February 22). *FILE_ID_INFO structure (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_id_info

Microsoft. (2024, February 22). *GetFileInformationByHandleEx function (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getfileinformationbyhandleex

Microsoft. (2024, February 22). *FILE_DISPOSITION_INFO structure (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_disposition_info

Microsoft. (2024). *SetFileInformationByHandle function (fileapi.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle

Microsoft. (n.d.). *ACE inheritance rules*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/secauthz/ace-inheritance-rules

Microsoft. (n.d.). *Automatic propagation of inheritable ACEs*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/secauthz/automatic-propagation-of-inheritable-aces

Microsoft. (n.d.). *GetNamedSecurityInfoW function (aclapi.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-getnamedsecurityinfow

Microsoft. (n.d.). *CreateFileA function (fileapi.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilea

The Open Group. (2024). *unlink, unlinkat — remove a directory entry*. POSIX.1-2024 / The Open Group Base Specifications Issue 8. https://pubs.opengroup.org/onlinepubs/9799919799/functions/unlink.html

The Open Group. (2024). *open, openat — open file relative to a directory file descriptor*. POSIX.1-2024 / The Open Group Base Specifications Issue 8. https://pubs.opengroup.org/onlinepubs/9799919799/functions/open.html

The Rust Project Developers. (2026). *OpenOptions — std::fs*. Rust documentation. https://doc.rust-lang.org/std/fs/struct.OpenOptions.html

The Rust Project Developers. (2026). *OpenOptionsExt — std::os::unix::fs*. Rust documentation. https://doc.rust-lang.org/std/os/unix/fs/trait.OpenOptionsExt.html
# Score attachment publication and retention

Issue: #1239  
Canonical owner: Score Storage / Score Attachment

## Problem and owner boundary

The desktop attachment command originally admitted a PDF and copied it into `<project>/scores` with `std::fs::copy`. That left first-visible permissions, source mutation during copy, no-clobber publication, partial-copy cleanup, final-object identity, and retention semantics implicit.

The native read-time 25 MiB allocation/content guard remains #865. Project/workspace directory authority remains Project Persistence #970. This lane owns score attachment publication and explicit attachment removal/retention only.

Deletion had two separate authority problems. First, the product resolved and canonicalized `<score_id>.pdf` and later removed a pathname, allowing validation and deletion to refer to different objects. Second, the Tauri command treated every `resolve_existing_score_pdf` error as `Ok(false)`. That collapsed a genuinely absent entry together with symlink/non-regular, containment, canonicalization, permission, and other indeterminate states. The UI could therefore treat unsafe storage as "already gone" and remove attachment metadata.

Publication also had two independent identity gaps. Windows stage cleanup initially compared `FILE_ID_INFO`, closed that handle, and then unlinked a pathname, so a late replacement could redirect cleanup. Final publication initially accepted any regular destination of the expected length, so a same-length foreign file could be accepted as the score.

## Publication decision

`publish_score_pdf_attachment` is the native Score Storage publication boundary.

- Reopen the already-admitted source once and bind copy to that descriptor.
- Snapshot descriptor length and reject `0` or `> 25 MiB` before copy.
- Copy through a fixed 64 KiB buffer. Early EOF is truncation; a one-byte probe after the snapshot detects growth. Both fail closed.
- Revalidate `%PDF-` on the bytes actually copied.
- Stage with `create_new`. Unix requests `0600` at first visibility rather than creating broad permissions and tightening them later.
- Windows inherits the app-owned scores-directory DACL. Native acceptance requires the child DACL to remain unprotected (`SE_DACL_PROTECTED` clear) and contain at least one `INHERITED_ACE`; this is the Windows contract rather than a POSIX `0600` analogy.
- Windows denies sharing during the untrusted write. The synchronized stage handle closes before hard-link publication because pathname mutation is intentionally denied while that handle is live.
- Publish with a hard link to `<score_id>.pdf`; an existing score id is never overwritten.
- Before returning attachment authority, attest that the destination is the exact synchronized stage object: device/inode on Unix, volume serial + 128-bit `FILE_ID_INFO` on Windows. Reject symlink/reparse and non-regular destinations. Repeat the identity check after retiring the temporary stage alias.
- Return the byte count from the descriptor-bound copy rather than an earlier path-validation size snapshot.

### Stage cleanup authority

On Unix, stage identity is device/inode from the owned stage. Cleanup compares identity before pathname unlink. A final identity-check-to-unlink name race remains explicit.

On Windows, cleanup opens the stage with `DELETE | FILE_READ_ATTRIBUTES`, `FILE_FLAG_OPEN_REPARSE_POINT`, and read/write/delete sharing; rejects reparse/non-regular objects; verifies volume serial + 128-bit file id against the staging identity; then calls `SetFileInformationByHandle(FileDispositionInfo)` on that same handle. A foreign replacement cannot redirect deletion to itself.

## Retention/delete decision

`remove_score_pdf_attachment` owns final score-file deletion after Score Storage has resolved an authorized attachment.

- Windows opens the exact non-reparse object with `DELETE | FILE_READ_ATTRIBUTES` and marks that handle with `FileDispositionInfo`.
- Unix pins the parent directory, opens the score basename with `openat(..., O_NOFOLLOW)`, captures device/inode, reopens under the same parent descriptor immediately before `unlinkat`, and fails closed if identity changed.
- Portable POSIX `unlinkat` removes a directory entry rather than an arbitrary already-open object. Parent pinning removes ancestor substitution but not the final identity-check-to-`unlinkat` basename race.

`resolve_score_pdf_for_removal` owns the missing-versus-unsafe classification before deletion:

- validate the score id before joining a local name;
- require the supplied scores workspace itself to exist as a directory before interpreting any child `NotFound`; broader app-owned workspace/link authority remains Project Persistence #970;
- inspect the exact `<score_id>.pdf` directory entry with `symlink_metadata`;
- return `Ok(None)` only when that child lookup reports `ErrorKind::NotFound` under the existing workspace;
- once an entry is observed, delegate to the existing `resolve_existing_score_pdf` authority and convert any symlink, non-regular, canonicalization, containment, permission, concurrent-disappearance, or other validation failure into a removal error;
- return `Some(path)` only for an authorized existing score.

The Tauri command therefore returns `false` only for an observed absent child under an existing score workspace. Unsafe or indeterminate storage remains an error, so buyer metadata is not silently discarded while the file is still present or unverified. This is an absence observation, not a durable non-existence guarantee: another same-user/local actor can create the pathname after `NotFound` and before metadata changes.

## Successful-publication restart/readback decision

Restart/readback acceptance is separated from interrupted-publication recovery.

`score_pdf_restart_readback` publishes a real PDF fixture through `publish_score_pdf_attachment`, then launches a fresh instance of the native Rust test executable. The child process resolves the published score through production `resolve_existing_score_pdf`, reads it through production `read_validated_score_pdf`, and requires exact bytes. After the child exits, the parent requires zero `.score-*.stage` aliases for that successful publication.

This proves a successfully returned attachment survives process teardown and can be reopened through the normal native authority/read path without relying on in-process state. It also proves the success path retires its stage alias before later process use.

It does **not** prove recovery from a process kill during publication, cancellation, disk-full, permission failure, power loss, or discovery/cleanup of a stage abandoned before publication completed. Those remain separate #1239/#970 acceptance work.

## Hosted findings and repairs

### Publication and Windows cleanup

Initial publication RED `f8ba40d10458ed6b7b3b0e9d4d8f79ec866c50df` established the publication contract before production code. That source-level RED was superseded before a terminal hosted compiler verdict, so no hosted claim is made for it.

Exact-source run `35451457938` on `69463eba53b61ba0505e4121317e3d726bfa4096` isolated a Windows sharing contract: macOS passed, while Windows publication failed because a `share_mode(0)` stage handle was still live during hard-link/unlink. The repair keeps exclusive sharing during untrusted write, captures identity, synchronizes, and only then closes before publication.

RED `a7373ca153e8740923ad13098953a61a7c263cc0` replaced the Windows stage pathname with a foreign regular file. Run `35452152802`, Windows job `105921067591`, failed that regression while macOS job `105921067494` remained green. GREEN `49976461c7158869d1f10a6a43b46e0ee522352f` switched comparison to `GetFileInformationByHandleEx(FileIdInfo)`.

RED `89f136e312ded829b89f2beafda68ca1c373044c` then replaced the stage after Windows identity validation but before the old pathname unlink. Exact run `35454589087` kept macOS job `105927525260` green and failed Windows job `105927525168`. GREEN `d36969bf4e3ed2c470c00db0bb07b1de0ec2fa70` keeps the identity-matched delete handle open and applies `FileDispositionInfo`; run `35454808019` passed macOS `105928096806` and Windows `105928096678`.

### Product deletion authority

RED `06cc24a1b0bf89d1525cfb0b06921e9229e7b5dd` required the Tauri removal command to use Score Storage deletion rather than direct `std::fs::remove_file`. Exact run `35453934315` failed the wiring regression on macOS `105925792583` and Windows Server 2025 `105925792679`. GREEN `09610fb26127408f818a754a42b75a083e0e5045` routed removal through `remove_score_pdf_attachment`; run `35454259017` passed macOS `105926649166` and Windows `105926649120`.

The Windows replacement regression acquires the delete handle, renames the opened score, creates a foreign file at the former pathname, then marks only the open handle for deletion. The replacement survives. The Unix counterpart replaces the basename before the second descriptor-relative identity check and requires fail-closed preservation.

### Windows ACL inheritance

Commit `579a67d4767d098d0dd608b5678d59e66efe1701` inspects the published child security descriptor using `GetNamedSecurityInfoW`, `GetSecurityDescriptorControl`, `GetAclInformation`, and `GetAce`. Exact run `35455174325` passed macOS job `105929062031` and Windows Server 2025 job `105929062235`, proving the selected child-inheritance contract for the current parent directory model. A changed workspace ACL after #970 integration requires fresh acceptance; this evidence is not transferable.

### Final publication object identity

RED `3274560cff4b8ecec5856d6f358e1a5fcea1c212` moved the owned hard link aside and wrote a different same-length regular PDF at `<score_id>.pdf`. Exact run `35456813143` failed the owned unit-test step on macOS `105933454955` and Windows Server 2025 `105933455061`, proving regular-file + length attestation insufficient.

GREEN `91c240385acdc7ae5dea4a2ebd7c32db0f53953f` added platform object-identity attestation. Exact native run `35456879153` passed macOS `105933633903` and Windows `105933633950`.

### Missing versus unsafe removal resolution

Contract commit `9ba8c0b9ceeb8b6b3fbaa33fb858af9db1b9b951` first introduced `score_pdf_retention_resolution` for genuinely absent entries, normal regular scores, directory masquerades, Unix symlink replacement, and Tauri wiring. The workflow at that commit did not execute the new test target; run `35459793839` therefore completed successfully and is not RED evidence. The workflow omission was repaired by adding `score_pdf_retention_resolution` to the owner command and `score_retention.rs` to its path filter.

The first implementation then revealed a narrower classification bug: a missing scores workspace caused `symlink_metadata(<missing-root>/<score>.pdf)` to report `NotFound`, which was incorrectly treated as an idempotent missing attachment. RED `22749b83d9c7e6f7e3c0b5986af5802427e98d2a` requires an existing workspace before child absence can produce `None`. Exact `score-storage-native` run `35460119001` failed the retention regression on macOS job `105942349093` and Windows Server 2025 job `105942349170`; the existing owner suites passed before the targeted failure.

GREEN `6444f21a158a877ae402fd665469d908f8afa3a2` checks the supplied score workspace with `symlink_metadata` and requires a directory before child lookup. It deliberately does not recreate Project Persistence link/reparse policy; #970 remains the broader workspace authority. Exact run `35460197487` is terminal **SUCCESS** on macOS job `105942555476` and Windows Server 2025 job `105942555631`.

`36325246e060dae612eccad8e619d8e2b5b494c4` made this document code-current for the retention repair. Exact run `35460313972` was terminal SUCCESS on Windows Server 2025 job `105942873778` and macOS job `105942873910`.

### Successful-publication restart/readback

`297327de172bbe30cdf226518a5135605db983ef` adds the fresh-process restart/readback regression. `0e4070ef6d92d55a91463e8bc4c1fa6b71f86003` adds that target to the macOS/Windows owner workflow.

Exact owner run `35463057196` checked out `0e4070ef6d92d55a91463e8bc4c1fa6b71f86003` and passed the owned Score Storage unit suite plus publication, retention, restart/readback, and wiring regressions on macOS job `105950252549` and Windows Server 2025 job `105950252698`.

This document update is a later exact source identity, so that predecessor GREEN is lineage evidence only. The current head must reacquire owner and repository-wide checks without transferring the `0e4070ef…` verdict.

## Alternatives rejected

`std::fs::copy` was rejected because it does not express publication invariants as one auditable boundary. Process-wide `umask` mutation was rejected because it affects unrelated threads. Create-then-`chmod` was rejected because bytes can be visible before tightening. Overwriting a UUID destination was rejected because correctness must not rely on collision probability when no-clobber publication exists.

A second pathname `stat` before deletion was rejected because it only moves the race. Windows has object-bound deletion through a handle with DELETE authority. On Unix, absolute-path reopening was rejected in favor of a pinned parent descriptor plus `openat`/`unlinkat`.

Treating all resolver failures as absence was rejected because filesystem corruption, permission failure, symlink/reparse substitution, containment failure, missing workspace, and concurrent mutation are not evidence that the attachment is gone. Error-message string matching was also rejected: the resolver intentionally uses payload-safe generic messages and strings are not a stable domain discriminator. The selected contract performs the narrow child-`NotFound` classification only after the score workspace itself has been observed as a directory, then preserves every later failure.

Length-only final publication checks were rejected because a same-length foreign regular file is not the staged score. Path hashing was rejected as the primary identity primitive because it still binds verification to whichever object the pathname resolves to and requires a second full PDF read. The selected contract uses OS object identity plus the descriptor-bound byte count.

Weakening Windows staging share mode was rejected. The write remains non-shareable until `sync_all`; only the completed stage is reopened under the narrower deletion contract.

A same-process reopen was rejected as restart/readback acceptance because it can accidentally rely on process state. The selected regression launches a fresh native test process and traverses the normal resolver plus bounded reader. Conversely, that success-path test is not used as evidence for interruption recovery because it never kills a writer with selected PDF bytes still staged.

## Security Notes

**Untrusted input.** Selected PDF bytes/path and any pre-existing score destination, staging, or retention name are untrusted. File-dialog paths and PDF bytes are not echoed to the WebView in errors.

**Trust boundaries.** OS-selected source → source admission → descriptor-bound Score Storage stage → no-clobber, object-identity-attested attachment. Removal is validated score id → existing score-workspace precondition → exact child absence classification → existing in-root path authority → Score Storage OS-object deletion boundary. Restart/readback crosses a process lifetime boundary but does not add IPC, network, or database authority.

**Safe failure.** Oversize, truncation, growth, wrong magic, duplicate destination, copy/sync failure, reparse/symlink/non-regular object, identity mismatch, missing workspace, unsafe resolution, and indeterminate I/O fail closed with path/payload-safe diagnostics. Foreign replacements are preserved in the covered final-publication, Windows object-bound cleanup, and Unix pre-`unlinkat` replacement cases.

**Privacy.** Unix publication requests `0600` at first visibility. Windows publication deliberately inherits the app-owned parent DACL and tests that inheritance directly rather than asserting POSIX equivalence. The restart regression uses only generated PDF fixture bytes under a temporary test workspace; it does not log buyer PDF contents or source paths.

**Test points.** Native tests cover valid/no-clobber publication, same-length foreign final-destination replacement, permissive-`umask(000)` Unix first visibility, Windows parent-DACL inheritance, source growth/truncation, wrong magic, Tauri publication/deletion wiring, Windows post-close stage replacement, Windows late-stage replacement after identity acquisition, ordinary authorized deletion, Windows retention replacement after delete-handle acquisition, Unix replacement before the second descriptor-relative identity check, removal classification for existing-root absent child/missing workspace/regular/directory/Unix symlink states, and successful-publication fresh-process restart/readback with successful-path stage-alias retirement.

## Remaining risk / claim boundary

This work does not prove packaged-app crash or power-loss durability and does not make Score Storage part of Project Persistence. Parent-directory durability, project deletion semantics, buyer-visible detach/project lifecycle, cancellation/interruption orphan acceptance, and #970 workspace reconciliation remain open. The Windows file-level inheritance contract must be re-run if #970 changes parent-directory ACL authority.

Successful-publication restart/readback is now covered at the native process boundary. It does not prove that an interrupted writer leaves no stage file, that a later process can safely distinguish an orphan from an active writer, or that cancellation/disk-full/power-loss recovery is complete.

A successful final publication attests that the pathname resolves to the synchronized stage object at that instant; it does not make the name immutable afterward. A later same-user/local replacement belongs to read/path authority.

Windows explicit removal and stage cleanup are object-bound for the tested local-filesystem contract. Unix explicit removal and Unix stage cleanup retain final basename races unless a stronger platform primitive or storage invariant is adopted. `Ok(None)` from retention resolution is likewise an observed child absence under an existing workspace, not an atomic reservation preventing subsequent creation.

The implementation remains stacked on #865 because write-time publication and read-time bounded validation share the score-native crate surface. #865 must integrate first. Any later restack requires fresh exact-head evidence; predecessor CI is not transferable.

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

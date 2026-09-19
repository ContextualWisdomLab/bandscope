# Score attachment publication and retention

Issue: #1239  
Canonical owner: Score Storage / Score Attachment

## Problem and owner boundary

Score attachment bytes are buyer data. This bounded context owns score-PDF write-time confidentiality, bounded publication, final-object identity, abandoned-stage recovery, explicit removal and retention semantics. Native read-time allocation/content validation remains #865. App-owned project/workspace link, ACL and lifecycle authority remains Project Persistence #970. Score Storage consumes that workspace as a narrow filesystem boundary and does not copy Project Persistence policy.

The original desktop command copied a selected PDF with `std::fs::copy`. Subsequent repairs established a descriptor-bounded 25 MiB copy, private staging, no-clobber publication, OS-object identity attestation and object-aware deletion. Two lifecycle problems are distinct:

1. a successfully returned attachment must survive process teardown and fresh-process readback;
2. a process can die after selected PDF bytes have reached `.score-<uuid>.stage`, leaving buyer bytes behind even though no attachment authority was returned.

The first is successful-publication durability/readability. The second is interrupted staging recovery. Neither is Project Persistence project-file recovery.

## Publication contract

`score_storage::publish_score_pdf_attachment` remains the lower-level publication primitive.

- Reopen the admitted source once and bind copy to that descriptor.
- Snapshot descriptor length; reject zero and `> 25 MiB`.
- Copy with a fixed 64 KiB buffer; early EOF and post-copy growth probe fail closed.
- Revalidate `%PDF-` on bytes actually copied.
- Stage with `create_new`; Unix requests `0600` at first visibility. Windows inherits the app-owned parent DACL and native acceptance verifies inherited ACE evidence.
- Keep the Windows write handle non-shareable until `sync_all` finishes.
- Publish by hard-link to `<score_id>.pdf`; never overwrite an existing score id.
- Attest destination identity to the synchronized stage object before and after retiring the stage alias: device/inode on Unix, volume serial + 128-bit `FILE_ID_INFO` on Windows.
- Return the descriptor-bound byte count, not a stale path metadata value.

Windows stage cleanup reopens the exact non-reparse stage with DELETE authority, verifies file identity and applies `FileDispositionInfo` to that handle. Unix cleanup still has a documented final identity-check-to-path-unlink race.

## Process-abandoned staging recovery

The crate-root `publish_score_pdf_attachment` now routes through `score_recovery` before calling the lower-level publisher.

A cross-process Score Storage workspace lease spans both recovery and the complete publication:

- Unix opens persistent `.score-storage.lock` with `O_NOFOLLOW`, mode `0600`, then takes non-blocking exclusive `flock`.
- Windows opens the persistent lock file with no sharing and `FILE_FLAG_OPEN_REPARSE_POINT`; a reparse lock object is rejected.
- The operating system releases the held lease when the process exits, including abnormal termination. The lock file itself contains no buyer payload.
- Recovery only examines the reserved exact namespace `.score-<lowercase-hyphenated-uuid>.stage`. Malformed names are outside Score Storage ownership and are ignored rather than broadened into a glob-delete contract.
- A reserved stage must be a regular, non-reparse object. Suspicious reserved objects fail closed.
- A stage-only orphan with no matching `<uuid>.pdf` is removed through the existing Score Storage object-deletion boundary.
- If both `.score-<uuid>.stage` and `<uuid>.pdf` exist, recovery fails closed and preserves both. Interruption may have happened after hard-link publication but before higher-level attachment metadata persistence; Score Storage does not infer buyer lifecycle intent from those two names.

This lease prevents another process that uses the same current Score Storage contract from being mistaken for a stale writer. It deliberately does **not** claim compatibility with an older concurrently running BandScope build that never acquires the lease. Broader ancestor-link/workspace authority still belongs to #970 and requires fresh reconciliation after #970 integrates.

## Retention/delete contract

`resolve_score_pdf_for_removal` distinguishes genuine absence from unsafe or indeterminate storage:

- validate score id before local name construction;
- require the supplied scores workspace to exist as a directory before a child `NotFound` can mean absence;
- return `Ok(None)` only for an observed missing `<score_id>.pdf` child under that existing workspace;
- once an entry exists, preserve symlink/non-regular/canonicalization/containment/permission/concurrent-disappearance failures as errors.

`remove_score_pdf_attachment` then owns final object deletion. Windows marks the exact opened object for deletion with `FileDispositionInfo`. Unix pins the parent directory, opens the basename with `openat(..., O_NOFOLLOW)`, rechecks device/inode and then calls `unlinkat`; the final basename race remains explicit.

## UI/application lifecycle ordering

The Score view is the application-service boundary that coordinates buyer-visible attachment metadata with Score Storage bytes; it does not move either bounded context's lower-level authority into React.

Attachment is necessarily a two-step operation: publish and verify the PDF first, then ask the owning project mutation callback to accept the new attachment metadata. The callback may be asynchronous. A return value of `false` means the owning Project Persistence path did not durably accept that metadata. In that case ScoreView does **not** open or otherwise present the newly published PDF as an accepted attachment, and it deliberately does not delete those bytes: the PDF is a recovery candidate until #970 supplies the durable attachment lifecycle/reconciliation contract. Legacy synchronous callbacks returning `void` remain accepted for the pre-#970 stack.

Detach uses the opposite safety ordering because deletion is destructive. ScoreView first asks the project owner to accept metadata without the attachment. Only after that update is accepted does it call the Score Storage deletion boundary. A rejected metadata update therefore leaves the still-referenced PDF bytes intact. If metadata removal succeeds but byte deletion later fails, the project no longer holds a broken reference to missing bytes; the remaining file is an unreferenced cleanup/recovery candidate and the storage error is surfaced. This is intentionally preferable to deleting buyer bytes first and then discovering that durable metadata still references them.

`ScoreView.persistenceOutcome.test.tsx` covers three application-level invariants: rejected attachment metadata does not trigger PDF read/open acceptance; rejected detach metadata never calls destructive removal; accepted detach invokes metadata acceptance before Score Storage deletion. This is ordering evidence only. It does not claim an atomic filesystem-plus-project transaction, restart reconciliation, multi-window serialization, or packaged crash coverage.

## Successful-publication restart/readback

`score_pdf_restart_readback` publishes through the production crate-root boundary, starts a fresh native test process, resolves the stored score through `resolve_existing_score_pdf`, reads it through `read_validated_score_pdf` and requires exact bytes. The success path also requires zero `.score-*.stage` aliases after publication.

This proves a successfully returned attachment survives one process lifetime and is readable through the normal bounded native path. It is separate from interrupted-writer recovery.

## Interruption RED and repair

Commit `2c55e34c7262d087783502050cd9f084a1f7255c` added `score_pdf_interruption_recovery`. A child native test process writes and synchronizes selected PDF fixture bytes into the exact reserved `.score-<uuid>.stage` shape, exposes a readiness marker and remains alive. The parent confirms the stage exists, terminates and reaps that child, then attempts a different score publication through the production crate-root API and requires all score staging aliases to be gone before attachment authority returns.

`45ae83d84f7416f9d0567fa1a47f65f0854a086a` put that regression into the macOS/Windows owner workflow. Descendant pushes superseded the early workflow run before a terminal RED verdict, so no hosted RED is claimed for that source. The pre-repair behavior is nevertheless a deterministic source RED: publishing a different UUID had no code path that removed the abandoned earlier stage, so the final zero-stage assertion could not hold.

`ad2c4633fba5a9a981859407a035a2b9c367f9ec` added the OS-released workspace lease and reserved-stage recovery. `a1f21f1310ab6af96109def3575220e0017e19a2` routed the public crate-root publisher through recovery. `f4962d21b77148ff7e90ac4349979d666ef32d75` tightened the owner workflow so both lower-level Score Storage and recovery unit suites plus publication, retention, interruption, restart and wiring regressions execute.

At `f4962d21b77148ff7e90ac4349979d666ef32d75`, Windows Server 2025 job `105959193774` in run `35466321613` passed checkout, Rust 1.97.1, both owned unit suites and all publication/retention/interruption/restart/wiring regressions. The document update is a later source identity, so exact-current-head native evidence must be reacquired and recorded on PR #1241 rather than transferring this predecessor verdict.

The process-kill acceptance is intentionally scoped: it verifies recovery of a synchronized **stage-only** artifact left by a terminated process, followed by a production publication. It does not claim that the test kills the lower-level publisher at every internal instruction point. Packaged-app process-kill, disk-full, permission failure, explicit cancellation, power loss and stage-plus-destination lifecycle recovery remain separate acceptance.

## Earlier hosted evidence retained

- Windows share-mode repair: run `35451457938` isolated the hard-link/unlink failure while the exclusive write handle was live.
- Windows foreign-stage replacement RED `a7373ca153e8740923ad13098953a61a7c263cc0`: run `35452152802`, Windows `105921067591`, failed; `49976461c7158869d1f10a6a43b46e0ee522352f` moved identity to `FILE_ID_INFO`.
- Windows identity-check-to-unlink RED `89f136e312ded829b89f2beafda68ca1c373044c`: run `35454589087` failed Windows `105927525168`; `d36969bf4e3ed2c470c00db0bb07b1de0ec2fa70` made cleanup handle-bound and run `35454808019` passed Windows/macOS.
- Tauri direct-delete wiring RED `06cc24a1b0bf89d1525cfb0b06921e9229e7b5dd`: run `35453934315` failed Windows/macOS; `09610fb26127408f818a754a42b75a083e0e5045` routed removal through Score Storage and run `35454259017` passed.
- Windows inherited-DACL acceptance `579a67d4767d098d0dd608b5678d59e66efe1701`: run `35455174325` passed macOS `105929062031` and Windows `105929062235`.
- Final destination identity RED `3274560cff4b8ecec5856d6f358e1a5fcea1c212`: run `35456813143` failed macOS `105933454955` and Windows `105933455061`; `91c240385acdc7ae5dea4a2ebd7c32db0f53953f` added OS-object identity and run `35456879153` passed.
- Missing-workspace retention RED `22749b83d9c7e6f7e3c0b5986af5802427e98d2a`: run `35460119001` failed macOS `105942349093` and Windows `105942349170`; `6444f21a158a877ae402fd665469d908f8afa3a2` repaired classification and run `35460197487` passed.
- Successful-publication fresh-process readback: `297327de172bbe30cdf226518a5135605db983ef` plus workflow wiring `0e4070ef6d92d55a91463e8bc4c1fa6b71f86003`; run `35463057196` passed macOS `105950252549` and Windows `105950252698`.

## Alternatives rejected

Blind `.score-*.stage` glob deletion is rejected because a live concurrent writer can own those bytes. File age/mtime heuristics are rejected because elapsed time is not ownership or liveness proof. PID-only or mutable sidecar ownership is rejected because stale metadata and process-ID reuse do not create a robust lease. The selected OS-held lease dies with the process and spans recovery plus publication.

Deleting a matching destination while recovering a stage is rejected because filesystem publication is not yet transactionally coupled to the buyer-visible attachment metadata lifecycle. A stage-plus-destination state is ambiguous and is preserved for the later lifecycle/recovery vertical.

Deleting the stored PDF before the owning project accepts attachment removal is rejected because a failed metadata commit can leave a durable project pointing at bytes that the same interaction already destroyed. Detach therefore commits metadata first and treats a later delete failure as an orphan-cleanup problem instead of a broken-reference problem.

`std::fs::copy`, create-then-`chmod`, process-wide `umask` mutation, overwrite publication, length-only destination checks, pathname hashing as primary identity and a second pathname `stat` before deletion remain rejected for the reasons encoded in the corresponding REDs: each leaves visibility, mutation, clobber or pathname/object identity gaps.

## Security Notes

**Untrusted input.** Selected PDF bytes/path and pre-existing destination, stage, lock and retention names are untrusted. No selected PDF bytes or absolute buyer path are emitted in ordinary errors.

**Trust boundaries.** OS-selected source → source admission → Score Storage workspace lease → reserved-stage recovery → descriptor-bounded private stage → no-clobber/object-identity-attested attachment. Removal remains project-metadata acceptance → validated score id → existing workspace precondition → exact child resolution → OS-object deletion. #970 still owns broader app-owned workspace ancestry/link and durable project-metadata authority.

**Safe failure.** Oversize, growth/truncation, wrong magic, duplicate destination, copy/sync failure, suspicious reserved stage, reparse/symlink/non-regular object, identity mismatch, lease acquisition failure, missing/indeterminate workspace, unsafe resolution and stage-plus-destination ambiguity fail closed. Rejected project-metadata acceptance does not trigger destructive score deletion. Recovery does not turn ambiguous lifecycle state into deletion.

**Privacy.** Unix stage and lock creation request `0600`. Windows deliberately consumes the parent DACL contract. The lock file contains no PDF payload. The native interruption fixture uses generated test PDF bytes only.

**Test points.** Native tests cover valid/no-clobber publication, same-length destination replacement, Unix permissive-umask privacy, Windows parent-DACL inheritance, source growth/truncation, Tauri wiring, Windows handle-bound cleanup/delete replacement cases, Unix pre-`unlinkat` replacement, removal classification, successful fresh-process readback, reserved-stage namespace parsing, and process-terminated stage-only recovery before the next production publication. Frontend ordering tests cover rejected attach metadata, rejected detach metadata and metadata-before-delete ordering.

## Remaining risk / claim boundary

Stage-only process-kill recovery is now implemented under the current Score Storage lease contract. UI/application ordering now prevents a rejected metadata detach from deleting referenced bytes, and it refuses to present an asynchronously rejected attachment as accepted. Still open are interruption after a destination has been hard-linked, restart reconciliation of a published attachment whose metadata commit never became durable, explicit cancellation, disk-full, permission failure, power-loss durability, complete project deletion/recovery rollback semantics, packaged-app fault evidence, and compatibility with an older concurrently running build that does not acquire the lease.

The Windows parent-DACL acceptance must be rerun after #970 workspace authority integrates. Parent-directory durability and project lifecycle remain #970 concerns; Score Storage must reconcile without copying that implementation. The `void` callback compatibility path remains only for the pre-#970 synchronous owner and is not evidence of durable metadata acceptance.

A successful final publication attests object identity at the covered boundary but does not make the pathname immutable afterward. Windows cleanup/delete is object-bound for the tested contract. Unix cleanup/delete retains documented final basename races. A removal `Ok(None)` remains an observed absence, not an atomic reservation.

The implementation remains stacked on #865 because write-time publication and read-time bounded validation share the score-native crate surface. #865 must integrate first. Any descendant restack requires fresh exact-head evidence; predecessor CI is not transferable.

## References

Microsoft. (2024, February 22). *FILE_ID_INFO structure (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_id_info

Microsoft. (2024, February 22). *GetFileInformationByHandleEx function (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getfileinformationbyhandleex

Microsoft. (2024, February 22). *FILE_DISPOSITION_INFO structure (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_disposition_info

Microsoft. (2024). *SetFileInformationByHandle function (fileapi.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle

Microsoft. (n.d.). *CreateFileA function (fileapi.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilea

Microsoft. (n.d.). *ACE inheritance rules*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/secauthz/ace-inheritance-rules

Microsoft. (n.d.). *GetNamedSecurityInfoW function (aclapi.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-getnamedsecurityinfow

The Open Group. (2024). *unlink, unlinkat — remove a directory entry*. POSIX.1-2024 / The Open Group Base Specifications Issue 8. https://pubs.opengroup.org/onlinepubs/9799919799/functions/unlink.html

The Open Group. (2024). *open, openat — open file relative to a directory file descriptor*. POSIX.1-2024 / The Open Group Base Specifications Issue 8. https://pubs.opengroup.org/onlinepubs/9799919799/functions/open.html

The Rust Project Developers. (2026). *OpenOptions — std::fs*. Rust documentation. https://doc.rust-lang.org/std/fs/struct.OpenOptions.html

The Rust Project Developers. (2026). *OpenOptionsExt — std::os::unix::fs*. Rust documentation. https://doc.rust-lang.org/std/os/unix/fs/trait.OpenOptionsExt.html

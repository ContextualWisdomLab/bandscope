# Score attachment publication and retention

Issue: #1239  
Canonical owner: Score Storage / Score Attachment

## Problem and owner boundary

Score attachment bytes are buyer data. This bounded context owns score-PDF write-time confidentiality, bounded publication, final-object identity, interrupted-publication recovery, object inventory/receipts, explicit removal and retention semantics. Native read-time allocation/content validation remains #865. App-owned project/workspace link, ACL and durable lifecycle authority remains Project Persistence #970. Score Storage consumes those boundaries narrowly and does not copy Project Persistence policy.

The original desktop command copied a selected PDF with `std::fs::copy`. The current owner path uses descriptor-bounded publication, private staging, no-clobber hard-link publication, OS-object identity attestation, lease-scoped recovery and object-aware deletion. Three persistence states must remain distinct:

1. a successfully returned attachment must survive process teardown and fresh-process readback;
2. a process can die with only synchronized `.score-<uuid>.stage` bytes;
3. a process can die after `<uuid>.pdf` has been hard-linked but before the temporary stage alias is retired.

None of those filesystem states proves that Project Persistence durably accepted attachment metadata.

## Publication contract

`score_storage::publish_score_pdf_attachment` remains the lower-level publication primitive.

- Reopen the admitted source once and bind copy to that descriptor.
- Snapshot descriptor length; reject zero and `> 25 MiB`.
- Copy with a fixed 64 KiB buffer; early EOF and a post-copy growth probe fail closed.
- Revalidate `%PDF-` on bytes actually copied.
- Stage with `create_new`; Unix requests `0600` at first visibility. Windows inherits the app-owned parent DACL and native acceptance verifies inherited ACE evidence.
- Keep the Windows write handle non-shareable until `sync_all` finishes.
- Publish by hard link to `<score_id>.pdf`; never overwrite an existing score id.
- Attest destination identity to the synchronized stage object before and after retiring the stage alias: device/inode on Unix, volume serial + 128-bit `FILE_ID_INFO` on Windows.
- Return the descriptor-bound byte count, not a stale pathname metadata value.

Windows stage cleanup reopens the exact non-reparse stage with DELETE authority, verifies file identity and applies `FileDispositionInfo` to that handle. Unix cleanup/delete pins the parent directory and rechecks device/inode before `unlinkat`; its final basename race remains an explicit residual risk.

## Process-abandoned staging and post-link recovery

The crate-root `publish_score_pdf_attachment` routes through `score_recovery` before calling the lower-level publisher. Inventory and receipt-bound deletion use the same recovery owner.

A cross-process Score Storage workspace lease spans recovery and the complete owner mutation:

- Unix opens persistent `.score-storage.lock` with `O_NOFOLLOW`, mode `0600`, then takes non-blocking exclusive `flock`.
- Windows opens the persistent lock file with no sharing and `FILE_FLAG_OPEN_REPARSE_POINT`; a reparse lock object is rejected.
- The OS releases the held lease when the process exits, including abnormal termination. The lock file contains no buyer payload.
- Recovery examines only exact `.score-<valid-score-id>.stage` names. Malformed names remain outside Score Storage ownership.
- A reserved stage must be a regular, non-reparse object. Suspicious reserved objects fail closed.
- A stage-only orphan with no matching destination is removed through the Score Storage object-deletion boundary.
- If a destination exists, recovery validates it through the existing contained score resolver, validates both stage and destination as bounded PDFs, and compares their shared-kernel SHA-256 content identities. Equal validated bytes permit removal of **only the temporary stage alias**; the destination remains a published recovery candidate. Different bytes or indeterminate validation preserve both and fail closed.

The equal-content rule is intentionally narrow. SHA-256 here is an equality/content-identity receipt, not a signature, authenticity proof, original-file provenance or evidence that project metadata was durable. Even if the two names refer to distinct same-content objects, retiring the reserved stage is non-destructive because equivalent buyer bytes remain at the published destination.

`score_pdf_interruption_recovery` now covers both stage-only process death and the post-link process-death state. The post-link source RED is `1ce4bb86864ef845d39f7cb80614a2b686213499`; causal repair is `48a7ccfab996330fa415e68afaabc34782d62ad4`. `docs/traceability/score-attachment-post-link-recovery.md` contains the focused decision record and references.

This lease excludes another live writer using the current contract. Compatibility with an older concurrently running BandScope build that never acquires the lease is not claimed and remains open.

## Published-object inventory and mutation freshness

Restart discovery has two contracts:

- `inventory_published_score_pdf_ids` is discovery-only compatibility surface;
- `inventory_published_score_pdf_receipts` returns path-free `{score_id, content_sha256}` receipts under the Score Storage lease after recovery and bounded object validation.

The receipt closes same-id ABA for later destructive recovery. `remove_score_pdf_attachment_if_receipt_matches` reacquires the lease, recovers abandoned staging, computes a fresh current receipt and deletes only when it still equals the caller's receipt. Missing current object or digest mismatch is a safe non-removal; unsafe or indeterminate storage remains an error.

The same-id ABA source RED is `4d8d6c10761235c64ce5c5f70e4a0567ad5d4383`, refined by `c1a4c78da0f4d76c67967dc2d05df5019599d511`. The exact predecessor `43fd4666eb92a9376d5253610753de7240596a54` completed owner-native run `35507283561` GREEN on macOS 15 (`106069129664`) and Windows Server 2025 (`106069129795`). Those results are predecessor evidence only and are not transferred to a later source head.

## Retention/delete contract

`resolve_score_pdf_for_removal` distinguishes genuine absence from unsafe or indeterminate storage:

- validate score id before local name construction;
- require the supplied score workspace to exist as a directory before child `NotFound` can mean absence;
- return `Ok(None)` only for an observed missing `<score_id>.pdf` child under that existing workspace;
- once an entry exists, preserve symlink/non-regular/canonicalization/containment/permission/concurrent-disappearance failures as errors.

`remove_score_pdf_attachment` owns final object deletion. Windows marks the exact opened object for deletion with `FileDispositionInfo`. Unix pins the parent directory, opens the basename with `openat(..., O_NOFOLLOW)`, rechecks device/inode and then calls `unlinkat`; the final identity-check-to-`unlinkat` basename race remains explicit. Recovery `Discard` must use the receipt-bound delete rather than id-only deletion.

## UI/application lifecycle ordering

ScoreView coordinates buyer-visible attachment metadata with Score Storage bytes without moving either lower-level bounded-context authority into React.

Attachment is a two-step operation: publish and verify the PDF first, then ask Project Persistence to accept attachment metadata. An asynchronous callback result of `false` means metadata was not durably accepted. ScoreView then does not present the PDF as an accepted attachment and does not delete the bytes; the published object remains a recovery candidate. Legacy synchronous `void` remains pre-#970 compatibility, not durability evidence.

Detach uses the opposite order because deletion is destructive. ScoreView first asks the project owner to accept metadata without the attachment. Only after acceptance may Score Storage delete bytes. If metadata removal succeeds but deletion fails, the remaining PDF is an unreferenced cleanup/recovery candidate rather than a broken durable project reference.

`ScoreView.persistenceOutcome.test.tsx` covers rejected attachment metadata, rejected detach metadata and metadata-before-delete ordering. This is ordering evidence only; it is not an atomic filesystem/project transaction or packaged crash evidence.

## Successful-publication restart/readback

`score_pdf_restart_readback` publishes through the production crate-root boundary, starts a fresh native process, resolves the stored object through `resolve_existing_score_pdf`, reads it through `read_validated_score_pdf` and requires exact bytes. A successful ordinary publication also requires no stage alias to remain.

This proves successfully returned bytes survive one process lifetime and are readable through the normal bounded native path. It remains distinct from interrupted-writer recovery and Project Persistence reconciliation.

## Interruption lineage

Stage-only source RED `2c55e34c7262d087783502050cd9f084a1f7255c` created synchronized reserved staging in a child process, killed/reaped that process, then required a later production publication to recover the orphan. `ad2c4633fba5a9a981859407a035a2b9c367f9ec` added the OS-released workspace lease/recovery and `a1f21f1310ab6af96109def3575220e0017e19a2` routed the public publisher through it.

Post-link source RED `1ce4bb86864ef845d39f7cb80614a2b686213499` creates the persisted hard-link state in a child, kills/reaps the child and requires fresh receipt inventory to preserve the destination while retiring only the redundant stage. Repair `48a7ccfab996330fa415e68afaabc34782d62ad4` implements validated equal-content recovery. No hosted RED is claimed for that superseded test-only head unless an exact terminal failing run exists.

The process-kill acceptance is still scoped. It exercises native persisted shapes and process termination, but not every internal instruction point of a packaged application. Explicit cancellation, disk-full, permission failure, power loss and packaged-executable fault injection remain separate acceptance work.

## Earlier hosted evidence retained

- Windows share-mode repair: run `35451457938` isolated hard-link/unlink failure while the exclusive write handle was live.
- Windows foreign-stage replacement RED `a7373ca153e8740923ad13098953a61a7c263cc0`: run `35452152802`, Windows `105921067591`, failed; `49976461c7158869d1f10a6a43b46e0ee522352f` moved identity to `FILE_ID_INFO`.
- Windows identity-check-to-unlink RED `89f136e312ded829b89f2beafda68ca1c373044c`: run `35454589087` failed Windows `105927525168`; `d36969bf4e3ed2c470c00db0bb07b1de0ec2fa70` made cleanup handle-bound and run `35454808019` passed Windows/macOS.
- Tauri direct-delete wiring RED `06cc24a1b0bf89d1525cfb0b06921e9229e7b5dd`: run `35453934315` failed Windows/macOS; `09610fb26127408f818a754a42b75a083e0e5045` routed removal through Score Storage and run `35454259017` passed.
- Windows inherited-DACL acceptance `579a67d4767d098d0dd608b5678d59e66efe1701`: run `35455174325` passed macOS `105929062031` and Windows `105929062235`.
- Final destination identity RED `3274560cff4b8ecec5856d6f358e1a5fcea1c212`: run `35456813143` failed macOS `105933454955` and Windows `105933455061`; `91c240385acdc7ae5dea4a2ebd7c32db0f53953f` added OS-object identity and run `35456879153` passed.
- Missing-workspace retention RED `22749b83d9c7e6f7e3c0b5986af5802427e98d2a`: run `35460119001` failed macOS `105942349093` and Windows `105942349170`; `6444f21a158a877ae402fd665469d908f8afa3a2` repaired classification and run `35460197487` passed.
- Successful-publication fresh-process readback: `297327de172bbe30cdf226518a5135605db983ef` plus workflow wiring `0e4070ef6d92d55a91463e8bc4c1fa6b71f86003`; run `35463057196` passed macOS `105950252549` and Windows `105950252698`.
- Same-id ABA/content-receipt predecessor: exact `43fd4666eb92a9376d5253610753de7240596a54`, run `35507283561`, macOS `106069129664` and Windows `106069129795` SUCCESS.

## Alternatives rejected

Blind `.score-*.stage` glob deletion is rejected because a live writer can own those bytes. File age/mtime and PID-only heuristics are rejected because elapsed time or process identifiers do not create ownership proof. Blind stage deletion when a destination exists is rejected because unrelated/different bytes may occupy that destination. Blind destination deletion is rejected because it may be the only durable published buyer copy.

Permanently treating every stage-plus-destination state as ambiguous is non-destructive but leaves a valid post-link process crash wedged indefinitely. The selected equal-validated-content rule removes only the temporary alias and leaves the published copy for higher-level lifecycle reconciliation.

Deleting a stored PDF before Project Persistence accepts attachment removal is rejected because a failed metadata commit can leave a durable project pointing at bytes already destroyed. Detach therefore commits metadata first and treats later delete failure as an orphan recovery problem.

`std::fs::copy`, create-then-`chmod`, process-wide `umask` mutation, overwrite publication, length-only destination checks, pathname hashing as primary object identity and id-only recovery deletion remain rejected.

## Security Notes

**Untrusted input.** Selected PDF bytes/path and every pre-existing destination, stage, lock and retention entry are untrusted. Ordinary errors emit neither selected PDF bytes nor absolute buyer paths.

**Trust boundaries.** OS-selected source → source admission → Score Storage lease/recovery → descriptor-bounded private stage → no-clobber/object-identity-attested publication → receipt-bearing restart observation/mutation. Project Persistence #970 owns durable project references and buyer lifecycle intent.

**Safe failure.** Oversize, growth/truncation, wrong magic, duplicate destination, copy/sync failure, suspicious reserved stage, reparse/symlink/non-regular object, identity mismatch, lease acquisition failure, missing/indeterminate workspace, unsafe resolution, content-different stage/destination and stale receipt mismatch fail closed. Recovery never converts those cases into destructive guessing.

**Privacy.** Unix stage and lock creation request `0600`. Windows deliberately consumes the parent DACL contract. The lock file has no PDF payload. Native interruption fixtures use generated unit/integration-test PDF bytes only; they are not scientific MIR acceptance data.

**Test points.** Native tests cover bounded/no-clobber publication, same-length destination replacement, Unix permissive-umask privacy, Windows parent-DACL inheritance, source growth/truncation, Tauri wiring, handle/object-bound Windows cleanup/delete cases, Unix pre-`unlinkat` replacement, removal classification, successful fresh-process readback, stage-only process termination, post-link process termination, reserved namespace parsing, restart inventory and same-id ABA receipts. Frontend ordering tests cover metadata acceptance before destructive deletion.

## Remaining risk / claim boundary

Current-contract stage-only and verified equal-content post-link process-kill states are recoverable. A published object whose metadata commit never became durable remains only a recovery **candidate** until Project Persistence compares durable attachment ids with fresh Score Storage receipts and obtains explicit buyer intent. `missing_referenced_score_ids` remains a broken-reference condition, not deletion authority.

Still open: old concurrent builds that do not acquire the lease, explicit cancellation, disk-full, permission failure, power-loss durability, complete project deletion/recovery rollback semantics, packaged fault evidence, the Unix final basename race, #865 protected integration, #970 released consumer reconciliation, independent approval and current-head repository/security settlement.

Windows parent-DACL acceptance must be rerun after #970 workspace authority integrates. Parent-directory durability and project lifecycle remain #970 concerns. The `void` callback compatibility path remains pre-#970 compatibility only.

The implementation remains stacked on #865 because write-time publication and read-time bounded validation share the score-native crate surface. #865 must integrate first. Any descendant restack requires fresh exact-head evidence; predecessor CI is not transferable.

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS) (FIPS PUB 180-4).* https://doi.org/10.6028/NIST.FIPS.180-4

Microsoft. (2024, February 22). *FILE_ID_INFO structure (winbase.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_id_info

Microsoft. (2024, February 22). *GetFileInformationByHandleEx function (winbase.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getfileinformationbyhandleex

Microsoft. (2024, February 22). *FILE_DISPOSITION_INFO structure (winbase.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_disposition_info

Microsoft. (2024). *SetFileInformationByHandle function (fileapi.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle

Microsoft. (n.d.). *ACE inheritance rules.* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/secauthz/ace-inheritance-rules

Microsoft. (n.d.). *GetNamedSecurityInfoW function (aclapi.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-getnamedsecurityinfow

The Open Group. (2024). *link, linkat — link one file to another file.* POSIX.1-2024 / The Open Group Base Specifications Issue 8. https://pubs.opengroup.org/onlinepubs/9799919799/functions/link.html

The Open Group. (2024). *unlink, unlinkat — remove a directory entry.* POSIX.1-2024 / The Open Group Base Specifications Issue 8. https://pubs.opengroup.org/onlinepubs/9799919799/functions/unlink.html

The Open Group. (2024). *open, openat — open file relative to a directory file descriptor.* POSIX.1-2024 / The Open Group Base Specifications Issue 8. https://pubs.opengroup.org/onlinepubs/9799919799/functions/open.html

The Rust Project Developers. (2026). *OpenOptions — std::fs*. Rust documentation. https://doc.rust-lang.org/std/fs/struct.OpenOptions.html

The Rust Project Developers. (2026). *OpenOptionsExt — std::os::unix::fs*. Rust documentation. https://doc.rust-lang.org/std/os/unix/fs/trait.OpenOptionsExt.html

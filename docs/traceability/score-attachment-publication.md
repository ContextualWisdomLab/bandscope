# Score attachment publication

Issue: #1239  
Canonical owner: Score Storage / Score Attachment

## Problem

The desktop command admitted a selected PDF and then copied it into `<project>/scores` with `std::fs::copy`. That left the buyer-visible write contract implicit: first-visible Unix mode depended on copy/platform behavior, the source could change after path validation, an existing destination had no explicit no-clobber invariant, and partial-copy cleanup was not owned by a Score Storage boundary.

The native read-time 25 MiB allocation/content guard remains #865. Project/workspace directory authority remains Project Persistence #970. This slice owns only score attachment publication and its lifecycle semantics.

## Decision

`publish_score_pdf_attachment` is the native Score Storage publication boundary.

- Reopen the already-admitted source once and bind copy to that descriptor.
- Snapshot descriptor length and reject `0` or `> 25 MiB` before copying.
- Copy through a fixed 64 KiB buffer. Early EOF is truncation; a one-byte probe after the snapshot detects growth. Both fail closed.
- Revalidate `%PDF-` on the bytes that are actually copied.
- Stage with `create_new`. Rust documents `create_new` as atomic with respect to an existing target; Unix `OpenOptionsExt::mode` supplies the creation mode before `umask` is applied. Unix therefore requests `0600` instead of creating broad permissions and tightening them later.
- Windows intentionally uses the app-owned scores directory ACL/inheritance model rather than claiming POSIX-equivalent `0600`. Its staging handle denies sharing while bytes are written, is synchronized, and is then closed before hard-link publication and stage unlink. Microsoft documents a zero CreateFile share mode as preventing conflicting read/write/delete opens until the handle closes.
- Publish with a hard link from the synchronized stage to `<score_id>.pdf`, so an existing score id is not overwritten.
- On Unix, stage identity is captured from the open file and cleanup compares device/inode before unlinking. A foreign replacement is never deleted merely because it occupies the expected pathname.
- Return the byte count from the descriptor-bound copy to IPC rather than trusting the earlier path-validation size snapshot.

## Hosted finding and repair

Exact-source run `35451457938` on `69463eba53b61ba0505e4121317e3d726bfa4096` separated a platform contract from test/workflow noise. macOS passed the owned Score Storage unit and publication regressions. Windows passed all three owned unit tests but failed both publication regressions: the success path returned `Could not attach the score PDF.`, and the duplicate-destination case left the stage pathname behind. The common cause was the Windows stage handle opened with `share_mode(0)` remaining live while `hard_link` or `remove_file` needed pathname mutation.

The repair keeps `share_mode(0)` during the untrusted write, captures the stage identity while the handle is live, calls `sync_all`, and drops the handle before publication or cleanup. No sharing flag was loosened merely to make the test pass. Unix retains device/inode-bound cleanup; Windows identity-bound cleanup after handle close remains a separate acceptance item.

Microsoft's `FILE_ID_INFO` contract gives the eventual Windows identity model: volume serial number plus the 128-bit file identifier identifies a file on one computer. Rust's current Windows `MetadataExt::file_index`/`volume_serial_number` surface is still documented as nightly-only, so this PR does not pretend that stable Rust 1.97.1 already supplies an equivalent identity primitive. A later Windows cleanup repair must use an audited Win32 binding or another stable owner-approved mechanism and carry its own native regression.

## Alternatives rejected

`std::fs::copy` was rejected because it does not express the Score Storage invariants above as one auditable boundary. Process-wide `umask` mutation was rejected because it affects unrelated threads. Create-then-`chmod` was rejected because bytes can be visible before tightening. Overwriting an existing UUID destination was rejected even though collision probability is very small: storage correctness must not rely on UUID probability when a no-clobber primitive is available. Allowing Windows path sharing during the write was also rejected as the first repair for the hosted failure; closing only after `sync_all` keeps the stronger write-phase boundary and makes the completed stage publishable.

## Security Notes

**Untrusted input.** The selected local PDF and any pre-existing pathname in the score workspace are untrusted. The file-dialog path itself is not sent by the WebView.

**Trust boundaries.** OS-selected path → existing score source admission → one opened source descriptor → app-owned Score Storage staging file → no-clobber buyer-visible attachment.

**Safe failure.** Oversize, truncation, growth, wrong magic, duplicate destination, copy error, sync error, or identity mismatch returns a payload-safe error. The implementation does not log or return PDF bytes or absolute source paths. After a successful hard link, an unexpected destination metadata mismatch is preserved rather than blindly unlinked because a pathname swap could make that destination foreign.

**Privacy.** New Unix score bytes request `0600` at first visibility. Windows uses native ACL inheritance and does not claim POSIX permission equivalence.

**Test points.** Core tests cover valid publication, no-clobber publication, permissive-`umask(000)` Unix first visibility, descriptor growth, descriptor truncation, wrong magic, and Tauri call-site wiring. Windows/macOS hosted exact-head results remain required before this PR can advance.

## Remaining risk / claim boundary

This change does not prove packaged app crash/power-loss durability and does not make Score Storage part of Project Persistence. Parent-directory durability, project deletion semantics, detach retention policy, actual Windows ACL/inheritance acceptance, and Windows identity-bound cleanup after the staging handle closes remain acceptance work under #1239. Current path/workspace authority also depends on the eventual protected integration/reconciliation of #970; this PR does not copy Project Persistence directory-authority code.

The implementation is stacked on #865 because write-time publication and read-time bounded validation share the score-native crate surface, but #865 remains the owner of reads. #1239 must be non-force reconciled after #865 and the relevant Project Persistence prerequisite integrate; predecessor CI evidence is not transferable to a restacked head.

## References

Microsoft. (2024, February 22). *FILE_ID_INFO structure (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_id_info

Microsoft. (n.d.). *CreateFileA function (fileapi.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilea

The Rust Project Developers. (2026). *OpenOptions — std::fs*. Rust documentation. https://doc.rust-lang.org/std/fs/struct.OpenOptions.html

The Rust Project Developers. (2026). *OpenOptionsExt — std::os::unix::fs*. Rust documentation. https://doc.rust-lang.org/std/os/unix/fs/trait.OpenOptionsExt.html

The Rust Project Developers. (2026). *MetadataExt — std::os::windows::fs*. Rust documentation. https://doc.rust-lang.org/beta/std/os/windows/fs/trait.MetadataExt.html

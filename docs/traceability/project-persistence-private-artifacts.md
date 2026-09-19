# Project Persistence private durable artifacts

## Problem

Project Persistence already preserved an existing Unix project file's read/write mode during overwrite, but two owner-created durable artifact classes still relied on the ambient process `umask`: the staging inode for a brand-new project and the adjacent recovery journal. With a permissive `umask(000)`, Rust's ordinary `File::create_new` path produced mode `0666`. The no-replace hard-link/rename publication path then retained that mode for the final new project, while recovery-journal creation exposed the same default-mode behavior.

That is a buyer-visible confidentiality and integrity gap on multi-user Unix hosts. A project may contain rehearsal structure, local source references, notes, and other user-owned state, while a recovery journal carries publication identities and migration evidence used to decide cleanup or rollback. Neither artifact should become group/world readable or writable merely because the host process inherited a permissive `umask`.

## Constraints and decision

Project Persistence remains the single writer for project publication and recovery metadata. The repair does not introduce a second persistence API, mutate the process-wide `umask`, or change Windows ACL semantics.

On Unix, owner-created staging files and recovery journals are now opened with `create_new(true)` and an explicit `0600` creation mode before any bytes are written. A replacement of an existing project keeps the established policy: after staging, the existing target's read/write bits are applied as `mode & 0666`, so a pre-existing `0644` project remains `0644`, a `0600` project remains `0600`, and executable/special bits are not propagated. A brand-new project has no predecessor permission contract, so its default durable mode stays `0600`.

Windows continues to use its native ACL inheritance and the existing no-follow/native-identity/flush boundaries. This change makes no claim that POSIX mode bits model Windows ACLs.

## RED / GREEN evidence

- RED `18b381b2d6dc46b9f70de9c78f0ead8cebf77500` adds `permissions::new_project_and_recovery_journal_remain_owner_private_with_permissive_umask`. The regression launches a child test process, sets only that child to `umask(000)`, publishes a real new project, then creates a real recovery journal through the Project Persistence owner.
- HOSTED RED: macOS run `35422988939`, job `105843929746`, reaches the native Project Persistence harness and fails only the new privacy regression. The child reports the new durable project as decimal mode `438` (`0666`) instead of decimal `384` (`0600`). This proves the issue without globally mutating the parallel parent test process.
- GREEN SOURCE `cac722ea6110504d496f12480b8c8d228199cbad` introduces one non-clobbering private-file creation primitive. Unix uses `OpenOptionsExt::mode(0o600)`; non-Unix keeps `File::create_new`. Both new-project staging and recovery-journal creation consume that primitive. Existing-target permission preservation remains downstream and unchanged.
- Exact-head hosted Windows/macOS evidence must be reacquired on the final descendant before this repair is treated as GREEN for delivery. Predecessor success is not transferred.

## Rejected alternatives

Relying on the host's default `umask` is rejected because the application does not control how it was launched and a permissive inherited value makes durable project data unnecessarily accessible.

Changing the process-wide `umask` around a save is rejected because `umask` is process-global, not thread-local; concurrent file creation in other bounded contexts could inherit the temporary policy.

Creating with broad permissions and calling `chmod` after publication is rejected because it leaves a visibility window before the permission repair and does not protect the recovery journal at creation time.

Forcing every existing project to `0600` is rejected because an existing user's deliberate read/write sharing mode is already part of the predecessor contract. Project Persistence only strips executable/special bits; it does not silently revoke established read permissions during overwrite.

## Security Notes

The protected boundary is local durable state created by BandScope itself. The control reduces accidental or hostile cross-account access on Unix by making new project bytes and recovery metadata owner-only at creation. It does not defend against a malicious process running as the same account, privileged/root access, compromised parent-directory ownership, or Windows ACL misconfiguration. No new paths, project contents, identities, or migration digests are logged.

This repair also does not replace packaged interruption testing. Process-kill, disk-full, permission-failure, power-loss, longer-lived known-good retention, global startup recovery discovery, accessible Restore / Compare / Discard UX, signing/notarization, updater rollback, and immutable release evidence remain separate #962 acceptance work.

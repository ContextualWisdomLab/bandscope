# Unix score-stage cleanup authority

Issue: #1239  
Canonical owner: Score Storage / Score Attachment

## Problem

The lower Score Storage publisher captures the stage file's Unix device/inode identity while the staging descriptor is open. Before this repair, `remove_owned_stage` later re-read metadata through the stage pathname, compared that metadata with the captured identity, and then called `std::fs::remove_file(path)`. A replacement or ancestor-path change after the identity check could therefore redirect the destructive cleanup to a different directory entry.

That gap affected publication failure cleanup and normal temporary-stage retirement. It is distinct from restart recovery, which already routes abandoned stage removal through the Score Storage object-deletion boundary under the workspace lease.

## RED and causal repair

Source RED `92b34e5c0288227652673d0614cc6fae8b3db5b3` introduced a contract requiring Unix owned-stage cleanup to use pinned-parent descriptor-relative authority rather than pathname-only deletion. No hosted RED is claimed because repair descendants followed before a terminal failing run.

The first RED filename did not match the Score Storage owner workflow's executed test list. That test-ownership defect was repaired rather than treated as evidence: the canonical test is `apps/desktop/core/tests/score_pdf_unix_stage_cleanup_contract.rs`; the superseded unowned path was removed.

Causal source repair `46ff8f92c7f1983fba0805479e7cfe80dfeaebfb` changes Unix stage retirement to:

1. open and retain the parent directory descriptor;
2. derive the reserved basename without relying on the ancestor pathname again;
3. open the basename with the existing `openat(..., O_NOFOLLOW)` boundary;
4. verify regular-file shape and the captured device/inode identity;
5. immediately before deletion, reopen the basename beneath the same pinned parent and revalidate identity;
6. remove it with `unlinkat(parent_fd, basename, 0)`.

A focused Unix unit regression replaces the pathname between the initial identity check and deletion. Cleanup must fail closed, preserve the foreign replacement, and preserve the originally owned stage object that was moved aside.

Workflow repair `6965c05f228f6a0d11ee077392e2222fcc5dcc41` adds the focused integration contract to the explicit `score-storage-native` test invocation. The earlier path-matched-but-not-executed state is not test evidence.

## Decision

Use the same descriptor-relative Unix authority model already used by published-score deletion instead of inventing a second cleanup primitive. This reduces duplicated security logic and keeps Score Storage as the canonical owner of destructive score-object operations.

`openat`/`unlinkat` are used because their relative-path semantics bind resolution to an already-open directory descriptor, avoiding ancestor-path substitution. `O_NOFOLLOW` prevents the final opened entry from being followed as a symbolic link. These controls reduce the pathname race class that existed in `fs::remove_file(path)`.

The selected repair does **not** claim that POSIX `unlinkat` atomically binds the final directory entry to the previously observed inode. A narrow final `identity recheck -> unlinkat` basename-replacement interval remains and is still tracked as residual risk. Eliminating that final-entry race requires a separately justified portable or platform-specific primitive; this repair does not fabricate such a guarantee.

## Security and product effect

Untrusted state remains every pre-existing Score Storage directory entry. Cleanup errors remain generic and do not expose buyer paths or PDF bytes. An identity mismatch, symlink/non-regular entry, parent-open failure, reopen failure, or unlink failure is fail-closed.

The repair is buyer-visible only through safer failure semantics: BandScope must prefer leaving an owned temporary artifact for later recovery over deleting bytes through stale pathname authority. It does not alter Project Persistence metadata, attachment intent, recovery UI, or Score Storage receipt semantics.

## Test and release claim boundary

The source/test/workflow lineage above is current implementation evidence only. Exact-current-head owner-native and repository/security/review gates must be read fresh after the final descendant head settles. Predecessor `800d775b1c84c569fbbdf4ec184c3ae52527c275` owner-native GREEN is not transferable.

Still open in this bounded context: the final Unix basename micro-race, deliberate cancellation/disk-full/permission/power-loss fault evidence, Windows directory-entry successful-return durability, old unleased-build coexistence, protected/released integration, and cross-owner recovery UX.

## References

The Open Group. (2024). *open, openat — open file relative to a directory file descriptor*. POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/functions/open.html

The Open Group. (2018). *unlink, unlinkat — remove a directory entry*. POSIX.1-2017. https://pubs.opengroup.org/onlinepubs/9699919799/functions/unlink.html

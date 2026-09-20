# Score attachment fault-recovery evidence

Issue: #1239  
Canonical owner: Score Storage / Score Attachment  
Related owner: Project Persistence #970

## Problem

Score Storage already had writer-death recovery for a synchronized stage and for the post-link/pre-retirement window, but its owner workflow did not contain an explicit regression for two earlier failure classes: an interrupted fixed-buffer copy that leaves an incomplete reserved stage, and a native permission failure that makes the reserved stage indeterminate at restart.

The missing regression mattered because these two states require opposite actions. A stage-only residue from an interrupted copy is owned temporary state and may be retired without becoming a published score object. An unreadable reserved stage is not safely classifiable and must be preserved while recovery fails closed.

## Repair lineage

`a5e1abd4bfab4bf8d5c55b4efc26250c1d8481f7` added `score_pdf_fault_recovery.rs` with the buyer-byte safety cases. `f7ed8d68b90cc16208af6a122d77b4ad6cec5ec8` then made the already-owned `score_pdf_success_durability` contract require the Score Storage workflow to execute that regression explicitly. At that source head the workflow did not yet contain `--test score_pdf_fault_recovery`, so the existing owner contract had a deterministic source-level RED. No terminal hosted RED is claimed because the causal CI repair followed immediately.

`077512df4a65679ed6dea1098c201c6055cc0375` added the fault-recovery regression to the explicit `score-storage-native` invocation on macOS 15 and Windows Server 2025.

## Fault semantics

The interruption fixture leaves only `%PD` in an exact reserved `.score-<uuid>.stage` name. This represents a process disappearing before the descriptor-bounded copy completes. Restart inventory must retire that reserved temporary residue and return no published receipt. The test does not claim that process termination is equivalent to sudden power loss or disk-full; those require separate fault evidence.

On Unix, the permission fixture makes an exact reserved stage unreadable before restart inventory. Recovery must return an error and preserve the stage. It must not guess that unreadable bytes are disposable merely because their pathname is in the reserved namespace. The fixture restores permissions only after the assertion so test cleanup does not broaden production behavior.

Windows does not reuse the POSIX mode fixture. Windows permission/ACL fault evidence remains tied to the app-owned DACL model and requires a Windows-native ACL mutation fixture rather than a synthetic chmod analogue.

## Security Notes

**Untrusted state.** Every directory entry and every stage byte stream is untrusted at restart.

**Trust boundary.** Exact reserved-name parsing identifies candidate temporary state; actual cleanup still passes through Score Storage lease, no-follow/reparse checks, bounded admission content and native deletion authority.

**Safe failure.** Incomplete stage-only bytes are removed only from the reserved temporary namespace and never surfaced as a published score. Indeterminate/unreadable stage state is preserved and blocks recovery instead of falling back to pathname-only deletion.

**Claim boundary.** This slice proves explicit owner regressions for incomplete-stage cancellation residue and Unix permission-denied recovery behavior. It does not close disk-full, Windows ACL failure, sudden power-loss, packaged executable or directory-entry durability acceptance.

## Next buyer gap

Continue fault injection at the real publication boundaries `stage copy -> stage sync -> destination publication -> stage retirement -> successful-return metadata barrier`. The next useful acceptance is a deterministic disk-full/write-failure fixture that demonstrates partial-stage non-destruction/recovery without shrinking the production payload, followed by Windows-native ACL denial and power-loss/durability evidence on packaged builds.

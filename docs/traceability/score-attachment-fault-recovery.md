# Score attachment fault-recovery evidence

Issue: #1239  
Canonical owner: Score Storage / Score Attachment  
Related owner: Project Persistence #970

## Problem

Score Storage publication spans several failure boundaries before a score can be treated as durable object truth: descriptor-bounded copy, staged-file sync, destination publication, stage retirement, and the successful-return metadata barrier. Recovery therefore needs evidence for faults that occur before publication as well as faults that leave an indeterminate reserved stage.

Three cases are owned here. An interrupted fixed-buffer copy may leave incomplete temporary bytes. A native permission failure can make a reserved stage unreadable at restart. A kernel-enforced file-size limit can make the actual publication writer fail after it has written only part of the stage. These states must never invent a published score object, and an indeterminate stage must not be deleted on pathname authority alone.

## Repair lineage

`a5e1abd4bfab4bf8d5c55b4efc26250c1d8481f7` added `score_pdf_fault_recovery.rs` with interrupted-copy and Unix permission-denial cases. `f7ed8d68b90cc16208af6a122d77b4ad6cec5ec8` then made the existing `score_pdf_success_durability` contract require explicit owner-workflow execution. At that source head the workflow omitted `--test score_pdf_fault_recovery`, so the owner contract had a deterministic source-level RED. No terminal hosted RED is claimed because `077512df4a65679ed6dea1098c201c6055cc0375` repaired the explicit invocation before a failing hosted verdict settled.

Windows ACL denial is covered separately by `score-attachment-windows-acl-recovery.md` and its Windows Server 2025 regression.

`22779b70c54109689aebcc22edde450778d2cc7e` adds `score_pdf_write_failure_recovery.rs`. The test drives the public `publish_score_pdf_attachment` path in a child process whose kernel file-size limit is reduced with POSIX `ulimit -f`. The source PDF is created before the limit is installed and remains 128 KiB; no production size constant or publication ceiling is changed. The child ignores `SIGXFSZ` so the write returns through the normal Rust I/O error path instead of terminating the process. At that test-only head the `score_pdf_*.rs` path filter triggered the owner workflow, but the explicit `cargo test` list did not execute the new regression. That is a source-level owner-evidence RED, not a hosted behavioral RED.

`c1ff55f277899d8a98015a2f6b6063308bb1017d` repairs the owner workflow by adding `--test score_pdf_write_failure_recovery` to the macOS 15 / Windows Server 2025 invocation. The behavioral assertion is Unix-only; Windows compiles the integration-test crate with zero platform tests for this case.

## Fault semantics

The interrupted-copy fixture leaves only `%PD` in an exact reserved `.score-<uuid>.stage` name. This represents a process disappearing before the descriptor-bounded copy completes. Restart inventory retires that owned temporary residue and returns no published receipt.

On Unix, the permission fixture makes an exact reserved stage unreadable before restart inventory. Recovery returns an error and preserves the stage. It does not infer that unreadable bytes are disposable merely because their pathname is in the reserved namespace.

The kernel write-failure regression exercises a different boundary. The parent creates a 128 KiB PDF-shaped source, then starts the current integration-test binary in a child process with a 512-byte file-size limit. The production publisher opens the real private stage and encounters the kernel write failure while copying. The child must return the generic attachment error rather than crash or report success. After the child exits, the parent verifies that no `<score_id>.pdf` exists, the writer-owned partial stage was retired, the source length is unchanged, and fresh restart inventory is empty.

This is intentionally not described as an ENOSPC or physical-disk-full test. `RLIMIT_FSIZE`/`ulimit -f` produces a kernel-enforced write failure without requiring privileged filesystem provisioning and without changing BandScope's 25 MiB product boundary. Actual capacity exhaustion remains separate acceptance evidence.

## Security Notes

**Untrusted state.** Every directory entry and every stage byte stream is untrusted at restart.

**Trust boundary.** Exact reserved-name parsing identifies candidate temporary state; cleanup still passes through the Score Storage lease, no-follow/reparse checks, bounded admission content, and native deletion authority.

**Safe failure.** Incomplete stage-only bytes are removed only from the reserved temporary namespace and never surfaced as a published score. Indeterminate or unreadable state is preserved and blocks recovery. A publication write failure cannot create destination truth because hard-link publication occurs only after the stage copy and `sync_all()` succeed.

**Claim boundary.** Current owner evidence covers interrupted partial copy, Unix permission denial, Windows-native ACL denial, and a Unix kernel-enforced write failure on the real publication path. It does not prove ENOSPC/capacity exhaustion, packaged cancellation, sudden power loss, or Windows directory-entry successful-return durability.

## Next buyer gap

The next storage fault evidence should target actual capacity exhaustion or another OS-native ENOSPC path without changing the product payload ceiling, followed by packaged cancellation and sudden power-loss/directory-entry durability evidence at `stage sync -> destination publication -> stage retirement -> successful-return metadata barrier`. Windows directory-entry durability remains unclaimed until a native primitive and recovery experiment support that assertion.

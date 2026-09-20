# Score attachment fault-recovery evidence

Issue: #1239  
Canonical owner: Score Storage / Score Attachment  
Related owner: Project Persistence #970

## Problem

Score Storage publication spans several failure boundaries before a score can be treated as durable object truth: descriptor-bounded copy, staged-file sync, destination publication, stage retirement, and the successful-return metadata barrier. Recovery therefore needs evidence for faults that occur before publication as well as faults that leave an indeterminate reserved stage.

Four cases are owned here. An interrupted fixed-buffer copy may leave incomplete temporary bytes. A native permission failure can make a reserved stage unreadable at restart. A kernel-enforced file-size limit can make the actual publication writer fail after it has written only part of the stage. Actual filesystem capacity exhaustion can also make that writer fail after a real `ENOSPC`, which must be distinguished from an artificial file-size limit. None of these states may invent a published score object, and an indeterminate stage must not be deleted on pathname authority alone.

## Repair lineage

`a5e1abd4bfab4bf8d5c55b4efc26250c1d8481f7` added `score_pdf_fault_recovery.rs` with interrupted-copy and Unix permission-denial cases. `f7ed8d68b90cc16208af6a122d77b4ad6cec5ec8` then made the existing `score_pdf_success_durability` contract require explicit owner-workflow execution. At that source head the workflow omitted `--test score_pdf_fault_recovery`, so the owner contract had a deterministic source-level RED. No terminal hosted RED is claimed because `077512df4a65679ed6dea1098c201c6055cc0375` repaired the explicit invocation before a failing hosted verdict settled.

Windows ACL denial is covered separately by `score-attachment-windows-acl-recovery.md` and its Windows Server 2025 regression.

`22779b70c54109689aebcc22edde450778d2cc7e` added `score_pdf_write_failure_recovery.rs`. The test drives the public `publish_score_pdf_attachment` path in a child process whose kernel file-size limit is reduced with POSIX `ulimit -f`. The source PDF is created before the limit is installed and remains 128 KiB; no production size constant or publication ceiling is changed. The child ignores `SIGXFSZ` so the write returns through the normal Rust I/O error path instead of terminating the process. At that test-only head the `score_pdf_*.rs` path filter triggered the owner workflow, but the explicit `cargo test` list did not execute the new regression. That is a source-level owner-evidence RED, not a hosted behavioral RED. `c1ff55f277899d8a98015a2f6b6063308bb1017d` repaired the owner workflow by adding that target to the macOS 15 / Windows Server 2025 invocation.

`64466c782ae244799afad76c3e02fe20e7a5d6ae` added `score_pdf_capacity_exhaustion_recovery.rs`. On macOS it creates a fixed-size 16 MiB HFS+ disk image, writes and synchronizes filler blocks until the OS reports raw `ENOSPC` (`28`), releases only a 512 KiB reserve, and then sends a 1 MiB PDF-shaped host source through the public Score Storage publisher. This preserves the 25 MiB production ceiling while making the destination filesystem genuinely too small for the selected score.

`16f559cf38d30d5548426262cd4614459fc3e8ea` added the new regression to the explicit owner workflow. That exact head produced a real hosted failure in `score-storage-native` run `35524498229`, macOS job `106114188950`, before the product boundary was reached: current macOS `hdiutil create` rejected the fixture's `-format UDRW` combination with `-fs` unless a source folder/device was supplied. This was a fixture-provisioning RCA, not a Score Storage behavioral failure. `b6922153583543cf898e8bec0f3941408f551003` also made each capacity-filler block call `sync_data()` so delayed allocation cannot turn the test into a page-cache-only approximation. `3c64fb31bd09326b10bb16313cc42edbb0a19e85` removed the invalid image-format argument. Exact head `3c64fb31bd09326b10bb16313cc42edbb0a19e85` then completed owner run `35524589689` successfully on macOS 15 job `106114428123` and Windows Server 2025 job `106114428002`; the macOS lane executes the ENOSPC behavior and the Windows target is platform-gated while the rest of the native owner suite still runs.

## Fault semantics

The interrupted-copy fixture leaves only `%PD` in an exact reserved `.score-<uuid>.stage` name. This represents a process disappearing before the descriptor-bounded copy completes. Restart inventory retires that owned temporary residue and returns no published receipt.

On Unix, the permission fixture makes an exact reserved stage unreadable before restart inventory. Recovery returns an error and preserves the stage. It does not infer that unreadable bytes are disposable merely because their pathname is in the reserved namespace.

The kernel write-failure regression exercises another boundary. The parent creates a 128 KiB PDF-shaped source, then starts the current integration-test binary in a child process with a 512-byte file-size limit. The production publisher opens the real private stage and encounters the kernel write failure while copying. The child must return the generic attachment error rather than crash or report success. After the child exits, the parent verifies that no `<score_id>.pdf` exists, the writer-owned partial stage was retired, the source length is unchanged, and fresh restart inventory is empty.

The capacity-exhaustion regression is deliberately different from `RLIMIT_FSIZE`. The selected 1 MiB source lives outside the isolated image. The test fills and synchronizes the fixed-size image until a real `ENOSPC` is observed, removes only a 512 KiB reserve, and invokes the public publisher. Publication must fail before destination truth is created; the owned partial stage must be retired, the source must remain 1 MiB, and restart inventory must remain empty. The source size is a fault-fixture choice, not a reduction of the 25 MiB product ceiling.

## Security Notes

**Untrusted state.** Every directory entry and every stage byte stream is untrusted at restart.

**Trust boundary.** Exact reserved-name parsing identifies candidate temporary state; cleanup still passes through the Score Storage lease, no-follow/reparse checks, bounded admission content, and native deletion authority.

**Safe failure.** Incomplete stage-only bytes are removed only from the reserved temporary namespace and never surfaced as a published score. Indeterminate or unreadable state is preserved and blocks recovery. A publication write or capacity failure cannot create destination truth because hard-link publication occurs only after the stage copy and `sync_all()` succeed.

**Claim boundary.** Current owner evidence covers interrupted partial copy, Unix permission denial, Windows-native ACL denial, a Unix kernel-enforced file-size write failure, and macOS fixed-filesystem capacity exhaustion that reaches real `ENOSPC` through the public publication path. It does not prove packaged cancellation, sudden power loss, Windows capacity exhaustion, or Windows directory-entry successful-return durability. It also does not convert the isolated 1 MiB capacity fixture into a smaller product payload limit.

## Next buyer gap

The next fault evidence should move to packaged cancellation and process termination around `stage sync -> destination publication -> stage retirement -> successful-return metadata barrier`, then to sudden-power-loss/directory-entry durability. Windows directory-entry durability remains unclaimed until a supported native primitive and recovery experiment justify it. The separate Unix final basename identity-check-to-`unlinkat` micro-race also remains an explicit storage-authority gap.

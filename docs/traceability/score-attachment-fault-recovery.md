# Score attachment fault-recovery evidence

Issue: #1239  
Canonical owner: Score Storage / Score Attachment  
Related owner: Project Persistence #970

## Problem

Score Storage publication spans several failure boundaries before a score can be treated as durable object truth: descriptor-bounded copy, staged-file sync, destination publication, stage retirement, and the successful-return metadata barrier. Recovery therefore needs evidence for faults before publication, during publication alias transition, and after publication but before successful return.

Current native evidence covers interrupted copy, Unix permission denial, Windows ACL denial, kernel-enforced write failure, actual macOS `ENOSPC`, and real-public-publisher process termination at three deterministic publication boundaries. None of these states may invent a durable project reference, delete buyer bytes on pathname authority, or misreport an interrupted publisher as a successful attachment.

## Repair lineage

`a5e1abd4bfab4bf8d5c55b4efc26250c1d8481f7` added `score_pdf_fault_recovery.rs` with interrupted-copy and Unix permission-denial cases. `f7ed8d68b90cc16208af6a122d77b4ad6cec5ec8` then made the existing `score_pdf_success_durability` contract require explicit owner-workflow execution. At that source head the workflow omitted `--test score_pdf_fault_recovery`, so the owner contract had a deterministic source-level RED. No terminal hosted RED is claimed because `077512df4a65679ed6dea1098c201c6055cc0375` repaired the explicit invocation before a failing hosted verdict settled.

Windows ACL denial is covered separately by `score-attachment-windows-acl-recovery.md` and its Windows Server 2025 regression.

`22779b70c54109689aebcc22edde450778d2cc7e` added `score_pdf_write_failure_recovery.rs`. The test drives the public `publish_score_pdf_attachment` path in a child process whose kernel file-size limit is reduced with POSIX `ulimit -f`. The source PDF is created before the limit is installed and remains 128 KiB; no production size constant or publication ceiling is changed. The child ignores `SIGXFSZ` so the write returns through the normal Rust I/O error path instead of terminating the process. At that test-only head the `score_pdf_*.rs` path filter triggered the owner workflow, but the explicit `cargo test` list did not execute the new regression. That is a source-level owner-evidence RED, not a hosted behavioral RED. `c1ff55f277899d8a98015a2f6b6063308bb1017d` repaired the owner workflow by adding that target to the macOS 15 / Windows Server 2025 invocation.

`64466c782ae244799afad76c3e02fe20e7a5d6ae` added `score_pdf_capacity_exhaustion_recovery.rs`. On macOS it creates a fixed-size 16 MiB HFS+ disk image, writes and synchronizes filler blocks until the OS reports raw `ENOSPC` (`28`), releases only a 512 KiB reserve, and then sends a 1 MiB PDF-shaped host source through the public Score Storage publisher. This preserves the 25 MiB production ceiling while making the destination filesystem genuinely too small for the selected score.

`16f559cf38d30d5548426262cd4614459fc3e8ea` added the capacity regression to the explicit owner workflow. That exact head produced a real hosted failure in `score-storage-native` run `35524498229`, macOS job `106114188950`, before the product boundary was reached: current macOS `hdiutil create` rejected the fixture's `-format UDRW` combination with `-fs` unless a source folder/device was supplied. This was a fixture-provisioning RCA, not a Score Storage behavioral failure. `b6922153583543cf898e8bec0f3941408f551003` made each capacity-filler block call `sync_data()` so delayed allocation cannot turn the test into a page-cache-only approximation. `3c64fb31bd09326b10bb16313cc42edbb0a19e85` removed the invalid image-format argument. Exact head `3c64fb31bd09326b10bb16313cc42edbb0a19e85` then completed owner run `35524589689` successfully on both desktop lanes.

`e5323d3eec9c5eb2e89ac688930a84bebd1ce430` defines the owner-only `score-storage-fault-injection` Cargo feature. `814272038c8b1d522a16ef4a5d707ff9a8cc474d` adds the first `score_pdf_process_termination_recovery.rs`, whose child invokes real public `publish_score_pdf_attachment` rather than constructing filesystem state itself. `a23313b060d14daf691b7c3489be355c4adb6e04` makes that regression an explicit owner-native workflow target. At that test-only head no checkpoint existed, so the child would return before exposing `before-metadata-barrier`; this is the behavioral source-level RED. Its owner run `35534584400` did not settle to terminal failure before a repair descendant existed, so no hosted RED is claimed. `5a571e8c018f503ddbd0633d00fd4554d02a9da0` adds the deterministic checkpoint immediately before the platform successful-return metadata barrier.

Review of that repair identified a release-safety requirement: a deliberate indefinite wait must never become reachable in a shipped build merely because a feature is accidentally enabled. `61f94a4b076d83109703aedde51f73f1eb9e47e3` adds a compile-time fail-closed guard for `score-storage-fault-injection` whenever `debug_assertions` are absent. `03b6b3c14f65ba80dcfeb0a5180dcc8b4c9d8543` adds owner checks that the normal Tauri desktop dependency feature graph excludes the feature and that an explicit release-mode core build with the feature is rejected. Exact `0be5683c2a7ea17d89e0b5deeb88c5e0bea0134d` completed owner run `35534785802` successfully on macOS 15 job `106141747352` and Windows Server 2025 job `106141747629`, including both feature-exclusion evidence and the pre-metadata-barrier termination regression.

That still left two earlier production boundaries represented only by manually constructed filesystem fixtures. `8f3186938c7754a24cbfdd31fbdcfa81a1415eea` extends the real-public-publisher regression with required `after-stage-sync-before-link` and `after-link-before-stage-retirement` checkpoints. At that test-only head those checkpoints did not exist, so both new cases are deterministic behavioral source-level REDs. `1a381460d0ee9a219a1bbc871b9db3b078accb41` makes the existing owner-only checkpoint helper crate-visible without changing default-build behavior. `1f1377c219f885996dccdd81168ae23529fe4a55` places the two new checkpoints in the lower publication owner: one after the synchronized stage handle is closed and before `hard_link`, the other immediately after `hard_link` and before destination attestation/stage retirement. Default builds still execute a no-op helper; release builds still fail closed if the owner-test feature is enabled.

## Fault semantics

The interrupted-copy fixture leaves only `%PD` in an exact reserved `.score-<uuid>.stage` name. Restart inventory retires that owned temporary residue and returns no published receipt.

On Unix, the permission fixture makes an exact reserved stage unreadable before restart inventory. Recovery returns an error and preserves the stage. It does not infer that unreadable bytes are disposable merely because their pathname is in the reserved namespace.

The kernel write-failure regression creates a 128 KiB PDF-shaped source, then starts the current integration-test binary in a child process with a 512-byte file-size limit. The production publisher encounters the kernel write failure while copying. It must return the generic attachment error, publish no destination, retire the owned partial stage, preserve the source and leave fresh inventory empty.

The capacity-exhaustion regression is deliberately different from `RLIMIT_FSIZE`. The selected 1 MiB source lives outside the isolated image. The test fills and synchronizes the fixed-size image until real `ENOSPC`, removes only a 512 KiB reserve, and invokes the public publisher. Publication must fail before destination truth is created; the owned partial stage must be retired, the source must remain unchanged and restart inventory must be empty.

The real-publisher termination suite now owns three checkpoints under the same public API and workspace lease:

- `after-stage-sync-before-link`: synchronized stage exists, destination does not. After process termination, fresh recovery must retire the abandoned stage and return no published receipt.
- `after-link-before-stage-retirement`: stage and destination both exist with the same buyer bytes. After termination, fresh recovery must retain the destination, retire only the equal-content temporary alias and return exactly one path-free receipt.
- `before-metadata-barrier`: stage has been retired and destination has passed final lower-level identity attestation, while the public wrapper still holds the workspace lease. After termination, fresh inventory must retain the destination and return exactly one receipt.

At every checkpoint the parent first requires live inventory to fail because the child still owns `.score-storage.lock`; this proves the test has not escaped the actual owner transaction before termination.

## Security Notes

**Untrusted state.** Every directory entry and every stage byte stream is untrusted at restart.

**Trust boundary.** Exact reserved-name parsing identifies candidate temporary state; cleanup still passes through the Score Storage lease, no-follow/reparse checks, bounded admission content and native deletion authority. Process-termination checkpoints are owner-test instrumentation behind an explicit Cargo feature and exact environment selector; they add no runtime command, network surface or product mutation authority. Release builds fail to compile if the feature is enabled, and the desktop dependency feature graph is checked separately so the shipped manifest cannot silently opt into it.

**Safe failure.** Incomplete or stage-only state never becomes destination truth. Equal stage+destination state retires only the temporary alias after validated content equality. A process killed after stage retirement but before the successful-return barrier leaves published object truth for restart inventory, not a fabricated Project Persistence reference or guessed delete.

**Claim boundary.** Current source evidence covers interrupted partial copy, Unix permission denial, Windows-native ACL denial, Unix kernel-enforced file-size write failure, macOS fixed-filesystem `ENOSPC`, and real-public-publisher process termination at the three publication checkpoints above. Exact `0be5683c...` is historical hosted GREEN for the pre-metadata-barrier case and feature exclusion; the newer three-boundary source requires fresh exact-head owner settlement before it is called hosted GREEN. None of this proves packaged desktop-app cancellation, sudden power loss, Windows capacity exhaustion or Windows directory-entry successful-return durability.

## Next buyer gap

After the current three-boundary exact head settles, remaining process-lifecycle evidence is the packaged desktop executable rather than the owner-native integration-test child. Sudden-power-loss/directory-entry durability follows after that. Windows directory-entry durability remains unclaimed until a supported native primitive and recovery experiment justify it. The separate Unix final basename identity-check-to-`unlinkat` micro-race and coexistence with an older unleased BandScope build remain explicit storage-authority gaps.

# Score attachment successful-publication durability

## Problem

Score Storage already synchronized the private staging file before no-clobber hard-link publication and could recover stage-only or verified post-link process death. That made the object lifecycle crash-safe at the process boundary, but it did not establish a separate successful-return durability barrier for the directory entry itself.

The distinction matters for the buyer contract. POSIX directory operations are atomic and serializable but are not necessarily durable; an application that needs a directory modification to survive a crash must synchronize the directory. Returning attachment success before that barrier could therefore acknowledge bytes that a sudden power loss may not leave durably named in the score workspace.

This is Score Storage truth. Project Persistence must not compensate by probing score paths or copying storage implementation.

## Constraints

- Keep the existing descriptor-bounded 25 MiB copy, PDF validation, private staging, no-clobber publication, object-identity attestation, cross-process lease and restart recovery unchanged.
- The publication lease must cover the metadata durability barrier. Releasing it between link publication and synchronization would let another current-contract process mutate the same workspace before the success transaction reaches its durability point.
- A durability failure after publication must not guess that the published object is absent or safe to delete. The existing restart inventory remains the recovery authority.
- Errors remain path- and payload-safe.
- Do not claim a Windows directory-entry power-loss guarantee without a verified supported-runtime primitive and exact-head evidence.
- Do not introduce a second publication implementation at the Tauri boundary; the crate-root publication API remains the single application-facing contract.

## Alternatives considered

### Treat staged-file `sync_all` as sufficient

Rejected. Synchronizing the file contents does not, by itself, establish the separate directory modification durability requested by the successful-return contract on POSIX systems.

### Release the Score Storage lease and synchronize in an outer wrapper

Rejected after self-review. Another current-contract process could acquire the lease after lower-level publication and before the outer metadata barrier. Successful publication must therefore keep the existing storage transaction lease alive through the durability barrier.

### Call a process-wide or asynchronous `sync`

Rejected. A global sync is broader than the Score Storage bounded context and may return before all buffers have reached persistent media on Darwin. It also obscures which namespace mutation the product is waiting for.

### Delete the published object when the metadata barrier fails

Rejected. The object may already be a valid durable recovery candidate. Destructive guessing would turn an uncertain durability result into possible buyer-data loss.

### Claim equivalent Windows durability using only the staged-file flush

Rejected. The lower publisher synchronizes the staged file before the link is created, but that is not evidence that the directory-entry update has reached persistent media. The Windows directory-metadata contract remains an explicit follow-up rather than a fabricated cross-platform claim.

## Selected contract

`score_recovery::publish_score_pdf_attachment` remains the single application-facing publication transaction. It holds the existing `ScoreWorkspaceLease` across abandoned-stage recovery, lower Score Storage publication and the successful-return metadata barrier:

- **macOS:** open the app-owned score directory and call `fsync_volume_np` with `SYNC_VOLUME_FULLSYNC | SYNC_VOLUME_WAIT`. Darwin documents this as syncing data and metadata for the filesystem containing the descriptor to disk hardware and waiting for completion.
- **other Unix:** open the app-owned score directory and call `File::sync_all()` before returning success.
- **Windows:** retain the existing synchronized staging-file contract and make no new directory-entry power-loss claim until the native owner gains a separately verified Windows barrier.

The platform-specific primitive is isolated in `score_publication`, but that module does not own the transaction. `score_recovery` invokes it before the workspace lease drops. A focused unit regression attempts to reacquire the lease from inside the injected metadata barrier and requires that reacquisition to fail, proving the barrier executes inside the owner transaction.

If the post-publication barrier fails, the caller receives the existing generic attachment failure. Score Storage does not delete an already-published object in response. A subsequent inventory/recovery pass determines actual object truth.

## Test and CI ownership

Source-level RED `49e886f4d43cfacab3bc891b1f7a8ef02089ce2e` added `score_pdf_success_durability.rs`, requiring an explicit successful-publication durability boundary. A causal descendant followed before terminal hosted evidence, so this is source RED only.

Implementation lineage:

- `76efc35308c96ad791d4e1c2ac4c0c26187e8f3e` introduced the supported-platform metadata primitive.
- `18d74a488b67a0c2d956cb37cbea2a57860aeaca` initially routed publication through an outer wrapper.
- self-review found that the outer wrapper released the Score Storage lease before synchronization, leaving a narrow inter-process mutation interval; that intermediate design is not the accepted transaction contract.
- `2804d00776a8e829d2c5c661806c6498d496631c` narrowed `score_publication` to the platform durability primitive.
- `542b46d3fdb82499bcbe56b4395b3c4e4e6addff` moved the durability call inside `score_recovery` while the workspace lease is alive and added a lease-continuity regression.
- `8371642ecae5e40907c8743bf9c6cb76142ea345` restores the crate-root API to the canonical Score Storage transaction.
- `f923474965b2e9ed163af6bf04de928b10048d12` updates the integration contract to require publication -> durability ordering inside that transaction.
- `e208821affce548148c5ddb269d4b892a25470bf` first added the new owner inputs to `score-storage-native`, but accidentally malformed the existing exact `actions/checkout` pin while editing the workflow.
- `0c99ef61a44d8c7ccdd403a010811bb3580a0090` immediately restores the canonical checkout SHA; the malformed intermediate workflow is not evidence and must not be used as a run target.

The owner workflow runs `score_publication` and `score_recovery` unit tests plus `score_pdf_success_durability` on macOS 15 and Windows Server 2025. The first descendant before the lease self-review, `84e51ad0faebdd2adbd18a19d1e865c61e240a26`, completed its macOS owner job successfully, which proved the Darwin FFI symbol/flags were executable on the hosted macOS 15 lane, but that predecessor GREEN does not transfer to the later lease-bound head.

A fresh exact-head macOS GREEN is required for the accepted lease-bound design. Windows GREEN verifies that the deliberately narrower existing Windows path remains intact; it does not turn the unimplemented Windows directory-entry power-loss barrier into a claim.

## Claim boundary

This repair improves **successful-return durability** for macOS and other Unix systems. It does not prove power-loss behavior for every filesystem, storage controller, virtualization layer or packaged executable. It does not prove authenticity or provenance of the PDF. It does not make Project Persistence metadata durable and does not decide Recover / Preserve / Discard intent.

The remaining acceptance work is deliberate fault injection and packaged evidence at the meaningful boundaries: cancellation, disk-full, permission failure and power loss; Windows directory-entry durability; old unleased-build coexistence; Unix residual basename race; project deletion/rollback; and cross-owner recovery UX.

## References

Apple Inc. (n.d.). *VNOP_FSYNC*. Apple Developer Documentation. https://developer.apple.com/documentation/kernel/1586212-vnop_fsync

Apple Inc. (n.d.). *sync_volume_np(3): Sync a mounted filesystem*. macOS system manual. The current Xcode man-page rendering is mirrored at https://keith.github.io/xcode-man-pages/sync_volume_np.3.html

Microsoft. (2025). *NtFlushBuffersFileEx function (ntifs.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/nf-ntifs-ntflushbuffersfileex

Microsoft. (2021). *FlushFileBuffers function (fileapi.h)*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers

The Open Group. (2024). *Rationale for Base Definitions, Issue 8*. POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/xrat/V4_xbd_chap01.html

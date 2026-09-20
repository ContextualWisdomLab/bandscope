# Score attachment Windows ACL recovery

## Problem

Score Storage restart recovery already fails closed when a reserved staging object cannot be read, but the owned native suite previously exercised that permission boundary only with Unix mode bits. On the supported Windows Server 2025 lane there was no production-path evidence that an ACL-denied reserved stage is preserved rather than deleted or promoted into published object truth.

This matters because the Windows implementation deliberately relies on the app-owned Score Storage parent DACL rather than Unix-style `0600` mode bits. A recovery contract that is only proven on Unix does not establish the corresponding Windows confidentiality and evidence-preservation behavior.

## Constraint and ownership

BandScope Score Storage owns the reserved `.score-<uuid>.stage` namespace and restart cleanup semantics. Project Persistence does not inspect or mutate Score Storage paths. The test must therefore drive the public restart inventory boundary and must not duplicate the private Windows handle/deletion implementation.

The fixture uses the supported Windows runner's native `icacls` command to remove inherited access and install an explicit read deny ACE for the current process identity. Recovery then calls `inventory_published_score_pdf_receipts()` exactly as a fresh process would. The ACL is reset before the fixture is inspected or deleted so the preservation assertion does not depend on querying the intentionally denied path.

## RED and repair

Commit `3bee635639cf0976b8628350a0be62424676350a` added `apps/desktop/core/tests/score_pdf_windows_acl_recovery.rs`. At that source head the owner workflow matched the file through `score_pdf_*.rs` but its explicit `cargo test` invocation did not execute the new integration test. That was a deterministic source-level owner-evidence RED; no hosted failing verdict is claimed for the superseded test-only head.

Commit `78b775b5241180a6077aea6e2f34f35707e3b551` repaired CI ownership by adding `--test score_pdf_windows_acl_recovery` to the exact macOS 15 / Windows Server 2025 Score Storage invocation. The macOS lane compiles the crate-level `#![cfg(windows)]` test as zero platform tests; the Windows lane owns the behavioral ACL denial assertion.

## Acceptance

The Windows native lane must prove all of the following on the exact PR head:

- a valid reserved stage exists before the fault is installed;
- the current Windows identity receives an explicit read-deny ACL on that stage;
- restart inventory returns an error rather than inventing a published receipt;
- after ACL reset, the same reserved stage still exists and can be cleaned by the test harness;
- no claim is made about Windows directory-entry power-loss durability, disk-full behavior, packaged cancellation, or Project Persistence attachment recovery.

The result is evidence for fail-closed Windows ACL recovery only. It does not weaken the existing requirement for fresh receipt-bound mutation authority, native object identity checks, or the separate successful-return durability decision.

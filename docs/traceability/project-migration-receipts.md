# Project migration receipts

## Problem

BandScope already migrated legacy, v1, and v2 project documents into the current v3 typed document, but the migration boundary originally returned only the migrated document. A caller could not prove which input bytes were admitted, which source version was interpreted, or which deterministic current-version bytes resulted. After receipt evidence was added, one durability gap remained: callers still had to serialize the migrated document themselves and could stage that output without first proving that the exact candidate reopened through the current parser and reproduced itself canonically.

## Decision

Project Persistence emits a content-addressed receipt from the same canonical migration boundary that parses project files. `ProjectMigrationReceipt` records the source format version (`None` only for the unversioned legacy shape), target format version, SHA-256 of the exact input bytes, SHA-256 of the canonical current-version serialization, and whether a historical migration occurred.

`prepare_project_migration` is now the canonical migration-on-copy preparation boundary. It parses through the existing version dispatch, serializes the admitted document through `project_content_for_document`, hashes the exact candidate bytes, reopens those exact bytes through the current parser, and serializes them again. The function returns `PreparedProjectMigration` only when the reopened version is current and the second canonical serialization is byte-for-byte identical. The returned value contains the typed document, the validated canonical candidate bytes, and the receipt; it does not retain the raw historical input.

`project_document_with_migration_receipt` remains a compatibility wrapper and delegates to `prepare_project_migration`, so older callers cannot bypass the candidate reopen/idempotency check while asking for receipt evidence.

## RED / GREEN evidence

RED `ef4e0a4e6f0809d611a50d51b30870edd899732f` changed the checked-in v2 fixture regression to require migration source/target versions and exact input/output digests. The predecessor did not expose a migration-receipt API, so that contract could not compile.

GREEN `e833187ac50fe3e71aa51850a5266872ab6a7bb6` added the receipt and deterministic parser binding. `abf66119cc6fa6492c3c0f1192f2d517215c3192` exported the contract through the GUI-independent crate root. `74d5bcc3245056d5b62003e89b5a6deaa657dc47` strengthened the fixture regression by feeding the canonical v3 output back through the same boundary and requiring the same output SHA-256 with `migrated = false`.

RED `2c46d0c2ea98604ae7241f0390e8e9cfea4de6d7` then required the same checked-in v2 fixture to produce a prepared migration candidate whose exact canonical bytes reopen as current v3 and reproduce themselves byte-for-byte. The predecessor exposed only a document plus receipt, so the new preparation contract was absent.

GREEN `a137fd9d2258b573df719de27a0043a8351a928f` added `PreparedProjectMigration` and `prepare_project_migration`; `04ab3cc33539c16568db73f41884cd618129bc78` exported that API through the GUI-independent crate root. The compatibility receipt function now delegates to the validated preparation boundary rather than maintaining a separate partial path.

## Rejected alternatives

A timestamp or random migration id was rejected because it would make receipts nondeterministic. Hashing only the parsed JSON value was rejected because it would not bind the exact input bytes supplied by the caller. Hashing only the input was rejected because it would not identify the resulting v3 serialization. A second migration implementation dedicated to receipts was rejected because it would create two owners for format interpretation.

Returning only a typed document plus output digest was also rejected for migration publication. That would still force filesystem callers to reserialize independently and would not prove that the exact bytes selected for staging reopen under the current parser. `PreparedProjectMigration` therefore owns the validated canonical candidate as part of the migration plan.

The receipt and prepared candidate are evidence of deterministic content transformation, not a signature, authenticity proof, backup, or proof that filesystem publication/recovery completed. They do not replace atomic publication, known-good backup retention, downgrade/application rollback policy, or startup recovery.

## Follow-up

The next migration slice is filesystem orchestration: bind `PreparedProjectMigration` to the selected target's admitted file identity, preserve a verified pre-migration known-good artifact, publish only if that target identity is unchanged, reopen the published candidate through the same current parser, and retain or restore the known-good artifact if publication/open verification fails. Autosave/startup recovery and accessible Restore / Compare / Discard remain separate #962 work.

## Security Notes

### Attack surface and trust boundary

Project file bytes are untrusted. The receipt/preparation boundary runs only after the existing strict version parser admits the document; it does not grant filesystem or playback authority. The hash inputs are the bounded project content already subject to the Project Persistence file-size ceiling and the deterministic current serialization.

### Allowlist and validation

Only legacy, v1, v2, and current v3 inputs are admitted. Unsupported versions and malformed/unknown fields continue to fail closed through the existing parser. Source-reference validation remains unchanged and native Resource Admission remains the authority for persisted audio byte identity. A prepared candidate must reopen explicitly as `CURRENT_PROJECT_FORMAT_VERSION` and reproduce identical canonical bytes before it can be returned.

### Mitigations

Input and output digests use the repository-owned SHA-256 shared kernel rather than another hashing implementation. The output is produced by the canonical v3 serializer from the admitted typed document. The prepared candidate is reopened before it leaves the core migration boundary, which prevents parser/serializer disagreement from reaching a filesystem staging adapter. The receipt contains versions and digests only; the preparation value contains current canonical project bytes only in memory and carries no filesystem path, playback URL, account identity, or secret.

### Realistic threats

- a malformed project attempts to obtain a receipt without passing schema/version validation;
- two distinct input byte streams are incorrectly treated as the same migration event;
- migration code changes output while stale evidence claims the previous result;
- canonical serialization emits bytes that the current parser does not admit;
- a caller reserializes a migrated document differently from the bytes whose digest was recorded;
- diagnostics accidentally copy raw project content when only the receipt is needed.

### Safe failure

Parsing, current serialization, candidate reopen, canonical-reproduction, or digest failure returns an error and no prepared migration. Unsupported future versions remain explicit errors. A receipt is never treated as proof that publication or recovery completed.

### Logging and privacy

Receipts are content-derived integrity metadata. They are purpose-bound to migration/recovery evidence and should not be expanded with raw project JSON, local paths, user names, or audio bytes in ordinary diagnostics. `PreparedProjectMigration.canonical_content` is publication material, not diagnostic payload.

### Test points

`project_format_v2_fixture.rs` binds the checked-in v2 fixture input digest to the receipt, binds the receipt output digest to the prepared canonical v3 bytes, verifies source/target versions, and proves that re-preparing those exact canonical bytes yields v3 with `migrated = false`, the same digest, and byte-for-byte identical canonical content.

### Remaining risk

The prepared migration is not yet attached to target file-identity admission, migration publication, known-good backup retention, downgrade/application rollback, or startup recovery UX. Packaged Windows/macOS crash, disk-full, cancellation, and power-loss evidence remains required before Project Persistence can be called commercially crash-safe.

# Project migration receipts

## Problem

BandScope already migrated legacy, v1, and v2 project documents into the current v3 typed document, but the migration boundary returned only the migrated document. A caller could not prove which input bytes were admitted, which source version was interpreted, or which deterministic current-version bytes resulted. That left #962's migration requirement incomplete even when parsing itself was deterministic.

## Decision

Project Persistence now emits a content-addressed receipt from the same canonical migration boundary that parses project files. `ProjectMigrationReceipt` records the source format version (`None` only for the unversioned legacy shape), target format version, SHA-256 of the exact input bytes, SHA-256 of the canonical current-version serialization, and whether a historical migration occurred.

`project_document_with_migration_receipt` does not introduce a second parser. It calls the same private version-dispatch path used by `project_document_from_content`, serializes the admitted typed document with `project_content_for_document`, and hashes both byte sequences through the existing `content_sha256` shared kernel. Re-admitting that canonical output produces a v3 receipt with `migrated = false` and the same output digest, making idempotency machine-checkable.

## RED / GREEN evidence

RED `ef4e0a4e6f0809d611a50d51b30870edd899732f` changed the checked-in v2 fixture regression to require migration source/target versions and exact input/output digests. The predecessor did not expose a migration-receipt API, so that contract could not compile.

GREEN `e833187ac50fe3e71aa51850a5266872ab6a7bb6` added the receipt and deterministic parser binding. `abf66119cc6fa6492c3c0f1192f2d517215c3192` exports the contract through the GUI-independent crate root. `74d5bcc3245056d5b62003e89b5a6deaa657dc47` strengthens the fixture regression by feeding the canonical v3 output back through the same boundary and requiring the same output SHA-256 with `migrated = false`.

## Rejected alternatives

A timestamp or random migration id was rejected because it would make receipts nondeterministic. Hashing only the parsed JSON value was rejected because it would not bind the exact input bytes supplied by the caller. Hashing only the input was rejected because it would not identify the resulting v3 serialization. A second migration implementation dedicated to receipts was rejected because it would create two owners for format interpretation.

The receipt is evidence of deterministic content transformation, not a signature, authenticity proof, or backup. It does not replace atomic publication, known-good backup retention, migration-on-copy, or application rollback policy.

## Follow-up

The next migration slice is publication orchestration: migrate a validated copy, preserve the pre-migration known-good artifact until the migrated document has opened successfully, and attach the receipt to that bounded recovery decision. Autosave/startup recovery and accessible Restore / Compare / Discard remain separate #962 work.

## Security Notes

### Attack surface and trust boundary

Project file bytes are untrusted. The receipt boundary runs only after the existing strict version parser admits the document; it does not grant filesystem or playback authority. The hash inputs are the bounded project content already subject to the Project Persistence file-size ceiling and the deterministic current serialization.

### Allowlist and validation

Only legacy, v1, v2, and current v3 inputs are admitted. Unsupported versions and malformed/unknown fields continue to fail closed through the existing parser. Source-reference validation remains unchanged and native Resource Admission remains the authority for persisted audio byte identity.

### Mitigations

Input and output digests use the repository-owned SHA-256 shared kernel rather than another hashing implementation. The output is produced by the canonical v3 serializer from the admitted typed document. The receipt contains versions and digests only; it carries no filesystem path, project contents, playback URL, account identity, or secret.

### Realistic threats

- a malformed project attempts to obtain a receipt without passing schema/version validation;
- two distinct input byte streams are incorrectly treated as the same migration event;
- migration code changes output while stale evidence claims the previous result;
- diagnostics accidentally copy raw project content when only the receipt is needed.

### Safe failure

Parsing, current serialization, or digest failure returns an error and no receipt. Unsupported future versions remain explicit errors. A receipt is never treated as proof that publication or recovery completed.

### Logging and privacy

Receipts are content-derived integrity metadata. They are purpose-bound to migration/recovery evidence and should not be expanded with raw project JSON, local paths, user names, or audio bytes in ordinary diagnostics.

### Test points

`project_format_v2_fixture.rs` binds the checked-in v2 fixture input digest to the receipt, binds the receipt output digest to canonical v3 serialization, verifies source/target versions, and proves re-admission of that canonical output is idempotent.

### Remaining risk

The receipt is not yet attached to migration-on-copy publication, known-good backup retention, downgrade/application rollback, or startup recovery UX. Packaged Windows/macOS crash, disk-full, cancellation, and power-loss evidence remains required before Project Persistence can be called commercially crash-safe.

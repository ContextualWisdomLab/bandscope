# Project migration receipts

## Problem

BandScope already migrated legacy, v1, and v2 project documents into the current v3 typed document, but the migration boundary originally returned only the migrated document. A caller could not prove which input bytes were admitted, which source version was interpreted, or which deterministic current-version bytes resulted. After receipt evidence was added, one durability gap remained: callers still had to serialize the migrated document themselves and could stage that output without first proving that the exact candidate reopened through the current parser and reproduced itself canonically.

The first `PreparedProjectMigration` revision closed that byte-validation gap but exposed `document`, `canonical_content`, and `receipt` as public mutable struct fields. An external crate could therefore construct a value that had never passed `prepare_project_migration`, or mutate a previously validated candidate before a persistence adapter consumed it. The implementation called the type “fully validated” without making that invariant true at the Rust API boundary.

A separate filesystem gap remained after the prepared value was sealed. The bounded project reader proved that the selected path resolved to one regular file across pre-open/open/post-open checks, but it returned only the UTF-8 content and discarded the native identity obtained from the opened file. A later migration publisher would therefore have to recapture identity from the pathname after parsing. If another process replaced that pathname between read and publication, the replacement could be mistaken for the predecessor from which the migration was derived.

## Decision

Project Persistence emits a content-addressed receipt from the same canonical migration boundary that parses project files. `ProjectMigrationReceipt` records the source format version (`None` only for the unversioned legacy shape), target format version, SHA-256 of the exact input bytes, SHA-256 of the canonical current-version serialization, and whether a historical migration occurred.

`prepare_project_migration` is the canonical migration-on-copy preparation boundary. It parses through the existing version dispatch, serializes the admitted document through `project_content_for_document`, hashes the exact candidate bytes, reopens those exact bytes through the current parser, and serializes them again. The function returns `PreparedProjectMigration` only when the reopened version is current and the second canonical serialization is byte-for-byte identical. The returned value contains the typed document, the validated canonical candidate bytes, and the receipt; it does not retain the raw historical input.

`PreparedProjectMigration` is now a sealed validated value inside `bandscope_desktop_core`: its three fields are private and external consumers receive immutable references through `document()`, `canonical_content()`, and `receipt()`. This keeps construction and mutation behind the canonical preparation function while still giving Project Persistence the exact bytes and evidence it needs for the later filesystem-publication slice. A cloned receipt or copied string is ordinary detached data; it does not mutate or manufacture a prepared migration value.

Project Persistence now also exposes `read_project_file_with_identity`. It retains the existing bounded, no-follow/reparse-safe, before/opened/after path-stability checks but returns a sealed `ProjectFileReadSnapshot` containing the UTF-8 bytes and the native identity obtained from the same opened handle that produced those bytes. Unix uses the opened handle metadata's device/inode identity; Windows uses the opened handle's volume serial number/file index. The compatibility `read_project_file` path still returns only the content and delegates to the same identity-bearing reader, so recovery and existing callers keep one read implementation.

The read snapshot is a filesystem predecessor-authority primitive, not a migration receipt and not Resource Admission evidence. It deliberately does not claim that an inode/file-index identity detects an in-place write to the same file object. Migration publication must therefore combine the read-bound identity with `ProjectMigrationReceipt.input_sha256`: after atomic exchange/replacement, the displaced known-good object must match both the expected native identity and the exact input digest before publication can be committed. A mismatch requires rollback rather than treating identity alone as content-level compare-and-swap.

`project_document_with_migration_receipt` remains a compatibility wrapper and delegates to `prepare_project_migration`, so older callers cannot bypass the candidate reopen/idempotency check while asking for receipt evidence.

## RED / GREEN evidence

RED `ef4e0a4e6f0809d611a50d51b30870edd899732f` changed the checked-in v2 fixture regression to require migration source/target versions and exact input/output digests. The predecessor did not expose a migration-receipt API, so that contract could not compile.

GREEN `e833187ac50fe3e71aa51850a5266872ab6a7bb6` added the receipt and deterministic parser binding. `abf66119cc6fa6492c3c0f1192f2d517215c3192` exported the contract through the GUI-independent crate root. `74d5bcc3245056d5b62003e89b5a6deaa657dc47` strengthened the fixture regression by feeding the canonical v3 output back through the same boundary and requiring the same output SHA-256 with `migrated = false`.

RED `2c46d0c2ea98604ae7241f0390e8e9cfea4de6d7` then required the same checked-in v2 fixture to produce a prepared migration candidate whose exact canonical bytes reopen as current v3 and reproduce themselves byte-for-byte. The predecessor exposed only a document plus receipt, so the new preparation contract was absent.

GREEN `a137fd9d2258b573df719de27a0043a8351a928f` added `PreparedProjectMigration` and `prepare_project_migration`; `04ab3cc33539c16568db73f41884cd618129bc78` exported that API through the GUI-independent crate root. The compatibility receipt function now delegates to the validated preparation boundary rather than maintaining a separate partial path.

RED `5ff80277e24e82c7803c8910fe8b892f779230fd` changed the external integration fixture to require read-only accessors on the prepared value. The predecessor exposed only public fields, so the fixture could not compile against the intended sealed-value API. GREEN `fd2e4f2b5e781ad8cd0597038a728d3840584d1c` made the prepared fields private and added documented immutable accessors without changing parsing, hashing, canonicalization, or receipt semantics.

RED `f1f374a34a6eae44f8c7f28f285c404cf1aa8fef` adds a native filesystem regression that reads one project, replaces its pathname only after the bounded read has completed, and then requires the returned predecessor identity to remain the parked original file's identity rather than the new pathname occupant. The predecessor exposed no identity-bearing read API, so the regression could not compile.

GREEN `cc0755bfd830dc187bfdc18f2ee1d718ec060ce7` introduces `ProjectFileReadSnapshot`, captures the identity from the exact opened file before the handle is consumed by the bounded reader, and keeps the existing string-returning reader as a compatibility projection. The regression compares the snapshot against both the parked original and the competing path occupant, making post-read pathname replacement an executable boundary rather than a documentation assumption.

## Rejected alternatives

A timestamp or random migration id was rejected because it would make receipts nondeterministic. Hashing only the parsed JSON value was rejected because it would not bind the exact input bytes supplied by the caller. Hashing only the input was rejected because it would not identify the resulting v3 serialization. A second migration implementation dedicated to receipts was rejected because it would create two owners for format interpretation.

Returning only a typed document plus output digest was also rejected for migration publication. That would still force filesystem callers to reserialize independently and would not prove that the exact bytes selected for staging reopen under the current parser. `PreparedProjectMigration` therefore owns the validated canonical candidate as part of the migration plan.

Leaving the prepared fields public and asking every consumer to revalidate them was rejected because it turns one canonical invariant into repeated caller discipline. `#[non_exhaustive]` alone was also insufficient: it can restrict external struct construction, but public fields would still expose mutation on an existing value. The core type therefore owns private state and exposes only immutable views.

Recapturing predecessor identity from the pathname at publication time was rejected because it admits a different file if the path is replaced after the bytes used for migration were read. Returning a path plus bytes was rejected for the same reason. The reader must bind content to identity while the exact handle is open.

Native file identity alone is also rejected as a content-level compare-and-swap token. A cooperating or external writer can modify the same inode/file index in place without changing that identity. The existing migration input SHA-256 is therefore required as the content half of the eventual post-exchange displaced-artifact validation.

The receipt, prepared candidate, and read snapshot are evidence of deterministic content transformation and local predecessor identity, not a signature, authenticity proof, backup, or proof that filesystem publication/recovery completed. They do not replace atomic publication, known-good backup retention, downgrade/application rollback policy, or startup recovery.

## Follow-up

The next migration slice is filesystem orchestration: production `load_project` must use the identity-bearing bounded read, pass those exact bytes through `prepare_project_migration`, and publish the prepared candidate only through the existing journal/exchange owner. After exchange/replacement, the displaced object must match both the read-bound native identity and `receipt.input_sha256`; only then may the candidate be reopened through the current parser and the rollback artifact retired. Identity or digest mismatch must restore/retain the pre-migration known-good object. Downgrade/application rollback policy remains explicit work rather than an implicit side effect.

Autosave/startup recovery and accessible Restore / Compare / Discard remain separate #962 work.

## Security Notes

### Attack surface and trust boundary

Project file bytes are untrusted. The receipt/preparation boundary runs only after the existing strict version parser admits the document; it does not grant filesystem or playback authority. The hash inputs are the bounded project content already subject to the Project Persistence file-size ceiling and the deterministic current serialization. A `PreparedProjectMigration` itself is a validated core value: external crates cannot construct its private state or mutate its bound document/content/receipt in place. The read snapshot is constructed only by the bounded native reader and carries no selected path; its identity is tied to the opened file object rather than a later pathname lookup.

### Allowlist and validation

Only legacy, v1, v2, and current v3 inputs are admitted. Unsupported versions and malformed/unknown fields continue to fail closed through the existing parser. Source-reference validation remains unchanged and native Resource Admission remains the authority for persisted audio byte identity. A prepared candidate must reopen explicitly as `CURRENT_PROJECT_FORMAT_VERSION` and reproduce identical canonical bytes before it can be returned. Consumers can inspect the admitted document, canonical bytes, and receipt only through immutable accessors.

The project reader continues to require regular non-link files, no-follow/reparse-safe native opens, stable before/opened/after native identity, bounded bytes, and valid UTF-8. The identity-bearing API adds no alternate open path and no unbounded reread.

### Mitigations

Input and output digests use the repository-owned SHA-256 shared kernel rather than another hashing implementation. The output is produced by the canonical v3 serializer from the admitted typed document. The prepared candidate is reopened before it leaves the core migration boundary, which prevents parser/serializer disagreement from reaching a filesystem staging adapter. Private prepared-state fields prevent external construction or in-place mutation from masquerading as that validated result. The receipt contains versions and digests only; the preparation value contains current canonical project bytes only in memory and carries no filesystem path, playback URL, account identity, or secret.

The bounded reader captures native predecessor identity from the same open file used for bytes. Eventual migration publication must validate the displaced file after the atomic native replacement against both this identity and the receipt's exact input digest; validation before publication alone is insufficient because in-place same-object writes can preserve native identity.

### Realistic threats

- a malformed project attempts to obtain a receipt without passing schema/version validation;
- two distinct input byte streams are incorrectly treated as the same migration event;
- migration code changes output while stale evidence claims the previous result;
- canonical serialization emits bytes that the current parser does not admit;
- a caller reserializes a migrated document differently from the bytes whose digest was recorded;
- a caller constructs or mutates a value labeled as prepared without passing canonical validation;
- a selected pathname is replaced after migration input bytes are read and the replacement is mistaken for the predecessor;
- the same predecessor file object is modified in place after the read, preserving inode/file-index identity but changing content;
- diagnostics accidentally copy raw project content when only the receipt is needed.

### Safe failure

Parsing, current serialization, candidate reopen, canonical-reproduction, digest, or bounded native read failure returns an error and no prepared migration/read snapshot. Unsupported future versions remain explicit errors. A receipt or read identity is never treated as proof that publication or recovery completed. The public API provides no fallible bypass constructor for `PreparedProjectMigration` or `ProjectFileReadSnapshot`.

### Logging and privacy

Receipts are content-derived integrity metadata. Native project identities are local persistence-control metadata. Neither should be expanded with raw project JSON, local paths, user names, or audio bytes in ordinary diagnostics. `PreparedProjectMigration::canonical_content()` returns publication material, not diagnostic payload.

### Test points

`project_format_v2_fixture.rs` binds the checked-in v2 fixture input digest to the receipt, binds the receipt output digest to the prepared canonical v3 bytes, verifies source/target versions, and proves that re-preparing those exact canonical bytes yields v3 with `migrated = false`, the same digest, and byte-for-byte identical canonical content. The integration fixture consumes the prepared value only through the public immutable accessor API, while field privacy is enforced by the crate boundary.

`project_persistence_read_identity.rs` proves that a bounded read returns the original bytes and opened-file identity even when the selected pathname is subsequently occupied by another regular file. The snapshot must equal the parked original object's identity and differ from the competing path occupant.

### Remaining risk

The identity-bearing read is not yet wired into production migration publication. The existing ordinary load command still projects bounded content only. The eventual migration replacement must additionally verify the displaced object's exact input digest after atomic replacement to catch same-file in-place mutation before committing the new version. Known-good retention, candidate reopen, downgrade/application rollback, autosave/startup recovery UX, and packaged Windows/macOS crash, disk-full, cancellation, and power-loss evidence remain required before Project Persistence can be called commercially crash-safe.

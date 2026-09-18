# Project migration receipts

## Problem

BandScope accepts legacy, v1, and v2 project documents and migrates them to the current v3 typed document. The first implementation returned only the migrated document, so Project Persistence could not prove which exact input bytes were admitted or which exact current-version bytes were produced. Later revisions added deterministic receipts and a validated `PreparedProjectMigration`, but two filesystem gaps remained.

First, the bounded reader originally returned only UTF-8 content. A publisher would have had to recapture native identity from the pathname after parsing, allowing a different file to occupy the same pathname after the read. `ProjectFileReadSnapshot` fixed that by binding the bounded content to the native identity of the exact opened handle.

Second, native identity is not a content compare-and-swap token. A cooperating or external writer can modify the same inode/file index in place while preserving device/inode on Unix or volume serial/file index on Windows. The ordinary atomic replacement path therefore could still accept a migration derived from stale bytes if it checked only the displaced object's native identity. The same publication also needed to prove that the buyer-visible target still contained the exact canonical migration candidate before rollback material was retired.

## Decision

`ProjectMigrationReceipt` remains the canonical content-addressed migration evidence. It records source format version, target format version, SHA-256 of the exact input bytes, SHA-256 of the deterministic current-version output bytes, and whether historical migration occurred.

`prepare_project_migration` remains the migration-on-copy preparation boundary. It parses through the existing version dispatch, serializes through `project_content_for_document`, hashes the candidate, reopens those exact candidate bytes through the current parser, serializes them again, and returns `PreparedProjectMigration` only when the reopened version is current and canonical bytes reproduce exactly. The prepared value is sealed; external crates receive immutable `document()`, `canonical_content()`, and `receipt()` views and cannot construct or mutate its validated state.

The receipt now owns executable byte verification rather than requiring persistence adapters to duplicate SHA-256 comparison logic. `verify_input_reader` hashes an already-authorized reader with the repository-owned SHA-256 kernel and fails closed unless it equals `input_sha256`. `verify_output_reader` does the same for `output_sha256`. Neither method opens a pathname or claims filesystem authority; the caller must supply the exact native object it intends to validate.

Project Persistence keeps `read_project_file_with_identity` as the predecessor-authority primitive. It performs the existing bounded, no-follow/reparse-safe, before/opened/after stability checks and returns a sealed `ProjectFileReadSnapshot` with content plus native identity from the same opened file.

For migration replacement, Project Persistence now has a receipt-aware replacement path layered on the existing journal/exchange owner. Linux/macOS use the existing atomic exchange; Windows uses the existing `ReplaceFileW` backup path. After replacement, but before the prepared journal is promoted to the durable `published` marker or rollback material is removed, the migration validator:

1. opens the displaced predecessor through the existing no-follow native reader;
2. requires that exact opened handle to retain the read-bound native identity;
3. applies `receipt.verify_input_reader` to that same handle;
4. opens the published candidate through the same native authority boundary;
5. requires the exact opened target handle to retain the staged candidate identity; and
6. applies `receipt.verify_output_reader` before publication is committed.

If either native identity or either digest check fails, the existing rollback path restores the displaced object and cleans the candidate/journal. A crash after native replacement but before those validations leaves the journal in `prepared`, whose recovery behavior is conservative rollback. The journal becomes `published` only after both receipt-bound validations succeed, so a later recovery may retire the displaced artifact without replaying the digest computation.

The ordinary save path still uses the same shared replacement implementation with a no-op post-replacement validator. This preserves existing save semantics while keeping the new migration-specific content-CAS rule isolated to the migration contract instead of changing generic user-save concurrency policy implicitly.

Production `load_project` is not yet wired to invoke this migration publication path. This slice provides the exact filesystem/content CAS primitive required for that wiring; it does not claim automatic migrate-on-open is complete.

## RED / GREEN evidence

- RED `ef4e0a4e6f0809d611a50d51b30870edd899732f` required source/target versions plus exact input/output digests. GREEN `e833187ac50fe3e71aa51850a5266872ab6a7bb6` added `ProjectMigrationReceipt`; `74d5bcc3245056d5b62003e89b5a6deaa657dc47` proved current-version re-admission idempotency.
- RED `2c46d0c2ea98604ae7241f0390e8e9cfea4de6d7` required a self-validating canonical candidate. GREEN `a137fd9d2258b573df719de27a0043a8351a928f` added `PreparedProjectMigration` / `prepare_project_migration`; `04ab3cc33539c16568db73f41884cd618129bc78` exported it through the GUI-independent crate root.
- RED `5ff80277e24e82c7803c8910fe8b892f779230fd` required immutable accessor consumption. GREEN `fd2e4f2b5e781ad8cd0597038a728d3840584d1c` sealed the prepared value.
- RED `f1f374a34a6eae44f8c7f28f285c404cf1aa8fef` required bounded reads to retain the exact opened-file identity after a pathname replacement. GREEN `cc0755bfd830dc187bfdc18f2ee1d718ec060ce7` added `ProjectFileReadSnapshot` and `read_project_file_with_identity`.
- RED `eeb2b71a94c39c00c0dbf410b1ef0f428b7246c6` required the receipt itself to verify exact input bytes instead of leaving digest comparison to each adapter. GREEN `53ab33133550dbeaca8c7c404ba4b6bbfd2afd81` added fail-closed `verify_input_reader` using the existing SHA-256 owner.
- RED `26cf9e6586e127c6bcab3f500ba75b07f0d85d05` extended the same contract to the validated output bytes. GREEN `7b4c6e5e609f7074eabd2fca5cee5da4dfb08017` added `verify_output_reader` through the same private receipt-verification helper.
- RED `847c31da5203ecf625762322f630c4c8fb302378` added a native migration-publication regression. It modifies the already-read predecessor in place, proves native identity did not change, and requires migration publication to roll back because the exact input digest changed. It also requires the unchanged predecessor plus exact canonical candidate to commit successfully. The predecessor had no receipt-aware replacement API, so the contract could not compile.
- GREEN `a46be0d83531e49e9906d104a16197cb13d44c3b` factors the existing Linux/macOS and Windows replacement implementations through a post-replacement validator and adds `replace_existing_project_file_for_migration`. The migration validator reopens both displaced predecessor and published candidate through no-follow native handles, rechecks their expected native identities on those handles, and verifies exact receipt input/output digests before the existing success path can retire rollback material.

Hosted exact-head CI/security/SBOM/SAST/native-build evidence is required separately; a source commit is not treated as hosted GREEN until those checks are terminal on the exact head.

## Rejected alternatives

A timestamp or random migration id was rejected because it makes receipts nondeterministic. Hashing parsed JSON rather than exact bytes was rejected because whitespace or byte-level changes would disappear from evidence. A second hashing implementation was rejected because SHA-256 already has one repository owner.

Recapturing identity from the target pathname immediately before replacement was rejected because a post-read pathname occupant is not necessarily the file that produced the migration input. Native identity alone was rejected because in-place writes can retain it. Comparing free-form digest strings inside the Tauri adapter was rejected because it duplicates receipt semantics and makes input/output error handling diverge.

Validating only the displaced predecessor was rejected because the published target is also buyer truth: a same-object post-replacement write could change candidate bytes while native identity remains stable. Both predecessor and candidate therefore use identity plus exact receipt digest.

Deleting rollback material immediately after the native exchange was rejected. Validation occurs while the displaced object still exists. A failure restores or retains it rather than turning a detected race into data loss.

Writing a second migration-specific atomic-publication engine was rejected. The receipt-aware path composes the existing journal, exchange/`ReplaceFileW`, rollback, synchronization, and recovery machinery and changes only the post-replacement acceptance predicate.

## Security Notes

### Trust boundary

Project bytes and filesystem state are untrusted inputs to Project Persistence. A receipt proves deterministic byte identity only; it is not a signature or authenticity claim. Native identity proves local filesystem object continuity only; it is not content identity. Migration publication accepts only the conjunction of both forms of evidence.

Receipt verification accepts an already-authorized `Read` object and never opens paths. The Tauri persistence layer owns path/native-handle authority and uses its existing no-follow/reparse-safe open contract. The exact opened handle used for digest verification is also checked against the expected native identity before its bytes are consumed.

### Safe failure and crash boundary

Malformed or unsupported projects fail before a prepared migration exists. Candidate parser/serializer disagreement fails before staging. After atomic replacement, native-identity or receipt-digest mismatch routes to the existing rollback path and returns the bounded project-publication error.

A process interruption before the receipt-aware validator finishes leaves the durable journal in `prepared`; recovery rolls the candidate back. Promotion to `published` happens only after predecessor and candidate verification succeed. This ordering is the durable evidence that content-CAS validation completed before cleanup becomes legal.

### Privacy

Receipts contain versions and SHA-256 values only. `ProjectFileReadSnapshot` carries bounded content and local native identity in memory but no path. No username, hostname, audio bytes, playback URL, account id, or secret is added to migration evidence. Raw project JSON remains publication material, not routine diagnostic payload.

### Test points

`apps/desktop/core/tests/project_migration_receipt_input_binding.rs` verifies exact input and output bytes and rejects parse-equivalent byte changes.

`apps/desktop/src-tauri/tests/project_persistence_read_identity.rs` proves the bounded read retains the original opened-file identity after the selected pathname is replaced.

`apps/desktop/src-tauri/tests/project_persistence_migration_content_cas.rs` proves that an in-place predecessor byte change with unchanged native identity cannot commit migration publication, while an exact predecessor plus exact candidate can commit and retire the stage.

## Remaining risk and follow-up

The new receipt-aware replacement primitive is not yet called by production `load_project`. The next buyer-path slice is to make load/recovery use `read_project_file_with_identity`, pass those exact bytes to `prepare_project_migration`, and, only when `receipt.migrated` is true, stage `canonical_content` and invoke the receipt-aware replacement using the snapshot identity. The returned current document must remain the same validated prepared document; migration publication failure must not silently substitute a different project state.

Known-good retention beyond the immediate rollback window, application downgrade behavior, bounded autosave, global startup recovery discovery, accessible Restore / Compare / Discard UX, and packaged Windows/macOS interruption, disk-full, cancellation, and power-loss evidence remain open under #962. Resource Admission owner #866 remains a separate protected prerequisite for source-audio re-admission; this Project Persistence slice does not copy or bypass it.

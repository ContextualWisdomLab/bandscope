# Project migration receipts

## Problem

BandScope accepts legacy, v1, and v2 project documents and migrates them to the current v3 typed document. The first implementation returned only the migrated document, so Project Persistence could not prove which exact input bytes were admitted or which exact current-version bytes were produced. Later revisions added deterministic receipts and a validated `PreparedProjectMigration`, but filesystem and buyer-path gaps remained.

First, the bounded reader originally returned only UTF-8 content. A publisher would have had to recapture native identity from the pathname after parsing, allowing a different file to occupy the same pathname after the read. `ProjectFileReadSnapshot` fixed that by binding the bounded content to the native identity of the exact opened handle.

Second, native identity is not a content compare-and-swap token. A cooperating or external writer can modify the same inode/file index in place while preserving device/inode on Unix or volume serial/file index on Windows. The ordinary atomic replacement path therefore could still accept a migration derived from stale bytes if it checked only the displaced object's native identity. The same publication also needed to prove that the buyer-visible target still contained the exact canonical migration candidate before rollback material was retired.

Third, those primitives were not part of the production load path. `load_project` recovered a selected target, read it through the compatibility bounded string reader, migrated only in memory through `project_document_from_content`, and returned that document. A successful open therefore did not durably publish the validated current-format copy even when the selected project was historical.

Fourth, the first receipt-aware replacement validated both exact byte sets before promoting its journal to `published`, but the durable journal stored only native identities. A crash after journal promotion and before cleanup therefore reopened a gap: while BandScope was down, the published candidate or displaced known-good predecessor could be modified in place without changing native file identity, and restart recovery would have deleted rollback material after checking identities only.

## Decision

`ProjectMigrationReceipt` remains the canonical content-addressed migration evidence. It records source format version, target format version, SHA-256 of the exact input bytes, SHA-256 of the deterministic current-version output bytes, and whether historical migration occurred.

`prepare_project_migration` remains the migration-on-copy preparation boundary. It parses through the existing version dispatch, serializes through `project_content_for_document`, hashes the candidate, reopens those exact candidate bytes through the current parser, serializes them again, and returns `PreparedProjectMigration` only when the reopened version is current and canonical bytes reproduce exactly. The prepared value is sealed; external crates receive immutable `document()`, `canonical_content()`, and `receipt()` views and cannot construct or mutate its validated state.

The receipt owns executable byte verification rather than requiring persistence adapters to duplicate SHA-256 comparison logic. `verify_input_reader` hashes an already-authorized reader with the repository-owned SHA-256 kernel and fails closed unless it equals `input_sha256`. `verify_output_reader` does the same for `output_sha256`. Neither method opens a pathname or claims filesystem authority; the caller must supply the exact native object it intends to validate.

Project Persistence keeps `read_project_file_with_identity` as the predecessor-authority primitive. It performs the existing bounded, no-follow/reparse-safe, before/opened/after stability checks and returns a sealed `ProjectFileReadSnapshot` with content plus native identity from the same opened file.

For migration replacement, Project Persistence has a receipt-aware replacement path layered on the existing journal/exchange owner. Linux/macOS use the existing atomic exchange; Windows uses the existing `ReplaceFileW` backup path. After replacement, but before the prepared journal is promoted to the durable `published` marker or rollback material is removed, the migration validator:

1. opens the displaced predecessor through the existing no-follow native reader;
2. requires that exact opened handle to retain the read-bound native identity;
3. applies `receipt.verify_input_reader` to that same handle;
4. opens the published candidate through the same native authority boundary;
5. requires the exact opened target handle to retain the staged candidate identity; and
6. applies `receipt.verify_output_reader` before publication is committed.

If either native identity or either digest check fails, the existing rollback path restores the displaced object and cleans the candidate/journal. A crash after native replacement but before those validations leaves the journal in `prepared`, whose recovery behavior is conservative rollback.

The recovery journal is now schema version 2 and carries an explicit validation mode. Ordinary saves use `identity_only`; migration publication embeds the exact `ProjectMigrationReceipt` in `migration` validation. Published migration recovery therefore reopens the buyer-visible candidate through its expected native identity and replays `verify_output_reader`; if the displaced known-good artifact still exists, it also reopens that exact object and replays `verify_input_reader` before deleting either rollback material or journal. Prepared migration recovery likewise verifies the predecessor digest before restoring it or discarding an uncommitted candidate. A version-1 identity-only journal is not silently upgraded: recovery fails closed and leaves its artifacts intact for explicit handling.

This closes the post-validation crash window without making content identity a signature or changing generic save semantics. Native identity remains the filesystem-object authority; the migration receipt remains the exact-byte authority. Cleanup is legal only when both are still true at recovery time.

The ordinary save path still uses the same shared replacement implementation with `identity_only` validation. This preserves existing save semantics while keeping the migration-specific content-CAS rule isolated to the migration contract instead of changing generic user-save concurrency policy implicitly.

Production load composes those owners through `project_load::load_project_document`. It first runs publication recovery, acquires one `ProjectFileReadSnapshot`, prepares those exact bytes, and does nothing to on-disk bytes when `receipt.migrated` is false. For historical input it creates a same-directory generated candidate through the existing crash-safe `publish_new_project_file` owner, preserves existing Unix project-data permission bits through no-follow file handles, and invokes `replace_existing_project_file_for_migration` with the original snapshot identity and receipt. A successful migration returns `prepared.document().clone()` rather than reparsing the pathname after publication.

This orchestration does not implement a second rename, journal, rollback, or hash engine. Candidate staging is delegated to the existing Project Persistence publisher and final replacement is delegated to the receipt-aware compare-and-swap primitive. The Tauri `load_project` command now calls this owner before restart source re-admission.

## RED / GREEN evidence

- RED `ef4e0a4e6f0809d611a50d51b30870edd899732f` required source/target versions plus exact input/output digests. GREEN `e833187ac50fe3e71aa51850a5266872ab6a7bb6` added `ProjectMigrationReceipt`; `74d5bcc3245056d5b62003e89b5a6deaa657dc47` proved current-version re-admission idempotency.
- RED `2c46d0c2ea98604ae7241f0390e8e9cfea4de6d7` required a self-validating canonical candidate. GREEN `a137fd9d2258b573df719de27a0043a8351a928f` added `PreparedProjectMigration` / `prepare_project_migration`; `04ab3cc33539c16568db73f41884cd618129bc78` exported it through the GUI-independent crate root.
- RED `5ff80277e24e82c7803c8910fe8b892f779230fd` required immutable accessor consumption. GREEN `fd2e4f2b5e781ad8cd0597038a728d3840584d1c` sealed the prepared value.
- RED `f1f374a34a6eae44f8c7f28f285c404cf1aa8fef` required bounded reads to retain the exact opened-file identity after a pathname replacement. GREEN `cc0755bfd830dc187bfdc18f2ee1d718ec060ce7` added `ProjectFileReadSnapshot` and `read_project_file_with_identity`.
- RED `eeb2b71a94c39c00c0dbf410b1ef0f428b7246c6` required the receipt itself to verify exact input bytes instead of leaving digest comparison to each adapter. GREEN `53ab33133550dbeaca8c7c404ba4b6bbfd2afd81` added fail-closed `verify_input_reader` using the existing SHA-256 owner.
- RED `26cf9e6586e127c6bcab3f500ba75b07f0d85d05` extended the same contract to the validated output bytes. GREEN `7b4c6e5e609f7074eabd2fca5cee5da4dfb08017` added `verify_output_reader` through the same private receipt-verification helper.
- RED `847c31da5203ecf625762322f630c4c8fb302378` added a native migration-publication regression. It modifies the already-read predecessor in place, proves native identity did not change, and requires migration publication to roll back because the exact input digest changed. It also requires the unchanged predecessor plus exact canonical candidate to commit successfully. The predecessor had no receipt-aware replacement API, so the contract could not compile.
- GREEN `a46be0d83531e49e9906d104a16197cb13d44c3b` factors the existing Linux/macOS and Windows replacement implementations through a post-replacement validator and adds `replace_existing_project_file_for_migration`. The migration validator reopens both displaced predecessor and published candidate through no-follow native handles, rechecks their expected native identities on those handles, and verifies exact receipt input/output digests before the existing success path can retire rollback material.
- RED `c406080919eeabb6df868fcfb20b01a29394208d` required the buyer path to publish a checked-in v2 fixture through the receipt-bound migration owner and required a current v3 file with incidental whitespace to remain byte-for-byte unchanged. The requested load owner did not exist at that head.
- GREEN lineage `d50b9e396f4feeeeef2873f5c779f71df6f6ca45` → `ee906cf08e210923f80bea94b40edb9e84818325` → `e610db4f782d0bb032d1a7390425cb54f97bb9b4` added the migrate-on-load application service, exercised it through the native integration fixture, and routed the production Tauri command through it. `28daa667ad72cb918a7f246458d13cbf62d952bc` fixed source formatting before hosted lint, `9a4554e8681a9f5d3bbb5521bc341d1c78f1bc17` repaired the old route-contract test so it checks the new identity-bearing owner rather than the removed compatibility call, and `bd318f91e882dbfa538e28e9ae0f6197b859769b` added Unix regression coverage proving migration preserves existing project-data permission bits.
- RED `927c4aa4c28bacacaaf8641594abd26ea282caf8` models the crash window after a durable published marker exists. It requires a version-2 migration journal with the receipt to clean exact candidate/predecessor artifacts, requires an in-place candidate byte mutation with unchanged native identity to preserve rollback evidence, and requires legacy version-1 identity-only published journals to fail closed instead of deleting the known-good predecessor.
- GREEN `44525806a1c69895d94704f578c64fd92e740691` versions the recovery journal, records `PublicationValidation::Migration { receipt }`, replays receipt verification during both published cleanup and prepared rollback decisions, and rejects version-1 identity-only journals. `bc892e34105d5098ad24344560d2365e1b57b4c4` moves the existing recovery-cleanup fixtures to the explicit version-2 `identity_only` schema without weakening their behavior.

Hosted exact-head CI/security/SBOM/SAST/native-build evidence is required separately; a source commit is not treated as hosted GREEN until those checks are terminal on the exact head.

## Rejected alternatives

A timestamp or random migration id was rejected because it makes receipts nondeterministic. Hashing parsed JSON rather than exact bytes was rejected because whitespace or byte-level changes would disappear from evidence. A second hashing implementation was rejected because SHA-256 already has one repository owner.

Recapturing identity from the target pathname immediately before replacement was rejected because a post-read pathname occupant is not necessarily the file that produced the migration input. Native identity alone was rejected because in-place writes can retain it. Comparing free-form digest strings inside the Tauri adapter was rejected because it duplicates receipt semantics and makes input/output error handling diverge.

Validating only the displaced predecessor was rejected because the published target is also buyer truth: a same-object post-replacement write could change candidate bytes while native identity remains stable. Both predecessor and candidate therefore use identity plus exact receipt digest.

Deleting rollback material immediately after the native exchange was rejected. Validation occurs while the displaced object still exists. A failure restores or retains it rather than turning a detected race into data loss.

Treating journal promotion as permanent proof that bytes can never change was rejected. The published marker records that validation completed at commit time; it does not freeze the target inode/file-index or displaced backup while the process is down. The receipt therefore travels with the version-2 migration journal and is replayed before crash recovery retires rollback material.

Accepting identity-only version-1 published journals as if they carried the new evidence was rejected. They cannot prove exact candidate/predecessor bytes, so recovery preserves them and fails closed instead of silently deleting the only known-good copy.

Writing a second migration-specific atomic-publication engine was rejected. The receipt-aware path composes the existing journal, exchange/`ReplaceFileW`, rollback, synchronization, and recovery machinery and changes only the post-replacement acceptance predicate.

Reusing `publish_new_project_file` directly on the selected historical project was rejected because that generic publisher snapshots whichever target occupies the pathname at publication time. The migrate-on-load owner instead uses it only to create the adjacent candidate; final authority comes from `replace_existing_project_file_for_migration` with the original identity-bearing read snapshot and receipt.

Reparsing the selected pathname after a successful migration was rejected because another process can replace that pathname after publication. The command returns the sealed prepared document that generated the committed candidate; restart source re-admission consumes that document's typed source reference separately.

## Security Notes

### Trust boundary

Project bytes and filesystem state are untrusted inputs to Project Persistence. A receipt proves deterministic byte identity only; it is not a signature or authenticity claim. Native identity proves local filesystem object continuity only; it is not content identity. Migration publication accepts only the conjunction of both forms of evidence.

Receipt verification accepts an already-authorized `Read` object and never opens paths. The Tauri persistence layer owns path/native-handle authority and uses its existing no-follow/reparse-safe open contract. The exact opened handle used for digest verification is also checked against the expected native identity before its bytes are consumed.

The migrate-on-load layer never treats its generated staging pathname as predecessor authority. Staging goes through the existing safe publisher, final commit goes through the receipt-aware replacement, and publication failure returns an error without substituting a different document. On Unix only read/write permission bits from the selected project data file are copied to the candidate; executable and special bits are not introduced.

The adjacent journal is crash-recovery evidence, not an authentication artifact. A local actor with write authority over the project directory is outside the integrity guarantee of an unsigned local file. Within the crash-consistency boundary, however, migration recovery never interprets native identity alone as proof of exact bytes and never discards a still-present known-good predecessor after a receipt mismatch.

### Safe failure and crash boundary

Malformed or unsupported projects fail before a prepared migration exists. Candidate parser/serializer disagreement fails before staging. After atomic replacement, native-identity or receipt-digest mismatch routes to the existing rollback path and returns the bounded project-publication error.

A process interruption before the receipt-aware validator finishes leaves the durable journal in `prepared`; recovery verifies the exact predecessor before restoring it. Promotion to `published` records that validation succeeded at commit time, but restart recovery still replays candidate and available predecessor receipt checks because an in-place write can preserve native identity while BandScope is down. Cleanup is therefore an evidence-consuming operation, not a blind consequence of journal phase.

A current v3 project is parsed through the same prepared boundary but is not rewritten merely to canonicalize insignificant byte representation. This avoids turning ordinary open into an unexpected write for already-current projects.

### Privacy

Receipts contain versions and SHA-256 values only. `ProjectFileReadSnapshot` carries bounded content and local native identity in memory but no path. No username, hostname, audio bytes, playback URL, account id, or secret is added to migration evidence. Raw project JSON remains publication material, not routine diagnostic payload.

### Test points

`apps/desktop/core/tests/project_migration_receipt_input_binding.rs` verifies exact input and output bytes and rejects parse-equivalent byte changes.

`apps/desktop/src-tauri/tests/project_persistence_read_identity.rs` proves the bounded read retains the original opened-file identity after the selected pathname is replaced.

`apps/desktop/src-tauri/tests/project_persistence_migration_content_cas.rs` proves that an in-place predecessor byte change with unchanged native identity cannot commit migration publication, an exact predecessor plus exact candidate can commit, a checked-in historical project is migrated through the load owner, a current v3 project is not spuriously rewritten, and Unix migration preserves existing project-data permission bits.

`apps/desktop/src-tauri/tests/project_persistence_published_recovery_content_cas.rs` proves that published recovery cleans only exact receipt-bound migration artifacts, preserves the known-good predecessor and journal after an in-place candidate mutation, and rejects identity-only version-1 published journals.

The `project_persistence.rs` source-route regression verifies that the Tauri command uses `project_load::load_project_document` and that the load owner derives authority from `read_project_file_with_identity` rather than the obsolete compatibility string route.

## Remaining risk and follow-up

Source-level migrate-on-open wiring and receipt-bound crash-window recovery are now present, but exact-head hosted CI/native-build/SBOM/SAST/security and qualifying independent review still gate any GREEN or merge claim. Packaged fault injection must still prove the complete load-time migration path under interruption, disk-full, permission failure, and power-loss conditions on supported Windows and macOS targets.

Known-good retention beyond the immediate rollback window, application downgrade behavior, bounded autosave, global startup recovery discovery, accessible Restore / Compare / Discard UX, and packaged Windows/macOS cancellation evidence remain open under #962. Resource Admission owner #866 remains a separate protected prerequisite for source-audio re-admission; this Project Persistence slice does not copy or bypass it.

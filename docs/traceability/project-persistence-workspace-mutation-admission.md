# Project Persistence Workspace Mutation Admission

## Problem

BandScope persists local rehearsal mutations as full `RehearsalSong` snapshots. Durable-before-renderer acknowledgement removed the earlier optimistic-state failure window, and `SectionRoadmap` added an interaction-local single-flight guard for chord edits. That did not protect other mutation surfaces. A practice-progress update, score metadata mutation, or another full-song writer could still enter `saveProject(..., projectId, true)` while an earlier workspace save for the same project was unresolved. Because the second payload may have been derived from the same pre-commit renderer snapshot, allowing both native writes would permit a later stale snapshot to replace an accepted edit.

The renderer-process guard also did not cross a WebView/process boundary. Two desktop processes could therefore enter the same native `project.bscope` publication state machine at the same time. One writer can already have made its new target visible while it is still waiting for durability acknowledgement; without native admission, another process can replace those bytes before the first writer's transaction has finished.

Process-external admission alone is still insufficient. A second process can derive a full snapshot from durable revision A, wait until another writer commits revision B and releases the native admission lease, and then submit the old A-derived snapshot. Serialization prevents overlap but cannot tell whether the later payload was derived from the current aggregate.

A restart introduced one more authority gap. Renderer revision receipts are intentionally process-local. After reopening a project, `load_project` can restore a native `sourceReference`, but the renderer no longer possesses the SHA-256 receipt from the last workspace save. Reusing the hash of an OS-file-selected import would be unsafe because that selected file is not necessarily the app-owned workspace target. Without an explicit native bind, the next workspace mutation either fails because an existing target has no expected revision or is tempted to invent authority from the wrong file.

## Constraints

- #970/#962 remains the canonical Project Persistence owner.
- The renderer may submit only a BandScope-minted project id plus workspace intent; it does not gain app-local path authority.
- Manual Save / Save As is a different product transaction and does not define the app-local aggregate revision contract.
- Independent app-owned project roots may persist concurrently.
- A stale full-song snapshot must fail closed rather than be queued when no semantic rebase contract exists.
- Native writer admission must be process-owned and released by the OS after abnormal process termination; a pid file or best-effort cleanup is not sufficient authority.
- Revision authority must be checked after recovery and while the same native write-admission lease is still held. A renderer-only comparison would leave a TOCTOU window before publication.
- Revision material is an opaque path-free content identity receipt, not a project-domain field or ontology label.
- Restart/reopen binding may use only the exact app-owned workspace target resolved from the native project id. A selected export/import path is never revision authority.
- An absent renderer receipt may bind to an existing workspace only when the canonical candidate bytes exactly equal the current durable workspace bytes. Equality binding must not stage or replace the target.
- Equality binding does not relax ordinary workspace content admission: empty snapshots and snapshots above the 5 MiB bound remain rejected before revision binding.
- The native warning-gated Project Persistence harness remains the single compile authority for crate-private production code. A new integration case must join that harness rather than recompiling the owner as an independent test crate and thereby manufacturing dead-code warnings.

## Renderer RED → fix evidence

`5f213eb19f76c18d312039da7b97dc08c1f41f65` adds `analysis.workspace-single-flight.test.ts`. With the pre-fix bridge, the second same-project workspace save crosses the Tauri invoke boundary instead of rejecting. No hosted RED is claimed because the repair followed before a terminal workflow verdict; this commit is source-level RED evidence.

`b9ff1421d31ea5186cdc4d5a7351cb24846d8e5c` adds per-project workspace admission in `apps/desktop/src/lib/analysis.ts`. The bridge acquires the project id before the native workspace invoke, rejects another unresolved workspace snapshot for that same id, and releases authority in `finally` after either success or failure. Different project ids remain independent.

`389004fe5e81aad0e5173f878b1329d7afbbd10d` extends the regression to cover independent projects, lease release after native failure, and the requirement that workspace persistence carry an app-owned project id.

## Native cross-process RED → fix evidence

`33f62fa4c7cecb75dcdc56dd2ccdbf309af44af1` adds a process-boundary regression. A child process publishes `project.bscope` and then blocks at the deterministic parent-durability boundary while the target is already visible. The parent attempts a second production publication against that exact target. Before native admission, that second writer is able to replace the first writer's visible project bytes while the first transaction is still unresolved.

`d7ff75de4fa447d4c90119e4eb8c4f7c1341c3c0` wires the case into the single-compile Project Persistence native harness. Exact hosted macOS and Windows owner lanes reached terminal RED for the overlapping-writer contract.

`b9381c4a6c2354a5905f94c3a108ab76cd86ddf9` moves overlapping-writer admission into the native publication owner. Linux/macOS acquire a non-blocking exclusive `flock` on the already-authorized target parent directory descriptor; app-owned project aggregates have distinct project roots, so this serializes one aggregate's publication state machine without introducing a mutable sidecar lock file. Windows uses a process-external named mutex derived from the canonical native target identity string; `WAIT_ABANDONED` is accepted so the OS, not a pid heuristic, recovers authority after a crashed writer. Busy admission fails before staging or replacement with `Project update is already being saved.`.

`5c5c022653f4ecd2675ab9dd1fc5734d8eac2aad` hardens the regression itself: it records the overlap result, terminates and reaps the child writer, and only then asserts the expected busy result. A deliberate pre-fix failure therefore cannot strand the child process and turn a deterministic RED into a hung CI job.

`27ed4b3e4b2a3f399895e4affdcb2a4fe999c545` preserves the established fail-closed staging error classification after native admission was introduced. Its exact macOS and Windows Project Persistence owner lanes were terminal GREEN.

## Durable revision/content-identity RED → fix evidence

`cfcaf8af09d37e55efdbecb569d820d157b03d32` adds the first revision regression before the production revision API exists. It requires three invariants: an absent target accepts only an absent predecessor revision, an existing target accepts only its current predecessor revision, and a stale predecessor revision cannot replace the current bytes. The repair followed before a terminal workflow verdict, so this commit is source-level RED evidence rather than a claimed hosted RED.

`bcdd59cd84f4e588cb96162028d21a750490e78d` adds the native aggregate CAS primitive. `publish_workspace_project_file_with_expected_content` acquires the process-external Project Persistence admission lease first, performs publication recovery while that lease is held, opens the current `project.bscope` through the no-follow/reparse-safe Project Persistence opener, bounds it to the 5 MiB project limit, checks descriptor/path identity around SHA-256 calculation, compares the current digest with the caller's expected digest, and only then enters the existing staging/replacement state machine. The successful publication returns the SHA-256 of the newly accepted canonical project bytes as the next revision receipt.

For an ordinary mutation, an existing target requires its current receipt and an absent target requires no predecessor receipt. Malformed revision strings fail as `Invalid project revision.` and stale/presence-mismatched receipts fail as `Project changed since it was opened.`. Last-write-wins and automatic stale-snapshot retry are not fallback paths.

`bd1e85825700f4d1608405631b3ca67301691ee2` carries the last native revision receipt inside the renderer persistence bridge, keyed only by the BandScope-minted project id. A later workspace save includes `expectedContentSha256`; the bridge updates its receipt only after native success. A malformed native receipt is rejected rather than allowing React state to treat the mutation as durable.

`d025976799a1ad6829d06348ef321c6810de2594` extends the renderer contract regression so the first workspace write carries no predecessor receipt, the next write carries the exact prior native receipt, and malformed native receipts fail closed.

`c17230aefcc02f3a7cc8eb21768819c100f6dba5` wires the contract into the Tauri command. Workspace saves invoke the native recovery + expected-revision validation + publication transaction and return the new SHA-256 receipt. Manual Save / Save As remains outside this app-owned CAS contract and rejects an unexpected workspace revision argument.

`b0962e323be2c1146b3e7cac2c451a36b1c3055b` fixes the pre-existing renderer single-flight fixtures so successful workspace persistence returns valid native revision receipts instead of `undefined`; overlap and failure assertions are unchanged.

### Exact-head warning-gate RCA

The first exact `b0962e...` macOS owner run `35483630066` / job `106005815303` failed during the native warning-gated test compile, not during a CAS assertion. `project_persistence.rs` is included by the canonical `tests/project_persistence.rs` single-compile harness with `deny(warnings)`. The new revision regression had initially been added as a separate `project_persistence_workspace_revision.rs` integration crate, so the canonical harness compiled the newly added CAS constants/functions without any case in that crate referencing them and correctly promoted the resulting `dead_code` warnings to errors. This is an ownership/harness defect; suppressing the warnings or weakening the gate was rejected.

`3518976fbb1f0c4bf5b6afb5ee2de9197e6419ed` converts the revision regression to `project_persistence_workspace_revision.case`; `6a27c5bfe7532954d8183f584b4f9211ef663316` registers that case in the canonical warning-gated Project Persistence harness; `baee09125cd73a52fdd8d8101e08289dcf4c505b` removes the duplicate standalone integration crate. The production owner is therefore compiled once and the CAS production symbols are exercised from the same warning-gated crate as the rest of Project Persistence.

## Restart/reopen revision binding RED → fix evidence

`1109799c69a2f75234f9ae6bd4e793191638be17` adds a native restart-binding regression to the canonical `project_persistence_workspace_revision.case`. It creates an already durable workspace, deliberately supplies no renderer receipt, and requires a byte-identical canonical candidate to receive the existing workspace revision without leaving a staging artifact. The pre-fix production path rejects `None + existing target`, so both exact owner lanes reached terminal RED: macOS run `35485742398` / job `106011658681` and Windows Server 2025 run `35485742321` / job `106011658268` failed in their native regression step.

`965d8cb9f9c8194bfd249c039803831bc8c7b732` is the minimal native repair. Under the same process-external lease, recovery runs first and the current app-owned workspace is opened and hashed through the existing no-follow/reparse-safe bounded identity path. If the caller has no expected receipt, an existing target is accepted only when its digest is exactly the digest of the canonical candidate. That equality case returns the current receipt immediately and does not stage or replace bytes. Different existing bytes still return `Project changed since it was opened.`; `Some(revision) + absent target` remains a conflict.

`295ab97b968328b9b72d6c64cb386631b918a492` adds the renderer reopen contract regression. A loaded document carrying a native `sourceReference` must perform a second native workspace call with a source-free canonical payload and the BandScope-minted project id before `loadProjectDocument()` resolves. A native workspace conflict rejects the reopen. A portable project with no app-owned source performs no workspace bind.

`c82c560bbf38e17d7e0d2970eb125211c33e7eef` implements that renderer boundary. The bridge discards any process-local receipt for the reopened project id, rebuilds the source-free canonical payload, and invokes the workspace persistence path. Native Project Persistence independently resolves the exact app-owned workspace target, so the OS-file-selected import path never becomes CAS authority. The native receipt returned by the equality bind is retained for subsequent mutations before the reopened document reaches renderer state.

`10a5076113fea4e83d0e96bfd426c63572d20cec`, `95726d517fbb8867de814abca343d158d825d115`, and `186e21871e2330c09bfc045a6ce1ce8e19866f33` repair CI ownership by adding `projectDocumentBridge.test.ts` to both native owner workflow trigger sets and to the workflow-policy contract. Native owner lanes still execute Rust persistence regressions; repository CI remains the execution authority for the TypeScript bridge test.

`456400b77ea2e9ef7f91d3a4c49c75e32fb7f773` adds an edge regression for the equality shortcut itself: an existing empty file and an empty candidate must not become accepted merely because their SHA-256 digests match. `c2a3d46881e0b60a048d77b99fe350ed53d22f48` restores the ordinary workspace content admission in front of digest binding, so empty snapshots and snapshots above 5 MiB fail before recovery/binding and the equality path cannot bypass the established publication bounds.

## Decision

A same-project overlapping workspace mutation is rejected rather than queued. Queuing was rejected because the bridge receives complete snapshots, not semantic deltas; a queued snapshot can already be stale and replaying it after the first commit would preserve the corruption window. Last-write-wins was rejected for the same reason.

The native owner adds a process-external admission boundary around publication and a content-identity CAS inside that boundary. The admission lifetime spans recovery for the workspace command, expected-revision validation, staging, target publication/replacement, temporary alias retirement, parent durability acknowledgement, and Windows target flush. This prevents another cooperating BandScope process from entering the same aggregate transaction while the first writer is unresolved and rejects a later stale snapshot after the prior writer has finished.

A SHA-256 receipt was chosen instead of a renderer-authored monotonic integer because Project Persistence already has canonical serialized bytes and a shared streaming SHA-256 implementation, while introducing a sidecar revision counter would add another crash-consistency object that must itself be recovered atomically. The digest is used as content identity, not as authentication or secret material.

Restart authority is rebound by proving canonical candidate equality against the exact native workspace, not by trusting the selected file. This makes equality binding an idempotent read/receipt operation: it returns without publication when bytes already match. A different workspace revision is a conflict, not an invitation to overwrite, retry, or silently adopt the selected file.

## Security Notes

### Attack surface

Renderer mutation payloads, project identifiers, and opaque revision receipts cross the Tauri boundary into app-owned `project.bscope` persistence. The concurrency risk is integrity loss rather than confidentiality loss: two valid payloads can be individually well-formed while their ordering silently discards buyer work. Reopen adds an authority-confusion risk because the user-selected project path and the app-owned workspace are distinct storage contracts.

### Trust boundary

Native Project Persistence remains the durable storage authority. The TypeScript bridge owns only one-renderer admission plus retention of the last native content receipt. Native publication owns process-external writer admission, recovery, current-file identity validation, digest comparison, and replacement. Neither layer accepts a renderer filesystem path, and neither replaces native project-id validation, target identity, crash-safe publication, recovery, or migration checks.

On reopen, `load_project` may read a manual/exported file, but revision binding resolves the workspace again from the native retained project identity. The selected path and its raw content hash never authorize workspace replacement.

### Mitigations

Renderer admission is keyed by the BandScope-minted project id and released in `finally`. Native admission is acquired before workspace recovery and is held by an OS resource rather than a mutable pid marker. Linux/macOS use an already-authorized directory descriptor and Windows derives its mutex name from the native canonical target path; the mutex/lock name is never supplied by the WebView. A killed writer cannot leave a logically owned lock that requires guesswork to clear.

The current durable target is opened through the Project Persistence no-follow/reparse-safe opener and bounded before hashing. Descriptor identity is checked against the path before and after digest calculation. A stale or presence-mismatched receipt fails before staging or replacement. Revision text is validated as lowercase 64-hex SHA-256 before comparison. An absent receipt with an existing target can only bind when the target digest equals the canonical candidate digest, and that path returns without staging or replacement. Empty and over-limit candidates are rejected before equality comparison.

The Unix parent-directory lock is intentionally scoped to the containing directory. App-owned BandScope aggregates live in separate project roots, so their workspace transactions remain independent. Manual exports into the same arbitrary user directory can serialize briefly on Unix; this is a conservative integrity trade-off and does not make manual exports participants in the app-owned revision contract.

### Safe failure and logging/privacy

Rejection exposes no filesystem path, project content, score data, revision value, or secret-shaped value. A rejected overlap, stale revision, or reopen conflict does not stage or replace buyer project bytes. Native failure releases process ownership automatically, so a later user action can retry after reloading/reconciling current durable state rather than inheriting a stale software-owned lock.

### Test points

- `analysis.workspace-single-flight.test.ts` covers same-renderer overlap rejection, different-project concurrency, release after native failure, and missing workspace project-id rejection.
- `projectDocumentSaveAuthority.test.ts` covers native revision-receipt retention/forwarding and malformed receipt rejection at the renderer boundary.
- `projectDocumentBridge.test.ts` covers app-owned reopen binding before renderer acceptance, conflict rejection, and the portable-document no-bind boundary.
- `project_persistence_native_write_admission.case` uses a real child process, pauses it only after the first target is published, proves a concurrent production write fails before replacement, terminates the first writer, and proves a later production write succeeds after OS ownership is released.
- `project_persistence_workspace_revision.case` is part of the canonical warning-gated native harness and covers first publication, current-revision replacement, stale-revision rejection, restart equality binding without a stage, equality-path content admission, and target/revision mismatch without changing accepted bytes.
- macOS and Windows Project Persistence native workflows are the exact-head execution authority for native admission/CAS. Repository CI is the execution authority for the TypeScript bridge regressions.

## Remaining risk

The restart/reopen binding closes the authority gap only when the loaded project carries a valid native `sourceReference` and the canonical reopened payload is identical to the exact app-owned workspace, or when that workspace does not yet exist and can be created as the first app-owned snapshot. A differing workspace fails closed before renderer acceptance. This is integrity-safe but still not release-quality interaction design: the user currently receives a generic load/save failure rather than a conflict surface explaining the durable and selected states.

The next Project Persistence slice is buyer-visible revision conflict handling. It must not automatically retry, replay, or semantically merge a stale full snapshot. A bounded Reload / Compare / Recover / Discard or equivalent contract must define which durable state wins, what can be inspected without exposing local paths, and how keyboard/screen-reader users resolve the conflict.

Score Storage restart reconciliation remains separate: a PDF can still become durable before attachment metadata commits, and that state must remain an explicit recovery candidate rather than being silently adopted or deleted. Accessible conflict/recovery UX and packaged process-kill, disk-full, permission, cancellation, and power-loss evidence remain product acceptance work.

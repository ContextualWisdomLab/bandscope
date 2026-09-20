# Project Persistence Workspace Mutation Admission

## Problem

BandScope persists local rehearsal mutations as full `RehearsalSong` snapshots. Durable-before-renderer acknowledgement removed the earlier optimistic-state failure window, and `SectionRoadmap` added an interaction-local single-flight guard for chord edits. That did not protect other mutation surfaces. A practice-progress update, score metadata mutation, or another full-song writer could still enter `saveProject(..., projectId, true)` while an earlier workspace save for the same project was unresolved. Because the second payload may have been derived from the same pre-commit renderer snapshot, allowing both native writes would permit a later stale snapshot to replace an accepted edit.

The renderer-process guard also did not cross a WebView/process boundary. Two desktop processes could therefore enter the same native `project.bscope` publication state machine at the same time. One writer can already have made its new target visible while it is still waiting for durability acknowledgement; without native admission, another process can replace those bytes before the first writer's transaction has finished.

## Constraints

- #970/#962 remains the canonical Project Persistence owner.
- The renderer may submit only a BandScope-minted project id plus workspace intent; it does not gain app-local path authority.
- Manual Save / Save As is a different product transaction and does not define the app-local aggregate revision contract.
- Independent app-owned project roots may persist concurrently.
- A stale full-song snapshot must fail closed rather than be queued when no semantic rebase contract exists.
- Native writer admission must be process-owned and released by the OS after abnormal process termination; a pid file or best-effort cleanup is not sufficient authority.
- Native overlap admission is not a substitute for monotonic revision/CAS. A process that starts only after the earlier writer has completely released admission can still hold an old snapshot unless a revision token rejects it.

## Renderer RED → fix evidence

`5f213eb19f76c18d312039da7b97dc08c1f41f65` adds `analysis.workspace-single-flight.test.ts`. With the pre-fix bridge, the second same-project workspace save crosses the Tauri invoke boundary instead of rejecting. No hosted RED is claimed because the repair followed before a terminal workflow verdict; this commit is source-level RED evidence.

`b9ff1421d31ea5186cdc4d5a7351cb24846d8e5c` adds per-project workspace admission in `apps/desktop/src/lib/analysis.ts`. The bridge acquires the project id before the native workspace invoke, rejects another unresolved workspace snapshot for that same id, and releases authority in `finally` after either success or failure. Different project ids remain independent.

`389004fe5e81aad0e5173f878b1329d7afbbd10d` extends the regression to cover independent projects, lease release after native failure, and the requirement that workspace persistence carry an app-owned project id.

## Native cross-process RED → fix evidence

`33f62fa4c7cecb75dcdc56dd2ccdbf309af44af1` adds a process-boundary regression. A child process publishes `project.bscope` and then blocks at the deterministic parent-durability boundary while the target is already visible. The parent attempts a second production publication against the same target. Before native admission, that second writer is able to replace the first writer's visible project bytes while the first transaction is still unresolved.

`d7ff75de4fa447d4c90119e4eb8c4f7c1341c3c0` wires the case into the single-compile Project Persistence native harness. This head is treated as source-level RED unless a hosted run reaches a terminal failing verdict; superseded or still-running workflow evidence is not promoted to RED.

`b9381c4a6c2354a5905f94c3a108ab76cd86ddf9` moves overlapping-writer admission into the native publication owner. Linux/macOS acquire a non-blocking exclusive `flock` on the already-authorized target parent directory descriptor; app-owned project aggregates have distinct project roots, so this serializes one aggregate's publication state machine without introducing a mutable sidecar lock file. Windows uses a process-external named mutex derived from the canonical native target identity string; `WAIT_ABANDONED` is accepted so the OS, not a pid heuristic, recovers authority after a crashed writer. Busy admission fails before staging or replacement with `Project update is already being saved.`.

`5c5c022653f4ecd2675ab9dd1fc5734d8eac2aad` hardens the regression itself: it records the overlap result, terminates and reaps the child writer, and only then asserts the expected busy result. A deliberate pre-fix failure therefore cannot strand the child process and turn a deterministic RED into a hung CI job.

## Decision

A same-project overlapping workspace mutation is rejected rather than queued. Queuing was rejected because the bridge receives complete snapshots, not semantic deltas; a queued snapshot can already be stale and replaying it after the first commit would preserve the corruption window. Last-write-wins was rejected for the same reason.

The native owner now adds a second, process-external admission boundary around publication. The admission lifetime spans staging, target publication/replacement, temporary alias retirement, parent durability acknowledgement, and Windows target flush. This prevents another cooperating BandScope process from entering the same publication transaction while the first writer is unresolved and makes abnormal writer death recoverable through OS handle/lock ownership.

A general optimistic-concurrency token remains required. Native admission answers “is another writer executing now?”; it does not answer “was this snapshot derived from the current durable aggregate revision?”. That distinction is preserved rather than calling the lock a CAS protocol.

## Security Notes

### Attack surface

Renderer mutation payloads and project identifiers cross the Tauri boundary into app-owned `project.bscope` persistence. The concurrency risk is integrity loss rather than confidentiality loss: two valid payloads can be individually well-formed while their ordering silently discards buyer work.

### Trust boundary

Native Project Persistence remains the durable storage authority. The TypeScript bridge owns only admission of renderer-originated workspace save attempts for one renderer process. Native publication owns process-external writer admission. Neither layer accepts a renderer filesystem path, and neither replaces native project-id validation, target identity, crash-safe publication, recovery, or migration checks.

### Mitigations

Renderer admission is keyed by the BandScope-minted project id and released in `finally`. Native admission is acquired before publication work begins and is held by an OS resource rather than a mutable pid marker. Linux/macOS use an already-authorized directory descriptor and Windows derives its mutex name from the native canonical target path; the mutex/lock name is never supplied by the WebView. A killed writer cannot leave a logically “owned” lock that requires guesswork to clear.

The Unix parent-directory lock is intentionally scoped to the containing directory. App-owned BandScope aggregates live in separate project roots, so their workspace transactions remain independent. Manual exports into the same arbitrary user directory can serialize briefly on Unix; this is a conservative integrity trade-off, not evidence of a general project revision protocol.

### Safe failure and logging/privacy

Rejection exposes no filesystem path, project content, score data, revision material, or secret-shaped value. A rejected overlap does not stage or replace buyer project bytes. Native failure releases process ownership automatically, so a later user action can retry rather than inheriting a stale software-owned lock.

### Test points

- `analysis.workspace-single-flight.test.ts` covers same-renderer overlap rejection, different-project concurrency, release after native failure, and missing workspace project-id rejection.
- `project_persistence_native_write_admission.case` uses a real child process, pauses it only after the first target is published, proves a concurrent production write fails before replacement, terminates the first writer, and proves a later production write succeeds after OS ownership is released.
- macOS and Windows Project Persistence native workflows are the exact-head execution authority for the process-boundary case. Repository CI remains the authority for the TypeScript regression.

## Remaining risk

This closes simultaneously overlapping publication by cooperating current-contract BandScope processes; it is not monotonic revision/CAS. A second process can open or derive an old snapshot, wait until the current writer has fully completed, and then submit that stale snapshot later. The next Project Persistence vertical must bind each app-local mutation to an expected durable revision/content identity at the native aggregate boundary and reject a mismatch before replacement. Conflict handling must be explicit; automatic retry of a full stale snapshot is unsafe without a semantic merge/rebase contract.

The workspace command currently performs recovery immediately before publication; the admission added here protects the publication state machine itself. A later revision/CAS vertical should make recovery, expected-revision validation, and replacement one native aggregate transaction rather than broadening renderer locks.

Score Storage restart reconciliation remains separate: a PDF can still become durable before attachment metadata commits, and that state must remain an explicit recovery candidate rather than being silently adopted or deleted. Accessible Restore / Compare / Discard and packaged fault evidence remain product acceptance work, not consequences inferred from these native tests.

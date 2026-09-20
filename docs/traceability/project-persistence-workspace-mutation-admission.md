# Project Persistence Workspace Mutation Admission

## Problem

BandScope persists local rehearsal mutations as full `RehearsalSong` snapshots. Durable-before-renderer acknowledgement removed the earlier optimistic-state failure window, and `SectionRoadmap` added an interaction-local single-flight guard for chord edits. That did not protect other mutation surfaces. A practice-progress update, score metadata mutation, or another full-song writer could still enter `saveProject(..., projectId, true)` while an earlier workspace save for the same project was unresolved. Because the second payload may have been derived from the same pre-commit renderer snapshot, allowing both native writes would permit a later stale snapshot to replace an accepted edit.

## Constraints

- #970/#962 remains the canonical Project Persistence owner.
- The renderer may submit only a BandScope-minted project id plus workspace intent; it does not gain app-local path authority.
- Manual Save / Save As is a different product transaction and is not serialized by this workspace admission guard.
- Independent project aggregates may persist concurrently.
- This slice must fail closed rather than queue a stale full-song snapshot that cannot be safely rebased.
- This is renderer-process admission. It is not evidence for cross-WebView/process compare-and-swap, two-window conflict resolution, or a monotonic project revision protocol.

## RED → fix evidence

`5f213eb19f76c18d312039da7b97dc08c1f41f65` adds `analysis.workspace-single-flight.test.ts`. With the pre-fix bridge, the second same-project workspace save crosses the Tauri invoke boundary instead of rejecting. No hosted RED is claimed because the repair followed before a terminal workflow verdict; this commit is source-level RED evidence.

`b9ff1421d31ea5186cdc4d5a7351cb24846d8e5c` adds per-project workspace admission in `apps/desktop/src/lib/analysis.ts`. The bridge acquires the project id before the native workspace invoke, rejects another unresolved workspace snapshot for that same id, and releases authority in `finally` after either success or failure. Different project ids remain independent.

`389004fe5e81aad0e5173f878b1329d7afbbd10d` extends the regression to cover independent projects, lease release after native failure, and the requirement that workspace persistence carry an app-owned project id.

## Decision

A same-project overlapping workspace mutation is rejected with `Project update is already being saved.` rather than queued. Queuing was rejected because the bridge receives complete snapshots, not semantic deltas; a queued snapshot can already be stale and replaying it after the first commit would preserve the corruption window. Last-write-wins was rejected for the same reason. A general optimistic concurrency token is the intended broader contract, but adding one requires a versioned project revision across native persistence, reopen, recovery and every mutation caller and is therefore a subsequent #962 vertical rather than an implicit renderer convention.

## Security Notes

### Attack surface

Renderer mutation payloads and project identifiers cross the Tauri boundary into app-owned `project.bscope` persistence. The concurrency risk is integrity loss rather than confidentiality loss: two valid payloads can be individually well-formed while their ordering silently discards buyer work.

### Trust boundary

Native Project Persistence remains the durable storage authority. The TypeScript bridge owns only admission of renderer-originated workspace save attempts for one renderer process. It never selects filesystem paths and does not replace native project-id validation, crash-safe publication, target identity or recovery logic.

### Mitigations

Workspace admission is keyed by the already-minted project id, acquired before invoke, and released in `finally`. Same-project overlap fails closed; separate project aggregates can proceed concurrently. Manual Save is not folded into this lock because it has a separate user-selected destination contract.

### Safe failure and logging/privacy

Rejection exposes no path, project content, score data or secret-shaped value. A rejected stale snapshot does not cross the native persistence boundary. Native failure releases the admission entry so a later user action can retry instead of leaving the project permanently locked in renderer memory.

### Test points

`analysis.workspace-single-flight.test.ts` covers same-project overlap rejection, different-project concurrency, release after native failure, and missing workspace project-id rejection. Exact-head repository CI remains the execution authority for this TypeScript regression; macOS/Windows Project Persistence native workflows continue to prove the underlying platform persistence path.

## Remaining risk

The guard is deliberately narrower than a project revision/CAS contract. Two WebViews or processes do not share this JavaScript set, and a caller rejected during another save is not automatically rebased or retried. The next Project Persistence vertical should put a monotonic revision or equivalent compare-and-swap/admission token at the native aggregate boundary and define explicit conflict/retry UX. Score Storage restart reconciliation remains separate: a PDF can still become durable before attachment metadata commits, and that state must remain an explicit recovery candidate rather than being silently adopted or deleted.

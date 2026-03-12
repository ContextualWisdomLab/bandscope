# Issue 32 Analysis Orchestration Implementation Plan

**Goal:** Add a secure local analysis job orchestration slice that lets the desktop app start a typed job, poll status, and receive a rehearsal-song result through Tauri IPC.

**Architecture:** React submits a validated request to narrow Tauri commands, Rust tracks in-memory job state and launches the Python engine as an allowlisted subprocess, and Python validates stdin JSON before returning a structured status/result envelope. The first implementation uses a demo source so the orchestration path is real without waiting for file intake.

**Tech Stack:** React 19, Tauri/Rust, TypeScript shared contracts, Python 3.14, `uv`, Vitest, pytest

---

### Task 1: Add shared analysis job contracts

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/shared-types/test/index.test.ts`

**Step 1: Write the failing test**

Add tests covering:
- valid `AnalysisJobRequest`
- invalid request rejection
- valid `AnalysisJobStatus` envelope with rehearsal-song result

**Step 2: Run test to verify it fails**

Run: `npm test --workspace @bandscope/shared-types`
Expected: FAIL because analysis-job types/helpers do not exist yet.

**Step 3: Write minimal implementation**

Add:
- `AnalysisSourceKind`, `AnalysisJobState`, `AnalysisJobErrorCode`
- `AnalysisJobRequest`, `AnalysisJobError`, `AnalysisJobStatus`
- helper functions such as `isAnalysisJobRequest`, `parseAnalysisJobRequest`, `isAnalysisJobStatus`

**Step 4: Run test to verify it passes**

Run: `npm test --workspace @bandscope/shared-types`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared-types/src/index.ts packages/shared-types/test/index.test.ts
git commit -m "feat: add analysis job contracts"
```

### Task 2: Add Python CLI orchestration entrypoint

**Files:**
- Create: `services/analysis-engine/src/bandscope_analysis/cli.py`
- Modify: `services/analysis-engine/src/bandscope_analysis/api.py`
- Create: `services/analysis-engine/tests/test_cli.py`

**Step 1: Write the failing test**

Add pytest cases for:
- valid stdin request returns `succeeded` response with demo rehearsal song
- invalid stdin request returns typed `failed` response with `invalid_request`

**Step 2: Run test to verify it fails**

Run: `cd services/analysis-engine && uv run pytest tests/test_cli.py -q`
Expected: FAIL because CLI entrypoint does not exist.

**Step 3: Write minimal implementation**

Implement a CLI that:
- reads JSON from stdin
- validates request shape
- returns a typed JSON job-status envelope
- uses `createDemoRehearsalSong()`-compatible payload shape via Python-side JSON construction

**Step 4: Run test to verify it passes**

Run: `cd services/analysis-engine && uv run pytest tests/test_cli.py -q`
Expected: PASS.

**Step 5: Commit**

```bash
git add services/analysis-engine/src/bandscope_analysis/api.py services/analysis-engine/src/bandscope_analysis/cli.py services/analysis-engine/tests/test_cli.py
git commit -m "feat: add analysis engine job cli"
```

### Task 3: Add Tauri orchestration commands and job store

**Files:**
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`

**Step 1: Write the failing test**

Add a frontend-driven test expectation first in Task 4 that depends on these commands.

**Step 2: Run test to verify it fails**

Run: `npm test --workspace @bandscope/desktop`
Expected: FAIL because the invoke bridge and commands do not exist.

**Step 3: Write minimal implementation**

Implement:
- `start_analysis_job` command
- `get_analysis_job_status` command
- in-memory `HashMap` job store guarded by `Mutex`
- subprocess launch of Python CLI with argument arrays only
- safe error mapping

**Step 4: Run test to verify it passes**

Run: `npm test --workspace @bandscope/desktop`
Expected: PASS once Task 4 bridge/UI lands.

**Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/main.rs apps/desktop/src-tauri/Cargo.toml
git commit -m "feat: add tauri analysis job commands"
```

### Task 4: Wire desktop bridge and polling UI

**Files:**
- Create: `apps/desktop/src/lib/analysis.ts`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.test.tsx`

**Step 1: Write the failing test**

Add a React test that:
- clicks a `Start analysis` button
- sees `queued/running` status
- eventually renders the rehearsal-song result from a mocked Tauri response

**Step 2: Run test to verify it fails**

Run: `npm test --workspace @bandscope/desktop`
Expected: FAIL because no bridge or UI exists.

**Step 3: Write minimal implementation**

Add:
- typed invoke bridge helpers
- local polling hook or effect
- UI states for queued, running, failed, succeeded
- safe, rehearsal-first error copy

**Step 4: Run test to verify it passes**

Run: `npm test --workspace @bandscope/desktop`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src/lib/analysis.ts apps/desktop/src/App.tsx apps/desktop/src/App.test.tsx
git commit -m "feat: wire desktop analysis orchestration"
```

### Task 5: Update architecture/security docs and run full verification

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/security/app-security.md`

**Step 1: Write the failing test**

The repository doc checks already exist; use them as the failing verification target after edits.

**Step 2: Run verification to confirm current docs are incomplete**

Run: `./scripts/harness/quickcheck.sh`
Expected: still green before docs, but issue requirements are not yet documented.

**Step 3: Write minimal implementation**

Document:
- the chosen IPC/subprocess architecture
- no-loopback-HTTP decision
- trust boundary and safe error behavior

**Step 4: Run full verification**

Run: `./scripts/harness/quickcheck.sh`
Expected: PASS.

Also run:

```bash
npm run test --workspaces --if-present
npm run typecheck --workspaces --if-present
cd services/analysis-engine && uv run pytest tests -q
```

**Step 5: Commit**

```bash
git add ARCHITECTURE.md docs/architecture/overview.md docs/security/app-security.md
git commit -m "docs: record analysis orchestration boundary"
```

## Security Notes

### Attack surface

- React invoke payloads
- Tauri command handlers
- Python subprocess stdin/stdout transport

### Trust boundary

- frontend -> Tauri IPC -> Python subprocess

### Mitigations

- allowlisted commands only
- strict request/status schema validation in TypeScript, Rust, and Python
- redacted engine failures instead of raw stderr exposure

### Test points

- malformed request rejection
- unknown job id failure envelope
- subprocess failure mapping to safe typed errors

### Realistic threats

- malformed IPC payload injection
- unknown-command use
- raw local path or engine-detail leakage

### Remaining risk

- later file-backed orchestration work must keep the same validation posture when real source paths arrive

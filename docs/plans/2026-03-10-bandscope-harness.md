# BandScope Harness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a greenfield repository harness for BandScope with reproducible setup, dependency security gates, and release-traceable SBOM verification.

**Architecture:** The repo is split into a desktop shell, a shared TypeScript contract package, and a Python analysis engine. Verification is centralized through a quickcheck script and mirrored in CI, with dependency review, audits, supply-chain inventory validation, and SBOM generation treated as first-class bootstrap controls.

**Tech Stack:** npm workspaces, Vite, React, Vitest, Tauri scaffold files, Python 3.12+, uv, pytest, ruff, mypy, Dependabot, CycloneDX JSON SBOM, GitHub Actions SHA pinning.

## Security Notes

The harness must keep security guidance visible and fail-fast. Future work that touches files, URLs, subprocesses, IPC, WebView, updates, models, or cache/export behavior must include a `Security Notes` section and avoid generic exec/read/write capabilities.

### Attack surface

- repo docs and plans that define future file, URL, subprocess, IPC, WebView, model, and update behavior

### Trust boundary

- future product work crosses user-input, process, IPC, storage, and network boundaries even in a local-first app

### Mitigations

- keep security policy in repo docs, not only in chat
- fail plans that omit `Security Notes`
- fail obvious dangerous implementation patterns early

### Test points

- docs presence checks
- `Security Notes` structure checks
- security pattern checks in quickcheck

### Realistic threats

- future contributors can copy unsafe bootstrap defaults into production features
- local checks can silently miss risky workflow or release-script drift if scope is too narrow

### Remaining risk

- desktop runtime constraints remain provisional until real IPC and backend flows exist

---

### Task 1: Add repository docs and root config

**Files:**
- Create: `README.md`
- Create: `AGENTS.md`
- Create: `ARCHITECTURE.md`
- Create: `package.json`
- Create: `.gitignore`
- Create: `.editorconfig`

**Step 1: Write the files with exact setup and verification commands**

**Step 2: Run docs check and confirm required docs exist**

Run: `npm run check:docs`
Expected: PASS

**Security Notes**

- Attack surface: repo docs and scaffolding that future agents will use to shape risky features.
- Trust boundary: docs influence file, URL, subprocess, and IPC design choices before code exists.
- Mitigations: add durable security docs and keep plan and architecture docs explicit about untrusted inputs and narrow interfaces.
- Test points: docs checks fail if required security sources or references are missing.

### Task 2: Add failing tests for shared TS contracts and Python engine health

**Files:**
- Create: `packages/shared-types/test/index.test.ts`
- Create: `services/analysis-engine/tests/test_health.py`

**Step 1: Write failing tests**

**Step 2: Run targeted tests and confirm expected failures**

**Security Notes**

- Attack surface: test helpers and fixtures can accidentally normalize unsafe helper APIs.
- Trust boundary: tests sit close to production interfaces and can encourage broad capabilities.
- Mitigations: keep tests narrow and avoid helper APIs that read or execute arbitrary user input.
- Test points: test code remains free of generic exec or arbitrary file helpers.

### Task 3: Implement minimal production code to satisfy tests

**Files:**
- Create: `packages/shared-types/src/index.ts`
- Create: `services/analysis-engine/src/bandscope_analysis/health.py`
- Create: `services/analysis-engine/src/bandscope_analysis/__init__.py`

**Step 1: Add the smallest code needed to pass tests**

**Step 2: Re-run tests until green**

**Security Notes**

- Attack surface: new shared helpers and service entrypoints.
- Trust boundary: desktop shell, TS contracts, and Python engine boundaries are being created.
- Mitigations: keep the initial production code free of generic file and subprocess helpers.
- Test points: security gates catch dangerous execution and artifact-loading shortcuts.

### Task 4: Add desktop shell scaffold and verification scripts

**Files:**
- Create: `apps/desktop/*`
- Create: `scripts/harness/quickcheck.sh`
- Create: `scripts/checks/verify_docs.py`
- Create: `.github/workflows/ci.yml`

**Step 1: Add minimal app shell and config**

**Step 2: Add quickcheck and CI to mirror local checks**

**Step 3: Ensure quickcheck and CI treat dependency review, audit, supplemental inventory, and SBOM generation as bootstrap gates rather than deferred hardening**

**Security Notes**

- Attack surface: quickcheck, CI, and doc rules that define what future changes can skip.
- Trust boundary: local verification and CI decide whether risky design drift is caught early.
- Mitigations: add guardrails that catch missing security context and obvious dangerous patterns early.
- Test points: quickcheck fails when docs, notes, or high-signal pattern checks fail.

### Task 5: Run full harness verification

**Files:**
- Modify: `README.md` if commands drift

**Step 1: Run `npm ci` and `uv sync --project services/analysis-engine --group dev --frozen`**

**Step 2: Run `./scripts/harness/quickcheck.sh` and record outputs**

**Step 3: Record supply-chain evidence including workflow paths, intended required checks for `main` and `develop`, SBOM format, and the supplemental inventory path for bundled binaries and model artifacts**

**Security Notes**

- Attack surface: final verification can silently permit unsafe defaults if it is too shallow.
- Trust boundary: release readiness depends on checks being enforced before later feature work lands.
- Mitigations: verification should fail when required security documentation or plan annotations are missing.
- Test points: quickcheck output should show docs, Security Notes, security pattern gates, and supply-chain baseline checks passing.

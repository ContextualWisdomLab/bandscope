# Issue 35 Section Roadmap Implementation Plan

**Goal:** Expand the rehearsal section contract and demo outputs so BandScope exposes a typed section roadmap with form kinds, markers, and cue anchors.

**Architecture:** Keep the current `song -> section -> role` shape and add typed form metadata directly on `RehearsalSection`. Mirror the same structure in shared types, the Python demo result, and the desktop shell so roadmap semantics are consistent end-to-end.

**Tech Stack:** React 19, TypeScript shared contracts, Python 3.14, Vitest, pytest

---

### Task 1: Add typed section roadmap fields to shared contracts

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/shared-types/test/index.test.ts`

**Step 1: Write the failing test**

Add tests for:
- section `kind`
- section `markers`
- optional `primaryCue`
- representative multi-section fixture ordering

**Step 2: Run test to verify it fails**

Run: `npm test --workspace @bandscope/shared-types`
Expected: FAIL because the new section roadmap fields do not exist.

**Step 3: Write minimal implementation**

Add:
- `SectionKind`
- `SectionMarker`
- expanded `RehearsalSection`
- multi-section demo fixture

**Step 4: Run test to verify it passes**

Run: `npm test --workspace @bandscope/shared-types`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared-types/src/index.ts packages/shared-types/test/index.test.ts
git commit -m "feat: add section roadmap contracts"
```

### Task 2: Mirror section roadmap fields in the Python demo result

**Files:**
- Modify: `services/analysis-engine/src/bandscope_analysis/api.py`
- Modify: `services/analysis-engine/tests/test_api.py`

**Step 1: Write the failing test**

Add pytest cases asserting:
- the demo song includes multiple ordered sections
- each section carries `kind` and `markers`
- at least one cue anchor is present at section level

**Step 2: Run test to verify it fails**

Run: `cd services/analysis-engine && uv run pytest tests/test_api.py -q`
Expected: FAIL because the Python payload still exposes the old section shape.

**Step 3: Write minimal implementation**

Update Python typed payloads and demo result to match the new shared schema.

**Step 4: Run test to verify it passes**

Run: `cd services/analysis-engine && uv run pytest tests/test_api.py -q`
Expected: PASS.

**Step 5: Commit**

```bash
git add services/analysis-engine/src/bandscope_analysis/api.py services/analysis-engine/tests/test_api.py
git commit -m "feat: add roadmap sections to demo engine payload"
```

### Task 3: Render section roadmap details in the desktop shell

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.test.tsx`
- Modify: `apps/desktop/src/locales/en/common.json`
- Modify: `apps/desktop/src/locales/ko/common.json`

**Step 1: Write the failing test**

Add UI assertions for:
- section kind text
- marker text
- primary cue text

**Step 2: Run test to verify it fails**

Run: `npm test --workspace @bandscope/desktop`
Expected: FAIL because the UI does not render roadmap fields yet.

**Step 3: Write minimal implementation**

Render section roadmap details and localize the labels.

**Step 4: Run test to verify it passes**

Run: `npm test --workspace @bandscope/desktop`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src/App.tsx apps/desktop/src/App.test.tsx apps/desktop/src/locales/en/common.json apps/desktop/src/locales/ko/common.json
git commit -m "feat: render rehearsal roadmap sections"
```

### Task 4: Update the domain docs and verify

**Files:**
- Modify: `docs/architecture/rehearsal-domain-model.md`
- Modify: `ARCHITECTURE.md`

**Step 1: Update docs**

Record that the baseline now has typed section form semantics and cue markers.

**Step 2: Run full verification**

Run:

```bash
./scripts/harness/quickcheck.sh
```

Expected: PASS.

**Step 3: Commit**

```bash
git add docs/architecture/rehearsal-domain-model.md ARCHITECTURE.md
git commit -m "docs: record roadmap section baseline"
```

## Security Notes

### Attack surface

- typed roadmap payload crossing shared-types, Python, and React

### Trust boundary

- Python result payload -> shared contract -> UI render path

### Mitigations

- additive typed fields only
- strict schema validation
- tests to prevent contract drift

### Test points

- section kind validation
- marker validation
- cue-anchor rendering

### Remaining risk

- the roadmap remains fixture-driven until real extraction lands in later issues

# BandScope Harness Design

## Context

- The workspace contains only task metadata JSON files and no product repository scaffolding.
- The project needs a greenfield harness that supports a Tauri desktop app plus a Python analysis engine.

## Constraints

- Keep the repo local-first and desktop-oriented.
- Prefer reproducible mechanical checks over chat-only instructions.
- Keep initial CI practical but non-negotiable: fast lint, typecheck, unit tests, docs gates, dependency review, audit, SBOM generation, and supply-chain inventory validation.
- Treat dependency review, vulnerability checks, lockfiles, GitHub Action pinning, and SBOM retention as bootstrap controls rather than release-phase cleanup.
- Keep GitHub required-check design aligned to Gitflow so `feature/* -> develop`, `release/* -> main`, and `hotfix/* -> main` all keep the same supply-chain baseline.
- Repo files define workflows and intended check names; actual required-check enforcement still lives in GitHub branch protection or rulesets.

## Security Notes

### Attack surface

- future file import/export flows
- URL and YouTube intake
- local IPC and backend contracts
- model artifacts and cache paths

### Trust boundary

- user-provided files, URLs, and metadata stay untrusted across import, decode, and persistence boundaries
- plan docs and harness checks must remind future agents where those boundaries are crossed

### Mitigations

- prefer narrow allowlisted interfaces over generic file, exec, or IPC capabilities
- keep the docs harness failing when required security context is missing from future plan docs
- force security guidance into repo-visible docs instead of leaving it in chat

### Test points

- docs checks should fail if required security docs disappear
- plan checks should fail if `Security Notes` are missing from future plans
- pattern gates should fail on obvious dangerous execution or rendering shortcuts
- supply-chain checks should fail if lockfiles, dependency-review/audit/SBOM workflows, pinned actions, or supplemental inventory disappear

## Approaches considered

### 1. Minimal single-package harness
- Pros: fastest startup
- Cons: frontend and Python boundaries blur quickly

### 2. Monorepo harness with shared contracts
- Pros: clear boundaries, scalable verification, good fit for BandScope
- Cons: slightly more configuration upfront

### 3. Full product scaffold including packaging automation
- Pros: closest to end-state
- Cons: too much setup before core behavior exists

## Decision

- Choose a monorepo harness with three lanes: desktop app, shared TS contracts, and Python engine.
- Keep verification centered on a single quickcheck script.
- Add minimal production code with tests so the harness is executable from day one.
- Treat supply-chain enforcement as part of the harness definition: protected-branch changes are expected to pass dependency review, vulnerability checks, inventory validation, and SBOM generation from bootstrap onward.

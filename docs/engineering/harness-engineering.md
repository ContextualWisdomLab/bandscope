# Harness Engineering Guide

## Purpose

Capture repository-local harness and verification behavior used for engineering acceptance.

## Primary local entrypoint

- `./scripts/harness/quickcheck.sh`

Quickcheck aggregates lint/type/test/build and repository policy checks intended to mirror CI baseline safety.

## Core verification commands

- Lint and policy checks: `npm run lint`
- Type checks: `npm run typecheck`
- Tests: `npm run test`
- Workspace vulnerability gate: `npm audit --workspaces --audit-level=high`

## Supply-chain and workflow policy checks

- `node scripts/checks/run_python.mjs scripts/checks/verify_supply_chain.py`
- `node scripts/checks/run_python.mjs scripts/checks/security_gates.py`
- `node scripts/checks/run_python.mjs scripts/checks/verify_github_bootstrap_policy.py`

The Node wrapper selects `py -3`, `python3`, or `python` in a deterministic platform-specific
order. Once a candidate starts, its exit status is authoritative; a failing check never falls
through to another interpreter.

## Python analysis engine notes

- Dependency sync: `uv sync --project services/analysis-engine --group dev`
- Tests: `uv run --project services/analysis-engine pytest --cov=src/bandscope_analysis --cov-report=term-missing --cov-fail-under=100`
- Real YouTube known-stem validation: `docs/engineering/youtube-known-stem-validation.md`

## CI parity expectation

Local verification should be chosen to match touched areas and must not undercut protected-branch required checks documented in `docs/security/github-required-checks.md`.

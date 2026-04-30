---
name: bandscope-supply-chain-warning-remediation
description: Use when BandScope verification, CI, GitHub Actions, Dependabot, OSSF Scorecard, cargo audit, npm audit, CodeQL, Strix, security gates, or PR review emits warnings, deprecations, notices, or supply-chain failures.
---

# BandScope Supply-Chain Warning Remediation

## Overview

Treat every supply-chain warning as evidence to classify, fix, or track. The goal is clean verification without weakening BandScope security gates or hiding externally owned risk.

## Workflow

1. Capture the exact warning or failure text, command, working directory, commit SHA, tool version, and whether it appeared locally, in CI, or on a PR.
2. Classify the source: repo code, workflow shape, direct dependency, transitive dependency, scanner/platform limit, or stale issue metadata.
3. Trace the direct owner with structured tooling:
   - GitHub Actions: `gh run view <run-id> --log-failed`
   - Dependabot: `gh api repos/seonghobae/bandscope/dependabot/alerts/<id>`
   - Rust/Tauri: `cargo tree -i <crate> --manifest-path apps/desktop/src-tauri/Cargo.toml`
   - npm: `npm explain <package>`
   - Python: `uv tree --project services/analysis-engine --package <package>`
   - Strix/security scans: link the finding ID, affected file/path, rule name, run URL, and current-head SHA
4. Add a failing regression guard first when repo code can prevent recurrence.
5. Fix the root cause. For GitHub Actions Node.js runtime deprecation warnings, trace the exact action owner/ref first. If the action is repo-owned, update the action runtime or action code. If the action is repo-selected external code, upgrade to a maintained action ref and pin it to a specific commit SHA. Do not use broad log filtering, generic quiet flags, or gate removal.
6. If no maintained fix exists, document the owner chain and create or link a follow-up issue with acceptance criteria and Security Notes.
7. Re-run the original warning command plus the smallest relevant policy/test command.
8. For PR review warnings, push the fix and re-check robot review/check evidence instead of dismissing the review.

## BandScope Rules

- Preserve required checks from `docs/security/github-required-checks.md`.
- Do not disable or downgrade SBOM, dependency review, CodeQL, Trivy, Bandit, secret scanning, OSSF Scorecard, Windows build, or macOS build gates.
- OSSF Scorecard publishing jobs must contain only `uses:` steps. Remove shell diagnostics from the publishing job or move them to a separate non-publishing job.
- Direct dependency changes require lockfile updates and the dependency admission rationale defined in `docs/security/dependency-policy.md`.
- For transitive Rust/Tauri vulnerabilities, prefer minimal lockfile updates. If blocked upstream, record the exact crate chain and patched-version status.
- Treat `+deprecated` Cargo version metadata as a tracked dependency signal, not automatically as a compiler warning.
- GitHub/platform-owned action warnings, such as `github/dependabot-action@<sha>`, are evidence to track with the run URL, action owner/ref, and follow-up owner; do not treat them as merge blockers when no repo-controlled fix exists. If a platform warning only reports an unpinned ref like `github/dependabot-action@main`, track it as an exception signal rather than an allowed default; repo-selected actions still follow the SHA pinning rule in `docs/security/dependency-policy.md`.
- Strix findings, including issue #192 context, are actionable remediation signals, not blockers by name alone. Fix the finding, rebut it with file-level evidence, or split a follow-up issue with acceptance criteria and Security Notes.
- Every supply-chain PR or issue update must include Security Notes.

## Verification Commands

Run the narrowest command first, then widen as needed:

- `python3 scripts/checks/verify_supply_chain.py`
- `python3 scripts/checks/security_gates.py`
- `uv run --project services/analysis-engine pytest services/analysis-engine/tests/test_supply_chain_policy.py`
- `npm audit --workspaces --audit-level=high`
- `BANDSCOPE_ENABLE_RUST_CHECK=1 ./scripts/harness/quickcheck.sh`
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` when Rust changes are in scope

## Issue Template

When a warning remains externally owned, update or create an issue with:

- Current state and exact evidence link
- Root cause and owner chain
- Repo-controlled actions already attempted
- Next maintained fix path or upstream dependency
- Acceptance criteria
- Security Notes covering risk, gate impact, logging/privacy, and test points

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Adding `grep -v`, `2>/dev/null`, or global quiet flags | Fix the source or add a narrow documented allowance. |
| Treating default-branch CI failure as blocked | Fix repo-controlled workflow failures unless auth, network, permission, or platform capability blocks it. |
| Removing security workflows to unblock a PR | Preserve gates and fix their inputs or job shape. |
| Closing stale warning issues without evidence | Link the passing command, PR, commit, or successor issue. |

## Done Criteria

- Original warning command re-run.
- Output is clean, or residual risk has an owner and linked follow-up issue.
- Regression guard covers repo-controlled recurrence.
- Required checks remain intact.
- PR/issue comments include durable evidence and Security Notes.

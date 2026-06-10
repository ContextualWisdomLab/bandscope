---
name: ci-warning-root-cause-remediation
description: Use when GitHub Actions logs, local verification commands, scanners, linters, dependency tools, or robot reviewers report warnings, deprecations, notices, fatal errors, agent implementation mistakes, or security defects in BandScope or similar repositories.
---

# CI Warning Root Cause Remediation

## Overview

Turn every CI warning or agent-introduced defect into a tracked root-cause fix, a narrow documented external-owner follow-up, or a verified non-issue. Prefer code/config/toolchain fixes over output filtering.

## Workflow

1. Capture exact evidence: command, working directory, run URL/job/step, warning text, tool/action version, commit SHA, and whether it appears locally, in CI, or both.
2. Classify the owner: repository code, workflow configuration, direct dependency, transitive dependency, toolchain/runtime mismatch, hosted runner image, robot reviewer, or external service.
3. Trace the owner chain with structured tools where possible:
   - GitHub Actions: inspect workflow file, pinned action SHA, action inputs, and job logs.
   - JavaScript: use `npm explain`, lockfile entries, and action package metadata.
   - Python: use `uv tree`, `pip inspect`, or direct lockfile reads.
   - Rust: use `cargo tree`, `cargo audit`, and `Cargo.lock`.
   - Code/lint: search exact symbols and rule IDs, then read the narrow files.
4. Choose the maintained path:
   - update project code or tests,
   - align versions or inputs,
   - remove unused dependencies,
   - replace deprecated APIs,
   - add a narrow repo-owned guard, or
   - create a follow-up only when the remaining owner is external and no maintained fix exists.
5. Do not hide warnings with broad filters, `2>/dev/null`, blanket quiet flags, or reviewer dismissal.
6. Add regression coverage when the warning can recur.
7. Re-run the exact warning-producing command or CI job and the smallest relevant local verification.
8. Record evidence in the PR and linked issue.

## Agent mistake and security defect handling

When a linter error, test failure, security issue, or review finding is caused by agent work:

- Treat it as in-scope remediation, not a blocker.
- Add or strengthen tests before changing production/security-sensitive code.
- Fix the smallest root cause and re-run the failing command.
- If the mistake reveals a reusable workflow gap, add a skill, guard script, or canonical doc update in the same PR when scoped.
- Keep security controls stricter or equal; never weaken checks to make CI green.

## GitHub Actions warning pattern

For action-runtime warnings:

1. Identify the exact action SHA and semantic version comment.
2. Confirm whether the latest upstream release fixes the warning.
3. If no upstream fix exists, avoid the warning-producing code path with action-supported inputs while preserving digest, permission, and SHA-pin controls.
4. If repo code replaces action behavior, make it narrow and safe by default, with tests for malformed inputs and unexpected artifacts.
5. Keep a follow-up issue for upstream removal only when repo-controlled mitigation cannot eliminate the warning fully.

## Done criteria

- Original warning command or CI job has fresh evidence.
- Output is warning-free, or the remaining warning is explicitly external-owned with issue linkage and no maintained repo-controlled fix.
- Regression tests or guard scripts cover the path.
- Linked issue records owner chain, fix, verification, and follow-up state.
- PR current head has passing required checks and robot-review approval/skip evidence.

## Forbidden shortcuts

- Do not use broad log filtering to hide warnings.
- Do not request or wait for human review unless explicitly required by the user.
- Do not treat Strix/robot/security findings as blockers to ignore; triage and fix or rebut with evidence.
- Do not mark platform-owned warnings resolved without checking for upstream releases or maintained alternatives.

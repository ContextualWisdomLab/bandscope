# Agents, Skills, and Subagents

## Purpose

Define repository-canonical rules for agent execution, skill usage, and subagent delegation.

## Execution defaults

- Prefer repository facts first (`code`, `docs`, `CI`, `issues`, `PRs`, `history`).
- Use skills when relevant, especially for workflow, dependency upgrades, reviews, and verification discipline.
- Use subagents for independent analysis or implementation streams.

## Minimum delegation baseline

- If files are changed, execute at least one subagent call for analysis, implementation, or review.
- For multi-step work, use at least two subagent calls where practical (e.g., investigation + domain expert validation).

## Required process controls

- Run `pr_continuity` when preparing PR actions.
- Do not claim completion without running verification commands in the current state.
- Preserve branch protection and required check baselines; do not weaken governance/security controls.

## Evidence placement

Prefer evidence in durable artifacts:

- commits
- PR descriptions/comments
- workflow runs
- repository documentation updates

## Related docs

- `AGENTS.md`
- `docs/workflow/github-bootstrap-execution-policy.md`
- `docs/security/github-required-checks.md`

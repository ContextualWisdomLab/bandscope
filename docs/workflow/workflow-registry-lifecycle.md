# GitHub Actions Workflow Registry Lifecycle

## Purpose

GitHub Actions workflow source and the Actions workflow registry have independent lifecycles. Removing `.github/workflows/<name>.yml` from the protected branch does **not** prove that the corresponding registry identity is disabled. BandScope therefore treats repository-tree state and Actions-registry state as separate evidence authorities.

This document defines the BandScope-owned read-only recurrence detector added for issue #847. Organization-wide lifecycle policy and mutation authority remain with `ContextualWisdomLab/.github#945`.

## Read-only audit

Run the detector against the protected integration branch:

```bash
python scripts/checks/audit_workflow_registry.py \
  --repository ContextualWisdomLab/bandscope \
  --branch develop
```

`GITHUB_TOKEN` is optional for public reads and may be supplied for bounded authenticated reads. The token value is never emitted. The client accepts only an HTTPS API origin, does not follow redirects, and rejects request targets that leave the configured origin.

The detector:

1. resolves the exact `develop` commit SHA;
2. paginates the complete Actions workflow registry and records a receipt for every page;
3. fetches the complete recursive tree for that exact SHA and rejects truncated tree evidence;
4. refetches `develop` and aborts if the branch moved during the audit;
5. classifies every registry record without using workflow-name heuristics;
6. emits a machine-readable JSON evidence envelope containing the bound SHA, observation time, pagination receipts, summary counts, workflow IDs, paths, states, classifications, and reasons.

## Classifications

- `present`: registry state is active and the repository workflow path exists in the bound tree.
- `orphaned_deleted`: registry state is active, the path is repository-owned workflow YAML, and that path is absent from the bound tree.
- `disabled`: registry state is not active.
- `github_dynamic`: the registry record explicitly identifies GitHub-managed dynamic ownership rather than repository-backed workflow source.
- `unresolved`: malformed, duplicate, ambiguous, or otherwise insufficient evidence. Unresolved evidence is non-passing.

A legitimate current workflow may contain words such as `bootstrap`, `finalize`, or `once`. Names never authorize disablement. Conversely, a benign name does not make an absent active repository path legitimate.

## Exit contract

- `0`: complete evidence with no `orphaned_deleted` or `unresolved` records.
- `1`: complete evidence found at least one active orphan or unresolved record.
- `2`: the audit itself could not establish complete trustworthy evidence, including permission loss, HTTP failure, malformed API data, truncated tree data, or branch movement.

A nonzero result must not be converted to success merely to keep CI green.

## Mutation boundary

The detector is deliberately read-only. It does **not** recreate historical workflow YAML, disable registry records, change workflow permissions, add a PAT, or mutate branch protection.

For an `orphaned_deleted` record, the operator/control plane must immediately before mutation re-resolve the protected `develop` SHA, refetch the exact workflow registry record, confirm that the path remains absent, and then use the authorized GitHub Actions lifecycle API to disable that exact workflow ID. Before/after registry evidence must be retained. If the evidence changed, abort and re-audit rather than using a stale workflow ID.

BandScope source ownership ends at the detector and repository-specific evidence. Organization-wide inventory, credentials, and registry mutation remain the central `.github` owner's responsibility. This prevents a leaf repository from creating a competing privileged cleanup mechanism.

## Adversarial acceptance

Repository tests cover complete pagination receipts, early pagination termination, total-count drift, malformed records, duplicate/reused workflow IDs, GitHub-managed dynamic identities, a legitimate present bootstrap-named workflow, exact branch binding, branch movement, tree truncation, cross-origin/scheme-switching request attempts, permission loss, and transient HTTP failures. These tests are deterministic and do not require live GitHub network access.

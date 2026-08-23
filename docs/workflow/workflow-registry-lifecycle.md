# GitHub Actions Workflow Registry Lifecycle

## Purpose

GitHub Actions workflow source and the Actions workflow registry have independent lifecycles. Removing `.github/workflows/<name>.yml` from the protected branch does **not** prove that the corresponding registry identity is disabled, and absence from the protected default tree alone also does **not** prove that no live non-default branch still owns that workflow source. BandScope therefore treats repository-tree state, branch provenance, and Actions-registry state as separate evidence authorities.

This document defines the BandScope-owned read-only recurrence detector added for issue #847. Organization-wide lifecycle policy, cross-branch provenance decisions, and registry mutation authority remain with `ContextualWisdomLab/.github#945`.

## Read-only audit

Run the detector against the protected integration branch:

```bash
python scripts/checks/audit_workflow_registry.py \
  --repository ContextualWisdomLab/bandscope \
  --branch develop
```

`GITHUB_TOKEN` is optional for public reads and may be supplied for bounded authenticated reads. The token value is never emitted. The client accepts only an HTTPS API origin, does not follow redirects, and rejects request targets that leave the configured origin. Token-bearing requests are restricted to the canonical `https://api.github.com` origin. Successful response bodies are streamed with an 8 MiB hard ceiling before UTF-8/JSON parsing; an oversized body fails closed rather than being materialized without bound. Non-200 responses fail on status without consuming an untrusted response body.

The 8 MiB ceiling leaves bounded headroom over GitHub's documented 7 MB maximum recursive-tree response while still enforcing a repository-owned memory limit. The workflow-list API is separately paginated at its documented maximum of 100 records per page.

The detector:

1. resolves the exact `develop` commit SHA;
2. paginates one complete Actions workflow registry observation;
3. fetches the complete recursive tree for that exact SHA, rejects truncated or duplicate-path tree evidence, preserves every path byte-for-byte as Git reports it, and retains only regular-file Git blobs (`100644` or `100755`) as source-file existence evidence;
4. paginates a second complete Actions workflow registry observation;
5. refetches `develop` and aborts if the branch moved during the audit;
6. compares the two registry observations as an order-independent multiset of classification-authoritative `(id, path, state, name)` values and aborts if they differ, including same-count remove/add replacement;
7. classifies the final matching registry observation without using workflow-name heuristics or whitespace-normalizing the authority-bearing registry `path` and `state`; and
8. emits a machine-readable JSON evidence envelope containing the bound SHA, observation time, final pagination receipts, summary counts, workflow IDs, paths, states, classifications, and reasons.

Re-reading only the Git ref is insufficient because the Actions registry can change independently of the repository tree. The two complete registry observations therefore form a fail-closed stability check: changed order alone is accepted, while any changed classification-authoritative identity invalidates the audit. Auxiliary fields that do not authorize classification are not used to invent lifecycle movement.

Recursive tree paths are also typed, exact evidence. A tree/directory entry, submodule entry, malformed non-blob entry, or symlink blob (`120000`) whose path happens to end in `.yml` or `.yaml` cannot prove that executable workflow source exists. Duplicate path records make the tree observation ambiguous and therefore fail the audit. Leading or trailing whitespace is part of a Git path rather than normalization syntax, so a whitespace-altered path cannot be collapsed onto a different registry identity. Only a regular-file Git blob (`100644` or `100755`) at the exact registry path can satisfy the default-tree `present` boundary; all other cases remain absent from the source-file evidence set and therefore unresolved when the registry still advertises them as active.

The detector deliberately does not enumerate every non-default branch. Therefore a repository workflow path that is active in the registry but absent from the bound `develop` regular-file blob set is a candidate lifecycle drift signal, not proof of deletion. It is emitted as `unresolved` until an authorized control-plane step establishes branch provenance.

## Classifications

- `present`: registry state is active and an exact regular-file Git blob exists at the repository workflow path in the bound tree.
- `disabled`: registry state is not active.
- `github_dynamic`: the registry path uses GitHub's observed platform-managed `dynamic/` namespace.
- `unresolved`: malformed, duplicate, ambiguous, unknown non-repository, or active repository-path evidence that lacks an exact regular-file blob in the bound default tree without independent branch-provenance proof. Unresolved evidence is non-passing.
- `orphaned_deleted`: reserved in the v1 schema for an identity whose deletion has been independently proven. The standalone BandScope detector does not infer or emit this state from default-tree absence alone.

A legitimate current workflow may contain words such as `bootstrap`, `finalize`, or `once`. Names never authorize disablement. An attacker-supplied auxiliary field such as `source: github` also cannot override exact path/tree evidence. Conversely, a benign name does not make an absent active repository path legitimate; it remains unresolved until provenance is established. Registry `path` and `state` are identity-bearing values and are compared exactly rather than repaired by trimming whitespace.

## Exit contract

- `0`: complete stable evidence with no `orphaned_deleted` or `unresolved` records.
- `1`: complete stable evidence contains at least one proven orphan bucket or unresolved record. In the standalone detector, active default-tree absences contribute here as `unresolved`.
- `2`: the audit itself could not establish complete trustworthy evidence, including permission loss, HTTP failure, oversized or malformed API data, truncated or duplicate-path tree data, branch movement, or workflow-registry movement during the audit.

A nonzero result must not be converted to success merely to keep CI green.

## Mutation boundary

The detector is deliberately read-only. It does **not** recreate historical workflows, disable registry records, enumerate or mutate non-default branches, change workflow permissions, add a PAT, or mutate branch protection.

For an active repository workflow that is absent from the bound `develop` tree, the BandScope report remains `unresolved`. Before any registry disablement, the authorized operator/control plane must independently establish that no live branch still owns the workflow source, re-resolve the protected `develop` SHA, refetch the exact workflow registry record, and confirm that the relevant evidence remains unchanged. Only that authority may promote the evidence to a proven orphan and disable the exact workflow ID. Before/after registry evidence must be retained. If the evidence changed, abort and re-audit rather than using a stale workflow ID.

BandScope source ownership ends at the detector and repository-specific evidence. Organization-wide inventory, cross-branch provenance, credentials, and registry mutation remain the central `.github` owner's responsibility. This prevents a leaf repository from creating a competing privileged cleanup mechanism.

## Adversarial acceptance

Repository tests cover complete pagination receipts, early pagination termination, total-count drift, same-count registry identity replacement, order-independent stable registry observations with final-receipt emission, malformed records, duplicate/reused workflow IDs, GitHub-managed dynamic identities, a legitimate present bootstrap-named workflow, workflow-looking directory/tree and symlink entries that must not become source-file evidence, duplicate recursive-tree paths, exact whitespace-significant tree paths, whitespace-altered registry path/state authority, an active off-default workflow whose branch provenance is unproven, forged auxiliary source metadata, unknown active non-repository paths, exact branch binding, branch movement, tree truncation, cross-origin/scheme-switching request attempts, token-bearing non-canonical API origins, oversized successful response bodies, permission loss, and transient HTTP failures. These tests are deterministic and do not require live GitHub network access.

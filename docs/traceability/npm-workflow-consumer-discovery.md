# npm workflow consumer discovery

Status: Proposed

## Problem

BandScope has one repository-owned npm runtime acquisition boundary: `scripts/checks/activate_pinned_npm_runtime.sh`. The structural regression in `test_npm_toolchain_contract.py` previously enforced that boundary only for four named workflow files: `ci.yml`, `release.yml`, `security-audit.yml`, and `build-baseline.yml`.

That allowlist was weaker than the owner invariant. A new workflow could run `npm ci` without the canonical activation path and remain invisible to the regression until someone manually added its filename.

This is no longer theoretical. Score Storage PR #1241 introduced `.github/workflows/score-storage-native.yml`. Its UI job sets up Node 22.22.3 and immediately executes raw `npm ci`; exact-head run `35543493216`, job `106165239933`, failed at `Install locked JavaScript dependencies` before the focused ScoreView regressions ran. The Score Storage branch must not copy the mutable #896 helper, but its failure is valid downstream evidence that filename allowlisting is not a durable repository policy.

## Constraints

- #896 remains the single writer for repository-wide Node/npm runtime acquisition and provenance.
- #1241 remains the Score Storage / Score Attachment owner. Its workflow source is not copied into this branch.
- New workflow files must not require manual enrollment before the npm runtime invariant applies.
- Workflows without local npm dependency reads must not be forced to add Node or Corepack setup.
- Reusable-workflow call jobs have no local `steps`; their called workflow is evaluated independently when it is repository-owned under `.github/workflows`.
- `actions/setup-node` dependency caching remains disabled before the reviewed npm runtime is selected and verified. GitHub documents setup-node as a package-manager-specific dependency-cache surface; the repository therefore keeps `package-manager-cache: false` at this pre-admission boundary.
- A structural policy regression is not hosted runtime proof. The final merge candidate still requires exact-head Actions evidence.

## Decision

Commit `ff14b04ad57815c6d6c7ab7bb49077f8cd9a05db` replaces the workflow filename allowlist with discovery of every top-level `.yml` and `.yaml` file under `.github/workflows`. Every job with local shell steps is inspected. When a job executes `npm ci`, the existing owner contract is applied:

1. exactly one checkout step exists and does not persist credentials;
2. exactly one `actions/setup-node` step exists;
3. setup-node package-manager caching is disabled before runtime admission;
4. the canonical npm activation helper executes before the first `npm ci` dependency read.

Commit `ce4d5264542a036906c0485c6082174cd323a918` preserves that discovery while explicitly skipping job-level reusable-workflow calls that have no local `steps`; repository-owned called workflows remain discoverable as workflow files themselves.

The downstream #1241 failure is the realistic RED evidence for the missing discovery policy. These commits repair the canonical owner guardrail; they do not claim that #1241 is fixed before #896 reaches protected truth and #1241 is ordinarily reconciled on top of it.

## Rejected alternatives

- Add `score-storage-native.yml` to the existing filename tuple: rejected because the next workflow can bypass the policy again.
- Copy `activate_pinned_npm_runtime.sh` into #1241 before #896 integrates: rejected because that creates a mutable second owner and can drift from retry/integrity policy.
- Require Node setup in every workflow regardless of whether it reads npm dependencies: rejected because unrelated SBOM/security/native-only jobs do not cross this trust boundary.
- Treat the #1241 UI failure as evidence that ScoreView regressions failed: rejected because the regression step was skipped after dependency admission failed.
- Blindly rerun #1241: rejected because the source configuration would be unchanged.

## Evidence and claim boundary

At #1241 exact head `b29b7b522478780db44db1c754ab7f660ed2b17b`, `score-storage-native` run `35543493216` produced:

- macOS native job `106165239883`: success;
- Windows native job `106165239907`: success;
- UI job `106165239933`: failure at `Install locked JavaScript dependencies`; the focused UI regression step was skipped.

The exact #1241 workflow source contains Node 22.22.3 setup with `package-manager-cache: false` followed directly by `npm ci`, with no canonical activation step. This document does not invent the unavailable npm stderr and does not assert that a particular diagnostic string caused the failure.

The discovery regression proves repository source topology: once an npm-consuming workflow exists in the same candidate tree, it cannot silently bypass the canonical activation ordering without failing the policy test. It does not prove network availability, Corepack registry behavior, npm extraction, application tests, or release readiness.

## Follow-up

- Keep #896 Draft until exact-current-head repository/security/native gates and independent review settle.
- After #896 reaches protected `develop`, ordinary/non-force reconcile #1241 and replace its raw npm admission with the protected canonical activation path.
- Run #1241's focused UI job again on that unchanged reconciled head and require the ScoreView/scoreStorage regressions themselves to execute and pass.
- Treat any future npm-consuming workflow that fails the discovery policy as an owner-path repair finding rather than adding another filename exception.

## Security Notes

The repair does not add credentials, network permissions, dependency caches, package registries, or fallback runtimes. It broadens only the static enforcement surface from a hand-maintained filename list to the repository's actual workflow inventory. This reduces the chance that a new workflow consumes dependencies using the Node-bundled/system npm before the integrity-bound repository runtime is selected.

## References

GitHub. (2026). *Building and testing Node.js*. GitHub Docs. https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs

GitHub. (2026). *Dependency caching reference*. GitHub Docs. https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching

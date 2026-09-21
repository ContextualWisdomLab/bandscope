# npm workflow activation single-path contract

Status: **Proposed**  
Owner: BandScope Node/npm runtime vertical (#896)  
Last reviewed: 2026-09-21

## Problem

BandScope's canonical npm owner already treated `scripts/checks/activate_pinned_npm_runtime.sh` as the single workflow-level runtime-admission path. That helper owns exact `packageManager` integrity admission, the npm 10.9.9 runtime check, and the bounded `ETIMEDOUT`-only Corepack acquisition policy.

The repository policy did not fully enforce that ownership. `release.yml` and `security-audit.yml` still duplicated a weaker inline sequence:

```sh
corepack enable npm
npm run check:npm-runtime
```

The existing structural test explicitly accepted that fallback whenever it appeared before `npm ci`. This meant a workflow could bypass the canonical helper's locator validation and failure-classification behavior while still satisfying the repository test.

## Constraints

- Node/npm runtime acquisition remains #896 ownership; downstream product owners must not copy a mutable Draft helper.
- Required checks and workflow permissions must not be weakened to make runtime admission pass.
- The repair must preserve existing release/security job behavior except for routing npm activation through the canonical helper.
- Reusable-workflow call jobs with no local `steps` are not direct shell consumers; repository-owned called workflow files are inspected independently.
- Source-level tests are not promoted to hosted GREEN until the unchanged exact head completes its normal repository and central gates.

## Alternatives considered

### Keep the inline fallback

Rejected. It makes the documented single-owner path advisory rather than enforceable and allows helper-specific integrity/failure-classification rules to drift between workflows.

### Enroll only `release.yml` and `security-audit.yml`

Rejected. File-name allowlists already proved brittle when Score Storage added a new npm-consuming workflow. The invariant belongs to executable npm consumption, not a fixed workflow inventory.

### Patch Score Storage #1241 directly

Rejected. #1241 is a consumer. It must use the protected/released npm runtime owner after #896 integrates instead of vendoring Draft runtime-acquisition source.

## RED → repair

1. `628aa96b0b9d0f87386dbf88fdaed41d2e121c17` adds a repository regression requiring npm-consuming workflow jobs to use the canonical activation helper and rejecting workflow-local Corepack/runtime verification. Repair followed immediately, so no hosted terminal RED is claimed for this test-only head.
2. `2ddd8b151c2223984eaa088f01865427ad04ae0b` routes release preflight through `bash scripts/checks/activate_pinned_npm_runtime.sh`.
3. `ab04754df0f48798bb50d50baf4ab6aa38e89f1e` routes the security backstop through the same helper.
4. `df20e63895968bea105510478ccc04995981d18d` strengthens the regression from literal `npm ci` matching to direct `npm` execution at normal shell-command boundaries, including common environment-assignment and `command npm` forms. This prevents npm command aliases or a different direct npm subcommand from silently escaping runtime admission.
5. `a990e7c70b40dae748123d1447c7ae724edc60e6` removes the older inline-activation fallback from `test_npm_toolchain_contract.py`; both structural regressions now describe the same single canonical activation-path invariant instead of carrying contradictory executable policy.

## Exact-head verification finding

The first hosted generation on `8113cbfcffc60af3cdc9a25df0709548d7fc2bd4` proved the pinned npm helper itself on Node 22.22.2: Corepack installed the integrity-bound npm 10.9.9 locator, `verify_npm_runtime.mjs` reported npm 10.9.9 with bundled tar 7.5.22, and frozen `npm ci` completed. The job then failed at `ruff format --check --diff` because three #896-owned Python regression files were not in canonical Ruff format.

This was a repository-source defect, not a runner or npm-acquisition failure. It was repaired immediately from the emitted formatter diff:

- `190a052c60e01fec347c3009df3e5a1869823a7d` formats `test_npm_activation_single_path.py`.
- `a41a2e5b8d3f6e53c7df232dd449b842c866e3c9` formats `test_npm_package_manager_integrity_pin.py`.
- `6366eb66635bada29fe72ec99e55efdeeeaaecd0` formats `test_npm_toolchain_contract.py`.

The failed `8113cbfc...` verdict is predecessor evidence only. The repaired final head must obtain its own unchanged exact-head gates.

## Authority and evidence

npm documents `npm ci` as a clean-install command for automated environments and exposes aliases such as `clean-install`, `ic`, and `install-clean`. Therefore the repository contract guards the direct npm executable rather than one spelling of the install subcommand.

Reference: npm, Inc. (2026). *npm-ci*. https://docs.npmjs.com/cli/commands/npm-ci/

The canonical activation helper remains the only place that may acquire/enable the pinned npm runtime. Workflow jobs may execute npm only after that helper returns successfully.

## Security notes

The trust boundary is CI dependency-tool execution. A workflow must not reach an npm command under an unreviewed bundled/system/latest runtime or a workflow-local activation sequence that omits the owner helper's integrity and failure-classification policy.

The structural regression recognizes direct npm execution at ordinary shell boundaries, including environment assignments and `command npm`. Deliberately hiding npm behind another interpreter or generated shell program is outside the current parser and is not an accepted bypass; such a workflow requires explicit policy review and a regression extension before merge.

## Effect

- Release and security workflows now consume the same runtime-admission implementation as CI/build owners.
- SHA-512 locator admission, bounded transient acquisition retry, fail-closed nontransient behavior, and runtime verification have one workflow-level owner.
- A future direct npm consumer cannot satisfy the repository test merely by reproducing `corepack enable npm` and `npm run check:npm-runtime` inline.
- The original npm-consumer discovery test no longer encodes that rejected fallback, preventing future maintenance from reintroducing two conflicting policy definitions.

## Follow-up

- Obtain terminal exact-head CI, build, security/SAST/SBOM/CodeQL and independent non-author review for the final #896 head.
- After #896 reaches protected truth, ordinary/non-force reconcile #1241 and replace its raw bundled-npm dependency admission with the protected canonical helper.
- Re-run #1241's focused ScoreView UI regression on that exact consumer head; do not transfer predecessor failures or successes.

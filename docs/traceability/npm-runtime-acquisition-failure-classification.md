# npm runtime acquisition failure classification

Status: Proposed

## Problem

PR #1232 exposed a real `ETIMEDOUT` while Corepack acquired the repository-pinned `npm@10.9.9`. PR #896 added bounded retry for that exact acquisition step. The first implementation retried every non-zero `corepack install --global` result, including signature and integrity failures. A follow-up blacklist stopped known provenance diagnostics, but still treated every unrecognized Corepack failure as transient.

That blacklist leaves a fail-open classification boundary: a future or differently worded trust/provenance failure would be retried merely because BandScope did not recognize its text. Retryability must be positively established instead. Unknown acquisition failures are not evidence of a transient transport condition.

Fresh workflow review then found two ownership defects after the helper existed. First, the exact-minimum Node 22.22.2 compatibility lane still invoked `corepack enable npm` inline and triggered package-manager resolution through `npm --version`. Second, after that lane was moved to the helper, the already-registered `ci.yml` still contained three separate inline Corepack/npm-version paths in `lock-validation`, `verify`, and `rust-check`. Those jobs are part of the normal pull-request CI path, so leaving them inline meant the same repository-pinned npm provenance contract still had multiple acquisition behaviors.

The exact-minimum lane also lived in a newly added standalone workflow. Fresh exact-head pull-request workflow inventories did not materialize that standalone lane while the existing `ci` workflow did materialize. This repository-specific evidence is not promoted into a universal GitHub Actions rule; it is sufficient to show that the intended exact-minimum evidence was absent from the live PR generation. A compatibility gate that is not present in the observed pull-request workflow inventory is not merge evidence.

## Constraints

- `npm@10.9.9` remains the only accepted package-manager runtime for this owner branch.
- Node-bundled npm, `latest`, `stable`, system npm, mutable dependency resolution, tests, builds, uploads, and release actions are not fallback targets.
- Only the exact Corepack acquisition step may receive bounded retry.
- The hosted incident actually observed `ETIMEDOUT`; this is the only transient diagnostic admitted by the current policy.
- The admitted timeout path is limited to three attempts with 5 s / 10 s backoff.
- Any unclassified Corepack failure must stop before `corepack enable npm`, `npm run check:npm-runtime`, or `npm ci` can execute.
- Every repository workflow job that consumes Node dependencies under this owner must use the same activation helper before its first `npm ci`; workflow-local Corepack activation is not a second owner implementation.
- The exact-minimum Node compatibility job must live in an already-materialized PR CI workflow rather than relying on a second workflow whose pull-request run is absent from the observed inventory.
- Error classification remains diagnostic-based because the current Corepack command boundary does not expose a stable machine-readable failure taxonomy to this script.
- Protected-base formatting debt owned by another PR is consumed by stack ancestry; it is not copied into this owner as an unrelated patch.
- Repository pull-request workflows currently filter their base branches to `develop`/`main`; #896 must therefore remain based on `develop` while carrying #1176 as a merge-parent prerequisite, otherwise repository CI disappears from the live PR generation.

## Decision

`scripts/checks/activate_pinned_npm_runtime.sh` captures and preserves Corepack's failing diagnostic. It retries only when that diagnostic contains the observed transient error code `ETIMEDOUT`. Every other non-zero acquisition result fails immediately as **not classified as transient**.

This makes signature/integrity failures fail closed without depending on an exhaustive list of current or future Corepack wording. The helper does not disable Corepack verification, alter `COREPACK_INTEGRITY_KEYS`, select another npm version, or guess that an unknown failure is a network event.

The helper is the single workflow-level activation path for the four native `build-baseline` npm consumers and the four npm-consuming jobs in the registered `ci` workflow: `lock-validation`, `verify`, `rust-check`, and `node-minimum-compatibility`. The three existing CI jobs no longer keep workflow-local `corepack enable npm` plus separate `npm --version` verification. The exact-minimum Node 22.22.2 lane is now a job in `.github/workflows/ci.yml`; the standalone `.github/workflows/node-minimum-compatibility.yml` owner is removed.

The retry allowlist is intentionally narrow. Additional error codes such as connection reset, DNS retry, or HTTP/server failures must not be admitted from intuition alone; they require a concrete hosted failure, bounded semantics, and a focused regression before this policy expands.

#1176 remains the canonical single writer for the protected-base Ruff formatting prerequisite. #896 consumes that exact head through ordinary merge ancestry but keeps its PR base on protected `develop`, because the repository workflow triggers are scoped to pull requests targeting `develop` or `main`. This keeps owner lineage and exact-head CI simultaneously observable.

## Rejected alternatives

- Retry every Corepack failure three times: rejected because deterministic trust, policy, package metadata, permission, and configuration failures are not transport recovery candidates.
- Maintain a blacklist of known signature/integrity strings and retry everything else: rejected because future or differently worded non-transient failures become retryable by default.
- Broadly classify all network-looking diagnostics as transient: rejected because the current hosted evidence proves `ETIMEDOUT`, not every possible transport or HTTP failure.
- Disable or weaken Corepack signature verification: rejected because that changes the supply-chain trust boundary rather than repairing availability.
- Fall back to Node-bundled npm 10.9.8: rejected because the repository requires npm 10.9.9 and its bundled patched `tar` floor.
- Retry `npm ci` or later build/test commands: rejected because those operations have different side effects and failure semantics.
- Keep inline Corepack activation in any CI job: rejected because it duplicates the same package-manager acquisition contract and can drift from the canonical timeout/trust classifier.
- Keep the exact-minimum compatibility check as a second standalone workflow after its PR runs are absent from the observed exact-head workflow inventory: rejected because source presence without live PR execution does not satisfy the compatibility evidence requirement.
- Copy the protected-base Ruff fix from #1176 into #896: rejected because #1176 is the canonical single writer for that prerequisite and the dependent branch can inherit it through ordinary non-force ancestry.
- Keep #896 retargeted directly onto #1176's branch: rejected after live observation because `.github/workflows/ci.yml` and the other repository pull-request workflows filter on base branch `develop`/`main`; the retargeted generation did not materialize fresh repository CI for the moved head.

## Evidence and regression

Earlier RED `4b64860cc19a0b60a6f768ef1a88e49ea024992d` proved a fake Corepack signature mismatch must stop after one install attempt with no sleep, npm enable, or npm audit. GREEN `02ae08966b491570ba8f056ac04f1d0e2b285e2c` and alignment `61713a2c8e2053476c400b8a16971e21dd0b7fac` stopped then-known signature/integrity diagnostics.

Fresh review found the remaining default-retry defect. RED `b8fcb799ca83c4dbfa56fed6802a647dbf785bfa` adds an unclassified Corepack failure and requires one attempt only, no sleep, no enable, no npm audit, preserved upstream diagnostic, and an explicit `not classified as transient` refusal.

GREEN `9c39c2a595ac5e192c53ed207df2cec6e188b483` reverses the classifier: only `ETIMEDOUT` is admitted to the bounded retry loop; any other failed acquisition exits immediately. Fixture alignment `68f71e02d47a5cd90e4c2dce474f6d1b0f8ef5e3` makes the positive retry regression emit the same `ETIMEDOUT` class observed in hosted CI, preserving the two-timeout-then-success and three-timeout-exhaustion contracts without using an unspecified failure as evidence of transience.

A later workflow sweep found that the exact-minimum workflow still bypassed the helper. RED `32928847536a301f7966a20db9420f08cd1b5354` required that consumer to use the canonical helper and forbade inline `corepack enable npm` / `npm --version`; GREEN `97042e151f60fe70ab49a7a6e822964bddeed767` rewired the workflow. Exact-tree review then found the structural regression itself still asserted the retired inline path, and `e2420beb411da4fce7c13d7d9c427bf652269008` aligned that regression with the helper contract.

A fresh live `ci.yml` review then exposed the remaining duplicate owners. RED `4830abb4db7b0741ee202582de721af0317750ce` requires the exact-minimum job to live in registered `ci.yml`, rejects the standalone workflow, and requires `lock-validation`, `verify`, `rust-check`, and `node-minimum-compatibility` to delegate activation to the helper with no inline `corepack enable npm` / `npm --version` path. GREEN `99b0707c61099a170695b66f644fd90162fb7f8c` moves the exact-minimum job into `ci.yml`, converts the three existing CI jobs to the helper, removes the redundant workflow-global npm version variable, and deletes the standalone workflow.

Exact head `c010a66fedec3647274a27900a11203e07ee671e` then materialized `gate / ci / node-minimum-compatibility` in the live PR CI workflow. On hosted macOS 15 it successfully reached Node 22.22.2, canonical npm activation, verified npm 10.9.9 with bundled tar 7.5.22, frozen dependency installation, Python dependency sync, and the Rust numeric-extension build. Its first source-backed failure was the repository Ruff formatting gate, not package-manager acquisition.

That Ruff failure named four files. Three were #896-owned regression files; `78bcc37334c512e15289503294bceaff57c5f927` aligns their formatting and removes a stale test dependency on the deleted standalone workflow by reading `node-minimum-compatibility` from registered `ci.yml`. The fourth file, `services/analysis-engine/tests/test_supply_chain_policy.py`, is the canonical formatting delta owned by #1176. Rather than copying it, merge commit `b5dc5bf7834137a8f6b0140b1219e7dbeff7b8db` inherits #1176 exact head `8fe6b6d99c009527ef0bcba419e6f6debdb23c23`.

#896 was briefly retargeted onto the #1176 branch to make the dependency stack explicit. Fresh Actions inventory then showed the practical consequence of the repository's base-branch filters: after source moved under that base, no exact moved-head repository pull-request workflows materialized. The PR base was therefore restored to protected `develop`; #1176 remains present as a merge parent, so the formatter delta is still inherited from its canonical writer rather than reimplemented locally.

Predecessor exact head `3983dd216d95dc5f78e78f6b17259ad4c5530ebc` completed all four native Windows/macOS build jobs successfully with exact npm activation. That hosted evidence validates the predecessor command path only; it does not transfer to later moved heads. Current traceability descendants require fresh hosted evidence on the unchanged merge candidate.

## Risks and claim boundary

The allowlist may reject a future genuinely transient Corepack error that is not `ETIMEDOUT`. That is an availability tradeoff accepted at the package-manager trust boundary: a false negative causes a visible build failure, while a false positive can repeatedly process an unclassified trust or policy failure as though it were harmless network noise.

Diagnostic matching still depends on upstream text. If Corepack exposes a stable structured error code or typed result, this script should consume that contract instead. This mechanism does not prove package-manager authenticity by itself; authenticity remains Corepack's verification responsibility, while BandScope controls retry and fallback behavior around that boundary.

Structural workflow tests prove command ownership and order, not successful hosted acquisition. Moving the exact-minimum lane into `ci.yml` is an evidence-topology repair, not proof that Node 22.22.2 or npm acquisition succeeds on every hosted run. The c010 run proves that one exact generation reached and passed the npm acquisition boundary before failing later at formatting; source movement after that point requires fresh evidence.

The #1176 merge parent does not transfer #1176 approvals or central-gate evidence into #896. It only establishes ancestry for the canonical formatting prerequisite. #896 still requires its own exact-head repository/central gates and current-head independent review. Keeping the PR base on `develop` also means the #1176 file remains visible in the protected-base diff until #1176 integrates normally; that visibility is accepted rather than suppressing CI or copying the delta.

## Follow-up

- Keep both the hostile signature-failure and unclassified-failure regressions in the exact-head gate.
- Keep every npm-consuming owner workflow job on the canonical activation helper; a new inline Corepack activation path is a repair finding.
- Keep the exact-minimum Node job in the registered CI workflow unless live evidence demonstrates a different canonical execution topology.
- Expand the transient allowlist only from exact observed evidence plus a focused regression and documented retry safety.
- If Corepack introduces a stable structured failure classification, replace diagnostic-string matching with that contract.
- Treat any unclassified failure that reaches sleep/retry as a repair finding, not as permission to broaden fallback behavior.
- Preserve #1176 as the single writer for the protected-base Ruff prerequisite; consume it by ancestry until normal integration reaches `develop`.
- Keep #896 based on protected `develop` while repository workflows remain base-filtered to `develop`/`main`; do not trade away exact-head CI visibility merely to make the stack prettier in the PR UI.
- Require fresh hosted success for the exact-minimum Node 22.22.2 job, normal CI jobs, native build lanes, and applicable central security/SBOM/SAST gates on the unchanged merge candidate head.

## Security Notes

The package-manager acquisition diagnostic is untrusted upstream text used only for a bounded classification decision and stderr evidence. It is never evaluated or interpolated into a shell command. The trust boundary is `corepack install --global` returning non-zero: only the exact observed `ETIMEDOUT` token permits another attempt; all other results fail closed before npm activation or dependency extraction. No secret, token, package payload, or mutable version selector is logged by this policy.

Centralizing workflow activation does not broaden permissions. The helper operates with the same repository checkout and runner process privileges the inline commands already had; the change removes duplicate acquisition paths and places the exact-minimum job inside the existing CI execution surface rather than adding a new credential or network capability. Consuming #1176 as a merge parent adds no new runtime authority; keeping the PR based on `develop` preserves the repository's existing CI trigger surface.

## References

Node.js contributors. (2026). *Corepack npm registry signature verification* [Source code]. GitHub. https://github.com/nodejs/corepack/blob/d4dcb1f89741603e776bba9d457425750fa26987/sources/npmRegistryUtils.ts

Node.js contributors. (2026). *Corepack 0.36.0* [Software release]. GitHub. https://github.com/nodejs/corepack/releases/tag/v0.36.0

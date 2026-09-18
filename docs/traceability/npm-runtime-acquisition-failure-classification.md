# npm runtime acquisition failure classification

Status: Proposed

## Problem

PR #1232 exposed a real `ETIMEDOUT` while Corepack acquired the repository-pinned `npm@10.9.9`. PR #896 added bounded retry for that exact acquisition step. The first implementation retried every non-zero `corepack install --global` result, including signature and integrity failures. A follow-up blacklist stopped known provenance diagnostics, but still treated every unrecognized Corepack failure as transient.

That blacklist leaves a fail-open classification boundary: a future or differently worded trust/provenance failure would be retried merely because BandScope did not recognize its text. Retryability must be positively established instead. Unknown acquisition failures are not evidence of a transient transport condition.

## Constraints

- `npm@10.9.9` remains the only accepted package-manager runtime for this owner branch.
- Node-bundled npm, `latest`, `stable`, system npm, mutable dependency resolution, tests, builds, uploads, and release actions are not fallback targets.
- Only the exact Corepack acquisition step may receive bounded retry.
- The hosted incident actually observed `ETIMEDOUT`; this is the only transient diagnostic admitted by the current policy.
- The admitted timeout path is limited to three attempts with 5 s / 10 s backoff.
- Any unclassified Corepack failure must stop before `corepack enable npm`, `npm run check:npm-runtime`, or `npm ci` can execute.
- Error classification remains diagnostic-based because the current Corepack command boundary does not expose a stable machine-readable failure taxonomy to this script.

## Decision

`scripts/checks/activate_pinned_npm_runtime.sh` captures and preserves Corepack's failing diagnostic. It retries only when that diagnostic contains the observed transient error code `ETIMEDOUT`. Every other non-zero acquisition result fails immediately as **not classified as transient**.

This makes signature/integrity failures fail closed without depending on an exhaustive list of current or future Corepack wording. The helper does not disable Corepack verification, alter `COREPACK_INTEGRITY_KEYS`, select another npm version, or guess that an unknown failure is a network event.

The retry allowlist is intentionally narrow. Additional error codes such as connection reset, DNS retry, or HTTP/server failures must not be admitted from intuition alone; they require a concrete hosted failure, bounded semantics, and a focused regression before this policy expands.

## Rejected alternatives

- Retry every Corepack failure three times: rejected because deterministic trust, policy, package metadata, permission, and configuration failures are not transport recovery candidates.
- Maintain a blacklist of known signature/integrity strings and retry everything else: rejected because future or differently worded non-transient failures become retryable by default.
- Broadly classify all network-looking diagnostics as transient: rejected because the current hosted evidence proves `ETIMEDOUT`, not every possible transport or HTTP failure.
- Disable or weaken Corepack signature verification: rejected because that changes the supply-chain trust boundary rather than repairing availability.
- Fall back to Node-bundled npm 10.9.8: rejected because the repository requires npm 10.9.9 and its bundled patched `tar` floor.
- Retry `npm ci` or later build/test commands: rejected because those operations have different side effects and failure semantics.

## Evidence and regression

Earlier RED `4b64860cc19a0b60a6f768ef1a88e49ea024992d` proved a fake Corepack signature mismatch must stop after one install attempt with no sleep, npm enable, or npm audit. GREEN `02ae08966b491570ba8f056ac04f1d0e2b285e2c` and alignment `61713a2c8e2053476c400b8a16971e21dd0b7fac` stopped then-known signature/integrity diagnostics.

Fresh review found the remaining default-retry defect. RED `b8fcb799ca83c4dbfa56fed6802a647dbf785bfa` adds an unclassified Corepack failure and requires one attempt only, no sleep, no enable, no npm audit, preserved upstream diagnostic, and an explicit `not classified as transient` refusal.

GREEN `9c39c2a595ac5e192c53ed207df2cec6e188b483` reverses the classifier: only `ETIMEDOUT` is admitted to the bounded retry loop; any other failed acquisition exits immediately. Fixture alignment `68f71e02d47a5cd90e4c2dce474f6d1b0f8ef5e3` makes the positive retry regression emit the same `ETIMEDOUT` class observed in hosted CI, preserving the two-timeout-then-success and three-timeout-exhaustion contracts without using an unspecified failure as evidence of transience.

Predecessor exact head `3983dd216d95dc5f78e78f6b17259ad4c5530ebc` completed all four native Windows/macOS build jobs successfully with exact npm activation. That hosted evidence validates the predecessor command path only; it does not transfer to the moved allowlist-classifier head.

## Risks and claim boundary

The allowlist may reject a future genuinely transient Corepack error that is not `ETIMEDOUT`. That is an availability tradeoff accepted at the package-manager trust boundary: a false negative causes a visible build failure, while a false positive can repeatedly process an unclassified trust or policy failure as though it were harmless network noise.

Diagnostic matching still depends on upstream text. If Corepack exposes a stable structured error code or typed result, this script should consume that contract instead. This mechanism does not prove package-manager authenticity by itself; authenticity remains Corepack's verification responsibility, while BandScope controls retry and fallback behavior around that boundary.

## Follow-up

- Keep both the hostile signature-failure and unclassified-failure regressions in the exact-head gate.
- Expand the transient allowlist only from exact observed evidence plus a focused regression and documented retry safety.
- If Corepack introduces a stable structured failure classification, replace diagnostic-string matching with that contract.
- Treat any unclassified failure that reaches sleep/retry as a repair finding, not as permission to broaden fallback behavior.

## Security Notes

The package-manager acquisition diagnostic is untrusted upstream text used only for a bounded classification decision and stderr evidence. It is never evaluated or interpolated into a shell command. The trust boundary is `corepack install --global` returning non-zero: only the exact observed `ETIMEDOUT` token permits another attempt; all other results fail closed before npm activation or dependency extraction. No secret, token, package payload, or mutable version selector is logged by this policy.

## References

Node.js contributors. (2026). *Corepack npm registry signature verification* [Source code]. GitHub. https://github.com/nodejs/corepack/blob/d4dcb1f89741603e776bba9d457425750fa26987/sources/npmRegistryUtils.ts

Node.js contributors. (2026). *Corepack 0.36.0* [Software release]. GitHub. https://github.com/nodejs/corepack/releases/tag/v0.36.0

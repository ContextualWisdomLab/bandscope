# npm runtime acquisition failure classification

Status: Proposed

## Problem

PR #1232 exposed a real `ETIMEDOUT` while Corepack acquired the repository-pinned `npm@10.9.9`. PR #896 added bounded retry for that exact acquisition step, but the first implementation retried every non-zero `corepack install --global` result. That included signature and integrity failures.

Retrying a provenance failure cannot make the reviewed artifact become valid. It also obscures the distinction between transient transport recovery and a failed trust decision. The acquisition helper must therefore preserve the exact npm version while refusing to retry diagnostics that indicate package-manager provenance verification failed.

## Constraints

- `npm@10.9.9` remains the only accepted package-manager runtime for this owner branch.
- Node-bundled npm, `latest`, `stable`, system npm, mutable dependency resolution, tests, builds, uploads, and release actions are not fallback targets.
- The existing three-attempt, 5 s / 10 s bounded acquisition loop remains available for failures that are not identified as provenance failures.
- A signature or integrity diagnostic must stop before `corepack enable npm`, `npm run check:npm-runtime`, or `npm ci` can execute.
- Error classification is intentionally conservative and diagnostic-based because Corepack exposes these failures through the command boundary rather than a stable machine-readable error taxonomy.

## Decision

`scripts/checks/activate_pinned_npm_runtime.sh` captures the failing Corepack diagnostic and fails immediately when it contains a known provenance-verification signal, including Corepack's current `Signature does not match` and `No compatible signature found in package metadata` messages and compatibility strings used by older Corepack lines such as `Cannot find matching keyid`.

The helper still prints the original diagnostic before its own refusal message. It does not disable Corepack verification, alter `COREPACK_INTEGRITY_KEYS`, select another npm version, or treat a provenance failure as a transient registry event.

Unknown acquisition failures retain the existing bounded retry behavior and still fail after three attempts. This change narrows retry scope for known trust failures; it does not claim to classify every possible network or Corepack failure.

## Rejected alternatives

- Retry every Corepack failure three times: rejected because deterministic signature/integrity failures are not transport recovery candidates.
- Disable or weaken Corepack signature verification: rejected because that changes the supply-chain trust boundary rather than repairing availability.
- Fall back to Node-bundled npm 10.9.8: rejected because the repository requires npm 10.9.9 and its bundled patched `tar` floor.
- Retry `npm ci` or later build/test commands: rejected because those operations have different side effects and failure semantics.

## Evidence and regression

RED `4b64860cc19a0b60a6f768ef1a88e49ea024992d` adds a hostile command-boundary regression: a fake Corepack returns a signature mismatch, and the helper must stop after one install attempt with no sleep, npm enable, or npm audit invocation.

GREEN `02ae08966b491570ba8f056ac04f1d0e2b285e2c` captures Corepack stderr and fails immediately on known provenance diagnostics. Follow-up `61713a2c8e2053476c400b8a16971e21dd0b7fac` aligns the classifier with the current Corepack source message `No compatible signature found in package metadata` while preserving older compatibility strings.

Current Corepack source throws `Signature does not match` when signature verification fails and separately throws `No compatible signature found in package metadata` when compatible package metadata signatures are unavailable. Those are trust/provenance decisions, not evidence of a transient registry timeout.

## Risks and claim boundary

Diagnostic matching depends on upstream text and therefore requires maintenance when Corepack changes its messages. The helper still fails closed after bounded exhaustion even when a new non-transient error is not recognized immediately. This mechanism does not prove package-manager authenticity by itself; authenticity remains Corepack's verification responsibility, while BandScope controls retry and fallback behavior around that boundary.

## Follow-up

- Keep the hostile signature-failure regression in the exact-head gate.
- If Corepack introduces a stable structured failure classification, replace message matching with that contract.
- Treat any newly observed integrity/signature diagnostic that retries as a repair finding, not as permission to broaden fallback behavior.

## References

Node.js contributors. (2026). *Corepack npm registry signature verification* [Source code]. GitHub. https://github.com/nodejs/corepack/blob/d4dcb1f89741603e776bba9d457425750fa26987/sources/npmRegistryUtils.ts

Node.js contributors. (2026). *Corepack 0.36.0* [Software release]. GitHub. https://github.com/nodejs/corepack/releases/tag/v0.36.0

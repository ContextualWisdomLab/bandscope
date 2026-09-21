# npm runtime acquisition mixed-diagnostic precedence

Status: Proposed

## Problem

BandScope retries the exact `corepack install --global` acquisition step only for the hosted-observed `ETIMEDOUT` transport condition. The existing classifier admitted a retry whenever the captured Corepack diagnostic contained `ETIMEDOUT`.

That rule was incomplete when one diagnostic contained both a timeout token and a trust/provenance failure. For example, an integrity or signature failure can be emitted together with transport context. Substring admission made the timeout token dominant, so the helper could sleep and retry even though the same diagnostic already established that the failure was not purely transient.

A retry is not equivalent to bypassing verification, but at this boundary it weakens the stated fail-closed policy: signature, integrity and package-manager metadata failures are deterministic trust failures and must never become retryable merely because the upstream diagnostic also mentions a timeout.

## Constraints

- `npm@10.9.9` plus its repository-pinned SHA-512 identity remains the only admitted package-manager runtime.
- Only `corepack install --global` may receive bounded retry.
- `ETIMEDOUT` remains the only transport token admitted by current hosted evidence.
- Signature, integrity, key-id, package-manager metadata, checksum and hash-mismatch diagnostics take precedence over the timeout token.
- Unknown failures still fail closed.
- The helper must stop before `corepack enable npm` or `npm run check:npm-runtime` on a trust/provenance failure.
- This repair does not disable Corepack verification, alter integrity keys, select another npm version, or add an npm/system fallback.

## RED and repair

RED `bc26032fd02033458912e26a897b4e7073301e3b` adds a deterministic Corepack fixture whose single diagnostic contains both `Integrity check failed` and `ETIMEDOUT`. The regression requires one acquisition attempt, no sleep, no `corepack enable`, no npm invocation, preserved upstream diagnostic text, and the existing `not classified as transient` refusal. The predecessor helper would admit the timeout branch and retry.

Repair `4cee8f5d4b0f7496fce959deefdce7912fcb8963` normalizes only for classification and checks trust/provenance markers before the timeout allowlist. Known provenance failure wins when both classes occur in one diagnostic. Pure `ETIMEDOUT` behavior and the existing three-attempt 5 s / 10 s backoff remain unchanged.

The test-only head was immediately followed by the production repair, so no hosted terminal RED is claimed for `bc26032f...`.

## Rejected alternatives

- Let any diagnostic containing `ETIMEDOUT` retry: rejected because a mixed diagnostic can already prove a non-transient trust failure.
- Disable or weaken Corepack signature/integrity verification: rejected because the availability problem is in BandScope's retry classification, not the trust check.
- Retry unknown failures and maintain only a small fatal blacklist: rejected because unknown is not evidence of transport transience.
- Broaden the transient allowlist to DNS, HTTP, connection-reset or other network-looking failures: rejected because current hosted evidence only supports `ETIMEDOUT`.
- Parse or evaluate diagnostic text as shell: rejected. Upstream text is untrusted evidence and remains data only.

## Claim boundary and residual risk

This is still a diagnostic-string classifier because the current Corepack command boundary does not provide a stable machine-readable failure taxonomy to this script. The precedence list therefore cannot prove semantic completeness for every future Corepack wording. A new provenance diagnostic that is not represented by the known markers may still require a focused regression and classifier update.

That residual risk is narrower than the repaired defect: a known trust/provenance marker can no longer be overridden by the admitted timeout token. If Corepack exposes a stable structured error code or typed result, BandScope should replace text classification rather than expand string heuristics indefinitely.

## Security Notes

The captured Corepack diagnostic is untrusted upstream text. It is written to stderr and inspected only as data for a bounded decision. It is never executed, interpolated into a command, or used to choose an alternate package-manager artifact. Trust/provenance evidence has precedence over retry availability.

## References

Node.js contributors. (2026, August 28). *Corepack 0.36.0* [Software release]. GitHub. https://github.com/nodejs/corepack/releases/tag/v0.36.0

Node.js contributors. (2026). *verifySignature fails when registry returns dist.signatures on package root but not on version endpoint* (Issue #808). GitHub. https://github.com/nodejs/corepack/issues/808

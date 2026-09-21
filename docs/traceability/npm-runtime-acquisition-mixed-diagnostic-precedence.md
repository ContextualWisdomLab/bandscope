# npm runtime acquisition mixed-diagnostic precedence

Status: Proposed

## Problem

BandScope retries the exact `corepack install --global` acquisition step only for the hosted-observed `ETIMEDOUT` transport condition. The existing classifier admitted a retry whenever the captured Corepack diagnostic contained `ETIMEDOUT`.

That rule was incomplete when one diagnostic contained both a timeout token and a trust/provenance failure. For example, an integrity or signature failure can be emitted together with transport context. Substring admission made the timeout token dominant, so the helper could sleep and retry even though the same diagnostic already established that the failure was not purely transient.

A retry is not equivalent to bypassing verification, but at this boundary it weakens the stated fail-closed policy: signature, integrity and package-manager metadata failures are deterministic trust failures and must never become retryable merely because the upstream diagnostic also mentions a timeout.

A later exact-head hosted run exposed a second, platform-specific defect in the same classifier. The helper lowercased diagnostics with Bash 4's `${parameter,,}` expansion. GitHub-hosted macOS executes the helper under the system `/bin/bash`, where that expansion is unsupported, so the classifier aborted with `bad substitution` before it could apply trust-first precedence or bounded timeout retry. Linux did not expose the defect because its hosted Bash supports the expansion. The classification contract therefore also requires a portable lowercase operation across the repository's supported hosted shells.

## Constraints

- `npm@10.9.9` plus its repository-pinned SHA-512 identity remains the only admitted package-manager runtime.
- Only `corepack install --global` may receive bounded retry.
- `ETIMEDOUT` remains the only transport token admitted by current hosted evidence.
- Signature, integrity, key-id, package-manager metadata, checksum and hash-mismatch diagnostics take precedence over the timeout token.
- Unknown failures still fail closed.
- The helper must stop before `corepack enable npm` or `npm run check:npm-runtime` on a trust/provenance failure.
- Diagnostic normalization must work on the hosted macOS Bash used by repository CI; shell-version-specific lowercase expansion is not part of the contract.
- This repair does not disable Corepack verification, alter integrity keys, select another npm version, or add an npm/system fallback.

## RED and repair

RED `bc26032fd02033458912e26a897b4e7073301e3b` adds a deterministic Corepack fixture whose single diagnostic contains both `Integrity check failed` and `ETIMEDOUT`. The regression requires one acquisition attempt, no sleep, no `corepack enable`, no npm invocation, preserved upstream diagnostic text, and the existing `not classified as transient` refusal. The predecessor helper would admit the timeout branch and retry.

Repair `4cee8f5d4b0f7496fce959deefdce7912fcb8963` normalizes only for classification and checks trust/provenance markers before the timeout allowlist. Known provenance failure wins when both classes occur in one diagnostic. Pure `ETIMEDOUT` behavior and the existing three-attempt 5 s / 10 s backoff remain unchanged.

The test-only head was immediately followed by the production repair, so no hosted terminal RED is claimed for `bc26032f...`.

### Hosted macOS portability RCA

Exact head `6763d9158cf93798f62d8e42c20ac400b7ca0a1d` produced a real hosted RED in `gate / ci / node-minimum-compatibility` on macOS. Node 22.22.2 setup, integrity-bound npm 10.9.9 acquisition, bundled tar verification, frozen Node dependency installation, Python dependency sync, Rust numeric-extension build, lint and typecheck all completed before the Python regression suite exercised the classifier. The mixed-integrity and unknown-failure tests then observed `/bin/bash: ${acquisition_output,,}: bad substitution`; timeout recovery stopped after one acquisition attempt for the same reason. This is a helper portability defect, not a Corepack/npm acquisition failure.

Linux on the same exact head independently reached the full Python suite with the helper operating normally and exposed only source-contract regressions: `test_node_runtime_contract.py` still expected the pre-integrity `npm@10.9.9` locator, while `test_npm_runtime_activation_resilience.py` still searched the helper source for uppercase `"ETIMEDOUT"` even though classification intentionally lowercases diagnostics before matching.

Repair `2a080035cb66ea1a5a4e1cf9b3682c1a23e35b29` replaces Bash-specific `${acquisition_output,,}` with `LC_ALL=C tr '[:upper:]' '[:lower:]'`. This keeps the diagnostic as data, preserves trust-first classification, and works under the hosted macOS Bash path exercised by CI.

Alignment `e3ecc44a873a44588855312ddcf4f96436d0f86b` removes the stale bare-version package-manager assertion from the Node/jsdom compatibility test. Exact package-manager artifact identity remains owned by `test_npm_package_manager_integrity_pin.py`, which asserts the full version-plus-SHA-512 locator; keeping a second bare-version assertion would encode a contradictory contract.

Regression update `4974765fd8145eb605637e8a84cf955441b8b3d7` changes the structural classifier assertion to the normalized lowercase `"etimedout"`, requires the portable `LC_ALL=C tr` path, and explicitly rejects reintroduction of `${acquisition_output,,}`. Behavioral fixtures continue to emit uppercase `ETIMEDOUT`, so case-insensitive runtime behavior remains exercised rather than being proven only by source text.

Because these commits move source after the hosted failure, `6763d915...` remains predecessor RED evidence only. A descendant is not GREEN until its own unchanged exact head completes the applicable repository and central gates.

## Rejected alternatives

- Let any diagnostic containing `ETIMEDOUT` retry: rejected because a mixed diagnostic can already prove a non-transient trust failure.
- Disable or weaken Corepack signature/integrity verification: rejected because the availability problem is in BandScope's retry classification, not the trust check.
- Retry unknown failures and maintain only a small fatal blacklist: rejected because unknown is not evidence of transport transience.
- Broaden the transient allowlist to DNS, HTTP, connection-reset or other network-looking failures: rejected because current hosted evidence only supports `ETIMEDOUT`.
- Parse or evaluate diagnostic text as shell: rejected. Upstream text is untrusted evidence and remains data only.
- Require a newer Bash on macOS merely to support `${parameter,,}`: rejected because the helper needs only ASCII case-folding for diagnostic tokens and can perform it portably without broadening runtime prerequisites.
- Duplicate the integrity-bound `packageManager` locator in the Node/jsdom compatibility test: rejected because package-manager artifact identity already has a dedicated canonical regression and duplicate assertions had drifted into contradiction.

## Claim boundary and residual risk

This is still a diagnostic-string classifier because the current Corepack command boundary does not provide a stable machine-readable failure taxonomy to this script. The precedence list therefore cannot prove semantic completeness for every future Corepack wording. A new provenance diagnostic that is not represented by the known markers may still require a focused regression and classifier update.

That residual risk is narrower than the repaired defect: a known trust/provenance marker can no longer be overridden by the admitted timeout token, and the normalization path no longer depends on a Bash feature absent from the hosted macOS shell. If Corepack exposes a stable structured error code or typed result, BandScope should replace text classification rather than expand string heuristics indefinitely.

## Security Notes

The captured Corepack diagnostic is untrusted upstream text. It is written to stderr and inspected only as data for a bounded decision. It is never executed, interpolated into a command, or used to choose an alternate package-manager artifact. Trust/provenance evidence has precedence over retry availability. `tr` receives the diagnostic only through stdin and a fixed translation table; it does not evaluate the diagnostic as shell syntax.

## References

Node.js contributors. (2026, August 28). *Corepack 0.36.0* [Software release]. GitHub. https://github.com/nodejs/corepack/releases/tag/v0.36.0

Node.js contributors. (2026). *verifySignature fails when registry returns dist.signatures on package root but not on version endpoint* (Issue #808). GitHub. https://github.com/nodejs/corepack/issues/808

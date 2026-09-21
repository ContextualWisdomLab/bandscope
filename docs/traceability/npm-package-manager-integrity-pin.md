# npm package-manager artifact integrity pin

Status: Proposed

## Problem

BandScope already pins npm `10.9.9`, rejects fallback to Node-bundled/system/latest npm, verifies the acquired npm version and bundled `tar` floor, and fails closed on unclassified Corepack acquisition errors. The remaining trust gap was narrower: root `package.json` named only `npm@10.9.9`, so the reviewed repository metadata selected an exact version but did not bind that selection to one exact package-manager artifact digest.

Corepack supports an integrity suffix in the `packageManager` locator. Its current documentation states that the hash is optional but strongly recommended as a security practice, and its test suite exercises `+sha512.<digest>` locators. Repository policy should therefore carry the artifact digest that Corepack is expected to verify instead of relying on a version-only locator plus post-acquisition version inspection.

This is defense in depth, not a claim that the previous path had no integrity protection. Corepack retains its own registry-signature/integrity checks. The repository-level hash adds an immutable reviewed artifact identity to BandScope's package-manager contract.

## Constraints

- npm `10.9.9` remains the only accepted package-manager version for this owner.
- The locator must use SHA-512 and exactly 128 lowercase hexadecimal digits.
- `devEngines.packageManager.version` remains `10.9.9`; the integrity suffix belongs to the Corepack `packageManager` locator, not the npm semantic version.
- `verify_npm_runtime.mjs` still verifies the executing npm version and bundled `tar` floor after acquisition; artifact pinning does not replace runtime postconditions.
- Retry remains limited to the exact Corepack acquisition step and positively identified `ETIMEDOUT`. Signature, integrity, policy, metadata, and unknown failures are not retryable.
- No bundled/system/latest npm fallback is introduced.
- No dependency version, lockfile dependency graph, application behavior, MIR behavior, release permission, or branch-protection threshold changes in this repair.

## Decision

The root manifest now pins:

`npm@10.9.9+sha512.d60fba8cb42f688b81e33c2f1cbef2ad7b977166700ec0ad057f1b6d60ea6ef2524abf673e20c35931cd8305d1dbb8887134d6eefdc0e7b8435bd458bf65b862`

`scripts/checks/activate_pinned_npm_runtime.sh` accepts only `npm@<major>.<minor>.<patch>+sha512.<128 hex>` package-manager locators before invoking `corepack install --global`. A version-only locator now fails before acquisition.

The SHA-512 digest corresponds to the npm `10.9.9` artifact integrity value `sha512-1g+6jLQvaIuB4zwvHL7yrXuXcWZwDsCtBX8bbWDqbvJSSr9nPiDDWTHNgwXR27iIcTTW7v3A57hDW9RYv2W4Yg==` when represented in hexadecimal. The final authority remains actual Corepack verification on the exact hosted head; the encoded value is not treated as GREEN merely because it is documented here.

## RED → repair lineage

- RED `fb73bc99db83e9c1e243cb45a9d095fd229cd20e` adds a focused regression requiring the exact integrity-bound npm locator and a helper boundary that rejects version-only package-manager locators. The predecessor source fails both assertions.
- Repair `29361c98a88472007893cea3949f4444bf0f4f76` changes the root manifest from a version-only npm locator to the reviewed SHA-512 locator.
- Repair `f0a0c42ef98018b65f96486eab37f673e1189731` makes the canonical activation helper require an integrity-bound SHA-512 locator before Corepack acquisition.
- Regression alignment `bbcdd3134ecc6edc7b994a546859006b49cbe5a5`, `8feed8ac6fdef76f3aaf9d8a3059540dd649331b`, and `ae078569857d66c49708c5fcdd822cf916b43106` update the deterministic activation harness and existing npm toolchain contract to exercise the hashed locator rather than a retired version-only test fixture.

No hosted RED is claimed for the test-only head because the causal repair followed before terminal hosted evidence. Fresh exact-head workflow results after this documentation commit are required.

## Rejected alternatives

- Keep `npm@10.9.9` only: rejected because it pins semantic version but leaves the repository manifest without the artifact digest Corepack can validate.
- Replace Corepack verification with a home-grown tarball downloader/hash checker: rejected because it would duplicate package-manager acquisition and signature/integrity ownership.
- Accept arbitrary `+sha*` text: rejected because an unbounded algorithm/length grammar weakens the reviewed contract. This owner currently standardizes on SHA-512.
- Derive the hash dynamically from the registry at CI runtime: rejected because mutable network metadata would become the authority for what the repository intended to trust.
- Retry integrity mismatch: rejected because a deterministic trust failure is not a transient availability event.

## Evidence and claim boundary

The source contract proves only that BandScope records and requires one expected SHA-512 locator before Corepack acquisition. Hosted acceptance still requires Corepack to acquire that exact locator successfully, the canonical runtime verifier to report npm `10.9.9` with the required bundled `tar`, frozen `npm ci` to succeed, and all applicable current-head CI/security/SBOM/SAST/CodeQL gates to settle.

A future intentional npm upgrade must update the semantic version, artifact digest, deterministic regressions, and this traceability record together. A digest-only change without an explicit package-manager review is a supply-chain finding.

## Security Notes

The package-manager locator is repository-owned policy data, not user input. The helper validates its grammar before passing it as one quoted argument to Corepack. No shell evaluation is introduced. Corepack remains responsible for acquisition and its own upstream verification; BandScope constrains which artifact identity it is willing to request and keeps post-acquisition runtime verification as a second boundary.

## References

Node.js contributors. (2026). *Corepack README: Configuring a package* [Documentation]. GitHub. https://github.com/nodejs/corepack/blob/d4dcb1f89741603e776bba9d457425750fa26987/README.md

Node.js contributors. (2026). *Corepack tests: SHA-512 packageManager locator handling* [Source code]. GitHub. https://github.com/nodejs/corepack/blob/d4dcb1f89741603e776bba9d457425750fa26987/tests/Use.test.ts

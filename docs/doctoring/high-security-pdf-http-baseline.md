# High-security PDF and HTTP dependency baseline

## Decision

BandScope treats the PDF parser, its transitive HTTP client, and the package-manager runtime that materializes their reviewed lock as one security-release boundary:

- `pdfjs-dist` is pinned exactly to `6.2.108`;
- `undici` is pinned exactly to `7.29.1` through the root npm override; and
- npm `10.9.9` is the approved generator for reviewed root-workspace dependency updates. Primary CI activates that project-pinned npm through Node-bundled Corepack, verifies npm's own bundled `tar` is at least `7.5.19`, and only then consumes the committed lock through frozen validation rather than re-resolving it.

Repository dependency/security tooling reported the protected-base `pdfjs-dist@6.1.200` as requiring a newer floor. That finding is kept distinct from the older, GitHub-reviewed CVE-2024-4367 / GHSA-wgrm-67xf-hhpq: the 2024 advisory affected `pdfjs-dist <=4.1.392` and was fixed in `4.2.67`, so it is historical parser-risk context and is **not** evidence that `6.1.200` was affected by that CVE. BandScope pins the current `6.2.108` artifact selected by the repository security baseline and requires current-head audit/security evidence rather than misattributing a scanner result to an unrelated advisory.

PDF.js `6.2.108` no longer exposes the legacy `isEvalSupported` member in its public `DocumentInitParameters` contract, and `getDocument` no longer reads that member. BandScope therefore does not cast or pass an unknown option that would be ignored while creating false assurance. The parser boundary is reinforced by a narrow data-only call, copied caller-owned bytes, a same-origin bundled worker, explicit `enableXfa: false`, and explicit `useWorkerFetch: false`.

```mermaid
flowchart LR
    A[Validated local PDF bytes] --> B[Copied Uint8Array]
    B --> D[Data-only DocumentInitParameters]
    D --> X[XFA disabled]
    D --> F[Worker helper fetch disabled]
    X --> C[pdfjs-dist 6.2.108]
    F --> C
    C --> W[Same-origin bundled worker]
    W --> R[Canvas render]
    J[jsdom development path] --> U[undici 7.29.1 override]
    N[Corepack-activated npm 10.9.9] --> T[verify bundled tar >= 7.5.19]
    T --> L[Reviewed package-lock artifact]
    L --> V[npm ci frozen validation]
    V --> C
    V --> U
```

## Threat boundary

The score viewer accepts only bytes already copied into the app-owned workspace through the native PDF intake boundary. It does not accept a URL, credentials, custom request headers, or a remote worker. It also disables XFA rendering and PDF.js worker-side fetching of helper resources at this wrapper boundary. These controls prevent the caller from selecting an attacker-controlled document origin or worker asset and make the intended no-XML-form/no-worker-fetch policy explicit rather than relying on upstream defaults.

PDF bytes remain untrusted after the native magic-byte, size, and path checks. Parser vulnerabilities, malformed object graphs, embedded actions, metadata/XML parsing, and resource-exhaustion paths can still occur inside a syntactically valid PDF. The exact dependency lock, copied data-only input, explicit parser options, same-origin worker, and existing native intake limits therefore remain mandatory for locally selected files.

The pinned PDF.js XML parser does not expose an external-entity resolver through this wrapper: its default `onDoctype()` hook is a no-op, and `onResolveEntity()` resolves only the built-in XML entities before returning an unknown named entity literally. This source-level observation narrows what BandScope can claim; it is not a general assertion that every future PDF.js XML path is immune to entity-processing defects. Any parser upgrade must re-check the upstream implementation and repeat adversarial PDF verification.

Undici is currently a development dependency reached through jsdom, but development and CI parsers process attacker-controlled fixtures, generated HTML, and network-like request bodies. A dev-only label does not make header injection, shared-cache disclosure, retry desynchronization, or cookie-attribute injection acceptable in the trusted build boundary.

The package-manager runtime is also part of that build trust boundary. npm `10.9.8` bundled `tar 7.5.11`, which falls inside GitHub-reviewed GHSA-23hp-3jrh-7fpw / CVE-2026-59873 (`tar <=7.5.18`). npm `10.9.9` updates its bundled tar to `7.5.22`. BandScope therefore rejects the previous generator runtime rather than relying on `--ignore-scripts`: archive extraction occurs before lifecycle-script policy can make a vulnerable tar implementation safe.

## Security Notes: Undici patch scope

GHSA-w293-vg96-wgc3 / CVE-2026-84961 affects Undici `>=7.24.1 <7.29.1` when `BalancedPool` receives function-valued `connect` or legacy `tls` options. Its JSON clone could discard custom certificate validation or connector callbacks. The official `7.29.1` release identifies fix `f690157d728508652fef14673630c71515123e96`, which preserves these options outside the clone and isolates object-valued options from caller mutation. This is a specific callback-preservation fix, not proof of universal TLS safety or a claim that BandScope exercised end-to-end TLS.

This updates the existing MIT-licensed, dev-only Undici dependency/override used by jsdom; it adds no direct package, production network path, URL/IPC permission, logging, or credential handling. Existing untrusted-fixture and PDF intake boundaries remain unchanged, and `pdfjs-dist 6.2.108` stays pinned. Exact artifact/SRI, Vitest/coverage pairing, peer metadata, and frozen consumption tests fail closed. The official registry tarball (`400243` bytes) was downloaded and independently SHA-512 checked against the complete generated lock; the SRI is `sha512-RYONW2MeafgYlkVOKYKkA/Ag7BmXqgIWCa8t1m0JcxrQg9pI9lEqRhAOruOBCbAohOa/gkCF+iPi9hrgvTzu6Q==`.

Local frozen install, runtime provenance, installed full dev/root graph, Undici and Vitest/coverage graph, 236 frontend tests with measured coverage, workspace typecheck/lint/build, and nine stdlib-only dependency/toolchain contracts pass. These are working-tree repair results on original head `32f23a8161a0350dd8e3bb512416cbe1d4976a24`, not hosted exact-new-head approval. The full dev/root audit remains **FAILED**: five package findings (two high, three moderate), including inherited brace-expansion/minimatch and Vitest/mocker/coverage findings; Undici has no finding. Those unchanged artifacts require separate owner remediation, not ignores or audit-fix here.

The installed macOS graph passes `npm ls --all`, but npm's all-platform lock-only CycloneDX generation remains **FAILED** with `ESBOMPROBLEMS`: inherited `@emnapi/core@1.9.2` and `runtime@1.9.2` do not meet `^1.11.1`, and `wasi-threads@1.2.1` does not meet `^1.2.2` required by optional `@tailwindcss/oxide-wasm32-wasi@4.3.3`. Existing Trivy `0.74.0` generates an offline, dev-inclusive CycloneDX `1.7` lock inventory with **504 components**, including Undici `7.29.1`; the count is recomputed from this repair artifact, not reused from the predecessor. This license/package inventory is not a vulnerability scan, hosted Actions/release artifact, complete bundled-binary inventory, or substitute for resolving that metadata and passing hosted SBOM/security gates. No native/GPU/full scientific Python run or protected-branch enforcement is claimed.

## Strix finding adjudication boundary

Strix run `31871388084` on predecessor head `6f81f52c193c1e327d078eba7a2ea3bdbfbc87c2` reported a possible XXE path through `loadScorePdf`. Its attached proof-of-concept returned only a four-byte `%PDF` prefix and stated that construction of an actual PDF containing the alleged XML payload remained necessary. It did not demonstrate entity expansion, local-file disclosure, a network request, or parser output containing an external entity.

The finding was therefore not suppressed and was not treated as proven exploitation. Instead, the exact dependency source was inspected and the wrapper was hardened at the narrowest supported API boundary: XFA rendering and worker-side helper fetching are now explicitly disabled and regression-locked. A fresh exact-head Strix result remains mandatory; a predecessor report, whether pass or fail, is not transferable merge evidence.

## Lockfile provenance

The 2026-10-04 repair uses Node `22.23.3`, approved npm `10.9.9`, and its verified bundled `tar 7.5.22`. Both workspace Vitest requirements are restored to inherited `^4.1.10`, matching the existing coverage provider; removal of the unrelated Vitest 5 major is a reviewed scope decision for this HTTP-only diff, not a permanent ban on coordinated upgrades or a requirement to retain `4.1.10`. The complete base lock from `314ddeae7b775a4957594b599358c8255617eb2e` (Git blob `1b2ceef69c15945b29b7b38b85bb773bdf3c7319`) is the coherent seed. `npm install --package-lock-only --include=dev --ignore-scripts --no-audit --no-fund` generates the complete artifact. Compared with that base, all 509 location records remain: only the root Undici intent and the Undici version/tarball/SRI change (four changed lines). No added nested nodes or unrelated peer changes remain; all 26 root `@esbuild/*` records retain `peer: true`. No lock record was manually serialized. Primary CI still consumes the frozen artifact rather than repeating mutable resolution.

For every current head, primary CI instead:

1. sets up Node `22.22.3` while keeping the public `>=22.13 <23` runtime contract unchanged;
2. explicitly enables Corepack's npm shim so `packageManager: npm@10.9.9` controls the executable package manager;
3. verifies npm `10.9.9` and reads that runtime's own bundled `tar` package, rejecting anything below `7.5.19`;
4. runs `npm ci --ignore-scripts --no-audit --no-fund` in the dedicated lock-validation job;
5. rejects any `package.json` or `package-lock.json` working-tree drift; and
6. proceeds to normal repository verification only after the frozen lock is consumable by the approved runtime.

Future dependency updates must use npm `10.9.9` to generate the complete lock in a dedicated update branch, review the entire resulting manifest/lock diff, and then prove frozen consumption on the resulting exact head. No tarball URL, SRI, dependency range, `peer` classification, or workspace record may be hand-edited merely to satisfy a validator.

The lock contract requires the exact public-registry tarball and SHA-512 SRI for patched application packages and requires every existing `node_modules/@esbuild/*` location to retain the approved generator's `peer: true` classification. This distinguishes the intended security graph from unrelated Dependabot generator churn. The narrower provenance and validation contract is specified in `docs/doctoring/npm-lockfile-generator-provenance.md`.

## Vitest/coverage coherence contract correction

The baseline no longer permanently asserts manifest `^4.1.10`, installed `4.1.10`, or coverage peer `4.1.10`. `test_vitest_coverage_graph_is_coherent` reads the real repository graph and requires each workspace's runner/coverage requirements to match, its complete locked `devDependencies` to match the manifest, and every installed runner and coverage record to share one stable exact version. That version must satisfy each workspace requirement and the coverage provider's exact `vitest` peer. Missing, null, empty, malformed, out-of-range, mismatched-major, and nested-version-drift inputs fail closed. This is graph coherence, not vulnerability clearance.

The tested range contract is deliberately limited to stable positive-major `^x.y.z` workspace requirements and stable exact `x.y.z` installed versions/exact coverage peers, matching the existing schema. It is not a general npm-semver parser; alternative range or peer syntax requires explicit test-contract review. A coordinated major is not permanently forbidden by this contract, but any actual manifest/lock update still needs normal dependency-diff review and security gates.

An isolated, deep-copied manifest/lock fixture, supplied through monkeypatched `_read_json`, changes the runner and coverage schema to `4.1.11` with either inherited `^4.1.10` or coordinated `^4.1.11` requirements. The original contract rejected the coordinated fixture in an actual RED run; the corrected contract accepts both in GREEN runs. Fixed unit-fixture versions do not pin the repository graph: negative scenarios use isolated copies, and the unpatched real-graph test remains mandatory. No repository manifest/lock is rewritten by these scenarios, and no `4.1.11` runtime was installed or executed by this correction. The actual lane remains on inherited `4.1.10`; canonical PR #1134 owns the real `4.1.11` update. The existing full audit remains **FAILED**, and the npm SBOM failure above remains unresolved. The earlier nine-contract result is historical; the expanded isolated baseline/toolchain verification is separate evidence, not a fresh frontend, audit, SBOM, or hosted approval claim.

## Verification

The merge gate includes:

- exact manifest and lock artifact tests;
- npm `10.9.9` plus bundled `tar >=7.5.19` runtime provenance before every primary CI dependency-consumption step;
- a direct PDF.js wrapper test proving copied bytes, the locally bundled worker, `enableXfa: false`, `useWorkerFetch: false`, and no URL-bearing initialization member;
- TypeScript compilation against the installed PDF.js `DocumentInitParameters` rather than an unsafe cast;
- valid and malformed local score-PDF component tests;
- desktop lint, strict typecheck, complete measured tests, and production build;
- Tauri/Rust checks and native PDF intake regressions;
- `npm audit --workspaces --audit-level=high` with no high finding;
- repository SAST, CodeQL, security scan, secret scan, SBOM, and dependency evidence;
- current-head Strix evidence rather than predecessor-head scanner output;
- current-head central coverage and automated review;
- zero unresolved actionable threads and a qualifying independent non-author approval; and
- normal branch protection without administrative bypass.

## Failure, rollback, and incident evidence

On a failed frozen-lock validation, npm runtime-provenance failure, or parser regression, preserve the exact head SHA, Node/npm/bundled-tar versions, original lock blob SHA, test output, audit report, and workflow run ID. If the incident concerns a dependency-generation change, also preserve the generated complete lock and the generation environment/configuration. Do not merge a partially updated graph and do not bypass the package-manager runtime check.

Rollback restores the previous desktop manifest, root override, complete lock, PDF loader, tests, and CHANGELOG entry together. Because the previous dependency graph or package-manager runtime may contain known security findings, rollback is an emergency availability action only and requires an explicit security exception, compensating controls, owner, expiration, and immediate replacement plan.

## References

GitHub. (2024). *PDF.js vulnerable to arbitrary JavaScript execution upon opening a malicious PDF* (GHSA-wgrm-67xf-hhpq) [Security advisory]. https://github.com/advisories/GHSA-wgrm-67xf-hhpq

GitHub. (2026). *node-tar: Decompression/parse DoS via unlimited input* (GHSA-23hp-3jrh-7fpw; CVE-2026-59873) [Security advisory]. https://github.com/advisories/GHSA-23hp-3jrh-7fpw

Mozilla. (2026). *Document initialization parameters in PDF.js 6.2.108* [Source code]. GitHub. https://github.com/mozilla/pdf.js/blob/v6.2.108/src/display/api.js

Mozilla. (2026). *PDF.js XML parser in version 6.2.108* [Source code]. GitHub. https://github.com/mozilla/pdf.js/blob/v6.2.108/src/core/xml_parser.js

Mozilla. (2026). *PDF.js 6.2.108* [Software release]. https://github.com/mozilla/pdf.js/releases/tag/v6.2.108

Node.js contributors. (2026). *Corepack* [Software documentation]. GitHub. https://github.com/nodejs/corepack

Node.js contributors. (2026). *Undici 7.29.1* [Software release]. GitHub. https://github.com/nodejs/undici/releases/tag/v7.29.1

Node.js contributors. (2026). *TLS certificate validation bypass via dropped connect options in BalancedPool* (GHSA-w293-vg96-wgc3; CVE-2026-84961) [Security advisory]. GitHub. https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3

Node.js contributors. (2026). *Preserve BalancedPool connection options* [Patch source]. GitHub. https://github.com/nodejs/undici/commit/f690157d728508652fef14673630c71515123e96

npm, Inc. (2026). *npm 10.9.9* [Software release]. GitHub. https://github.com/npm/cli/releases/tag/v10.9.9

npm, Inc. (2026). *npm ci*. npm Docs. https://docs.npmjs.com/cli/v10/commands/npm-ci/

npm, Inc. (2026). *package-lock.json*. npm Docs. https://docs.npmjs.com/cli/v10/configuring-npm/package-lock-json/

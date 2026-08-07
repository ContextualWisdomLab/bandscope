# High-security PDF and HTTP dependency baseline

## Decision

BandScope treats the PDF parser and its transitive HTTP client as one security-release boundary:

- `pdfjs-dist` is pinned exactly to `6.2.108`;
- `undici` is pinned exactly to `7.29.0` through the root npm override; and
- the complete npm workspace lock is generated only by the repository-pinned npm `10.9.8` workflow and imported unchanged from the workflow artifact.

PDF.js `6.2.108` no longer exposes the legacy `isEvalSupported` member in its public `DocumentInitParameters` contract, and `getDocument` no longer reads that member. BandScope therefore does not cast or pass an unknown option that would be ignored while creating false assurance. The primary remediation is the patched parser release, reinforced by a narrow data-only call, copied caller-owned bytes, and a same-origin bundled worker.

```mermaid
flowchart LR
    A[Validated local PDF bytes] --> B[Copied Uint8Array]
    B --> D[Data-only DocumentInitParameters]
    D --> C[pdfjs-dist 6.2.108]
    C --> W[Same-origin bundled worker]
    W --> R[Canvas render]
    J[jsdom development path] --> U[undici 7.29.0 override]
    N[npm 10.9.8] --> L[Exact package-lock artifact]
    L --> C
    L --> U
```

## Threat boundary

The score viewer accepts only bytes already copied into the app-owned workspace through the native PDF intake boundary. It does not accept a URL, credentials, custom request headers, or a remote worker. This prevents a PDF from selecting an attacker-controlled fetch origin or script asset.

PDF bytes remain untrusted after the native magic-byte, size, and path checks. Parser vulnerabilities, malformed object graphs, embedded actions, and resource-exhaustion paths can still occur inside a syntactically valid PDF. The patched parser, exact dependency lock, copied data-only input, same-origin worker, and existing native intake limits therefore remain mandatory for locally selected files.

Undici is currently a development dependency reached through jsdom, but development and CI parsers process attacker-controlled fixtures, generated HTML, and network-like request bodies. A dev-only label does not make header injection, shared-cache disclosure, retry desynchronization, or cookie-attribute injection acceptable in the trusted build boundary.

## Lockfile provenance

The security manifests are changed before the lock. The exact branch workflow then:

1. verifies Node `22.22.3` and npm `10.9.8`;
2. runs `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`;
3. uploads the generated `package-lock.json` under a head-SHA-bound artifact name; and
4. fails while the generated lock differs from the branch.

The maintainer imports that generated artifact byte-for-byte and reruns the workflow. The second run must produce a clean diff. No tarball URL, SRI, dependency range, `peer` classification, or workspace record is edited by hand.

The lock contract requires the exact public-registry tarball and SHA-512 SRI for both patched packages and requires every existing `node_modules/@esbuild/*` location to retain npm 10.9.8's `peer: true` classification. This distinguishes the intended security graph from unrelated Dependabot generator churn.

## Verification

The merge gate includes:

- exact manifest and lock artifact tests;
- a direct PDF.js wrapper test proving copied bytes, the locally bundled worker, and an exact data-only initialization object;
- TypeScript compilation against the installed PDF.js `DocumentInitParameters` rather than an unsafe cast;
- valid and malformed local score-PDF component tests;
- desktop lint, strict typecheck, complete measured tests, and production build;
- Tauri/Rust checks and native PDF intake regressions;
- `npm audit --workspaces --audit-level=high` with no high finding;
- repository SAST, CodeQL, security scan, secret scan, SBOM, and dependency evidence;
- current-head central coverage and automated review;
- zero unresolved actionable threads and a qualifying independent non-author approval; and
- normal branch protection without administrative bypass.

## Failure, rollback, and incident evidence

On a failed lock replay or parser regression, preserve the exact head SHA, Node/npm versions, generated-lock artifact ID and digest, original and generated lock blob SHA, test output, audit report, and workflow run ID. Do not merge a partially updated graph.

Rollback restores the previous desktop manifest, root override, complete lock, PDF loader, tests, and CHANGELOG entry together. Because the previous graph contains known high findings, rollback is an emergency availability action only and requires an explicit security exception, compensating controls, owner, expiration, and immediate replacement plan.

## References

GitHub. (2026). *PDF.js vulnerable to arbitrary JavaScript execution upon opening a malicious PDF* (GHSA-hq66-cqwq-w95j) [Security advisory]. https://github.com/advisories/GHSA-hq66-cqwq-w95j

Mozilla. (2026). *Document initialization parameters in PDF.js 6.2.108* [Source code]. GitHub. https://github.com/mozilla/pdf.js/blob/v6.2.108/src/display/api.js

Mozilla. (2026). *PDF.js 6.2.108* [Software release]. https://github.com/mozilla/pdf.js/releases/tag/v6.2.108

Node.js contributors. (2026). *Undici 7.29.0* [Software release]. https://github.com/nodejs/undici/releases/tag/v7.29.0

npm, Inc. (2026). *npm ci*. npm Docs. https://docs.npmjs.com/cli/v11/commands/npm-ci/

npm, Inc. (2026). *package-lock.json*. npm Docs. https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/

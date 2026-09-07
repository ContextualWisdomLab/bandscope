# npm lockfile generator provenance

## Decision

BandScope records npm `10.9.9` as the approved generator for root workspace dependency updates. The root manifest records that decision through:

- `packageManager: npm@10.9.9` as package-manager selection metadata; and
- `devEngines.packageManager` with `onFail: error` as npm's source-tree command gate.

The npm version is intentionally not repeated under `engines`. npm serializes `engines` into the root lock package, so adding an npm-only source-tool constraint there creates lock metadata churn unrelated to dependency resolution. `devEngines` and the explicit CI assertion enforce the approved generator while the published `engines.node` range remains the runtime compatibility contract.

Primary CI does **not** regenerate or update `package-lock.json`. It uses Node `22.22.3`, enables the npm shim supplied by the Node-bundled Corepack, resolves the project-pinned npm `10.9.9`, verifies that exact npm runtime and its own bundled `tar` package before dependency consumption, and validates the committed lock with `npm ci --ignore-scripts --no-audit --no-fund`. The gate then rejects any manifest or lockfile working-tree change. The normal verification jobs repeat the same runtime provenance gate before the repository's reviewed `npm ci` installation.

The Node runtime support decision remains separate. This change does not raise the public `>=22.13 <23` Node range; a coordinated Node-floor migration is tracked independently.

## Why the npm runtime was advanced

The prior approved npm `10.9.8` bundled `tar 7.5.11`. GitHub's reviewed advisory GHSA-23hp-3jrh-7fpw / CVE-2026-59873 marks `tar <=7.5.18` affected by an unbounded decompression/parse denial-of-service vulnerability and records `7.5.19` as the patched floor. npm `10.9.9` updates its bundled `tar` to `7.5.22`.

The Node 22 distribution line still bundled npm `10.9.8` when this repair was made, so merely advancing the Node 22 patch selector did not remove the vulnerable package-manager runtime. BandScope therefore keeps the supported Node 22 contract and activates the repository-pinned npm `10.9.9` through bundled Corepack before any `npm ci` step. `scripts/checks/verify_npm_runtime.mjs`, executed through that npm runtime, locates the running npm package via `npm_execpath`, verifies npm `10.9.9`, reads npm's own `node_modules/tar/package.json`, and rejects a tar version below `7.5.19` before dependency extraction is allowed.

This is a package-manager execution boundary, not an application dependency override. BandScope does not add `tar` to the application graph or suppress the advisory.

## Why generator provenance still matters

npm documents `package-lock.json` as the location-keyed description of the exact dependency tree. Lockfile version 3 is intended for npm 9 and newer. npm also notes that package-manager versions and tree-shaping configuration can affect the generated dependency graph and metadata. Dependency updates therefore use the reviewed npm `10.9.9` toolchain, and reviewers examine the complete generated lock diff together with its manifest change.

That provenance is distinct from CI validation. `npm ci` is the immutable consumption path: it requires a lockfile, rejects manifest/lock dependency disagreement, removes an existing `node_modules`, and never writes the manifest or lock. CI relies on that frozen behavior instead of running `npm install`, `npm update`, or `npx` commands that may perform mutable resolution.

The repository additionally requires a Subresource Integrity value for every package-lock entry resolved from the public npm registry. npm documents `integrity` as the SHA-512 or SHA-1 SRI string for the artifact unpacked at that location.

The root lock also retains `peer: true` on the platform-specific `node_modules/@esbuild/*` records produced by the approved tree. Multiple dependency-update branches generated with a different serialization path were observed removing those markers even when the requested package change was unrelated to esbuild. Because frozen `npm ci` consumes rather than regenerates the lock, ordinary frozen-install validation alone cannot prove that this generator-sensitive metadata was preserved. The repository therefore treats those markers as a regression sentinel: a dependency PR that strips them must be regenerated with the approved npm toolchain rather than normalizing the unrelated churn by hand.

```mermaid
flowchart LR
    M[package.json dependency intent] --> C[Corepack enables project-pinned npm 10.9.9]
    C --> R[verify npm 10.9.9 and bundled tar >= 7.5.19]
    R --> G[approved npm update toolchain]
    G --> L[reviewed package-lock.json v3]
    L --> V[npm ci frozen validation, lifecycle disabled]
    V --> D{manifest or lock drift?}
    D -->|yes| F[fail closed]
    D -->|no| S[verify SRI and generator-sensitive metadata]
    S --> N[normal npm ci and repository checks]
```

## Security and operational boundary

- Every primary CI job that consumes npm dependencies activates the project-pinned npm runtime and runs `check:npm-runtime` before its first `npm ci`.
- The runtime check fails closed unless the executing npm is exactly `10.9.9` and its own bundled `tar` is at least `7.5.19`.
- CI lock validation must not run `npm install`, `npm update`, `npx`, or another mutable dependency-resolution command.
- Dependency PRs change manifest intent and the complete lock artifact produced by the approved npm `10.9.9` update toolchain; reviewers reject unexplained lock churn rather than hand-editing records.
- Platform-specific root `@esbuild/*` lock records must retain their expected `peer: true` metadata. Missing markers are treated as generator drift, not as an acceptable side effect of an unrelated dependency update.
- The lock-validation job disables dependency lifecycle scripts. The normal clean install retains the repository's reviewed execution behavior.
- Registry-resolved package records require SRI evidence in the committed lock.
- Install-shaping flags that affect the dependency tree, such as `legacy-peer-deps` or `install-links`, must be committed in project configuration and applied consistently to generation and `npm ci`.
- The root `package-lock.json` remains the sole npm workspace lock. Nested workspace locks are prohibited.

`packageManager` alone is not the enforcement boundary for npm because Node distributions do not enable Corepack's npm shim by default. Enforcement is provided by explicit `corepack enable npm`, npm `devEngines`, the exact runtime/tar provenance check, the frozen `npm ci` contract, and repository tests that prohibit mutable resolution in the lock gate.

## Verification

`services/analysis-engine/tests/test_npm_toolchain_contract.py` verifies:

1. the manifest's approved npm metadata and Node/runtime separation;
2. the exact Node/npm identity used by primary CI;
3. Corepack activation and npm runtime/tar verification before every primary npm dependency-consumption step;
4. frozen `npm ci` lock validation with lifecycle execution disabled;
5. absence of `npm install`, `npm update`, and `npx` from the lock-validation job;
6. a clean manifest/lock working tree after validation;
7. package-lock version 3;
8. SRI evidence for every public npm-registry artifact in the root lock; and
9. preservation of `peer: true` on every root `node_modules/@esbuild/*` platform record.

The exact PDF.js and Undici baseline is covered separately by `test_high_security_dependency_baseline.py` and the desktop PDF loader tests.

A dependency update is mergeable only after the updated manifest and complete generated lock are reviewed together and the exact current head passes npm runtime provenance, frozen lock validation, normal install, lint, strict typecheck, measured tests, production build, Rust/Tauri checks, security/supply-chain gates, current review, independent approval, and branch protection without bypass.

## Claim boundary

CI proves that the committed manifest and lock can be consumed as a frozen pair by the approved toolchain, that the npm runtime used for dependency extraction is the reviewed version with a non-vulnerable bundled tar floor, that public-registry lock entries carry integrity evidence, and that the known generator-sensitive `@esbuild/*` peer markers remain present. It does **not** claim that resolving mutable manifest ranges again at a later time will reproduce byte-identical lock metadata. When a dependency update is needed, npm `10.9.9` remains the approved generator and its entire resulting lock diff is review evidence.

## Incident response and rollback

When an update produces unexpected lock churn or npm runtime provenance fails:

1. preserve the exact head SHA, npm, bundled tar and Node versions, project npm configuration, original lock blob SHA, generated lock, and relevant CI run IDs;
2. determine whether manifest intent, npm, project configuration, registry metadata, transitive dependency resolution, or the package-manager runtime changed;
3. never accept a partial or hand-edited lock or disable the runtime check to satisfy a validator;
4. regenerate the complete lock in a dedicated update branch using the reviewed npm version, then review the full diff before relying on it; and
5. if rollback is necessary, restore the prior manifest and complete lock together, then rerun the entire exact-head gate. Do not roll back to a package-manager runtime with a known unfixed extraction vulnerability without an explicit temporary security exception.

## References

GitHub. (2026). *node-tar: Decompression/parse DoS via unlimited input* (GHSA-23hp-3jrh-7fpw; CVE-2026-59873) [Security advisory]. https://github.com/advisories/GHSA-23hp-3jrh-7fpw

Node.js contributors. (2026). *Corepack* [Software documentation]. GitHub. https://github.com/nodejs/corepack

npm, Inc. (2026). *npm 10.9.9* [Software release]. GitHub. https://github.com/npm/cli/releases/tag/v10.9.9

npm, Inc. (2026). *npm ci*. npm Docs. https://docs.npmjs.com/cli/v10/commands/npm-ci/

npm, Inc. (2026). *package-lock.json*. npm Docs. https://docs.npmjs.com/cli/v10/configuring-npm/package-lock-json/

npm, Inc. (2026). *package.json*. npm Docs. https://docs.npmjs.com/cli/v10/configuring-npm/package-json/

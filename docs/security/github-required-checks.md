# BandScope GitHub Required Checks

## Intended required checks

These are the merge-gate status checks that should be required on protected branches.

### `develop`

- `ci / build-and-test`
- `dependency-review`
- `security-audit`
- `CodeQL`
- `trivy-fs-scan`
- `sbom`
- `release-preflight`
- `gate / build / windows`
- `gate / build / macos`

`gate / build / windows` must cover both Windows `amd64` and Windows `arm64`.
`gate / build / macos` must cover both macOS Intel (`amd64`) and macOS `arm64`.

### `main`

- `ci / build-and-test`
- `dependency-review`
- `security-audit`
- `CodeQL`
- `trivy-fs-scan`
- `sbom`
- `release-preflight`
- `gate / build / windows`
- `gate / build / macos`

## GitHub settings baseline

These are required repository settings or GitHub security features, not branch status-check names.

- Dependabot alerts: required
- Dependabot security updates: required
- Dependency graph: required
- Dependency submission coverage: required where GitHub supports it for the repository setup
- Dependency review gate on PRs: required
- CodeRabbit review request and review-equivalent policy: required

## Workflow-managed baseline

These controls are expressed by repo workflows and are expected to be connected as intended required checks or release evidence.

- `supply-chain-inventory`: supplemental validation baseline
- `gate / build / windows`: intended required check
- `gate / build / macos`: intended required check
- per-architecture desktop artifacts: required for Windows amd64/arm64 and macOS amd64/arm64
- Windows build jobs: antivirus baseline evidence required before packaging
- release-time SBOM artifact retention: required baseline
- release-time supplemental inventory retention: required baseline

## Release evidence baseline

- CycloneDX JSON SBOM must be uploaded as a GitHub Actions artifact
- CycloneDX JSON SBOM must be attached to the GitHub Release before publication by the tag-driven draft release flow
- `supply-chain/supplemental-component-inventory.json` must be uploaded as a GitHub Actions artifact and attached to the GitHub Release before publication
- packaged desktop artifacts and checksums must remain traceable from the same release record when the release workflow emits them
- release artifacts should include explicit OS/arch naming for Windows amd64, Windows arm64, macOS amd64, and macOS arm64
- workflows must not attach assets in response to `release: published`; immutable releases reject post-publication mutation

## Enforcement note

The files in this repository define the workflows and the intended check names.
Actual branch protection, required checks, and GitHub security feature activation must be enforced in the GitHub repository settings or rulesets with repository admin permissions.

## CodeRabbit enforcement note

BandScope still requests CodeRabbit on PRs and treats it as the default AI review path.
However, the hosted `CodeRabbit` status context has shown repeated stale `PENDING` and stale `CHANGES_REQUESTED` states after all actionable review was cleared.
Because of that operational behavior, protected branches require the stable repository-owned checks above rather than the external `CodeRabbit` status context itself.

## Review-equivalent evidence

Review evidence is evaluated separately from required checks and conversation resolution. Before a
protected-branch merge, the exact current PR head SHA must have at least one of these durable review
artifacts:

- a completed CodeRabbit review whose artifact identifies the exact current PR head SHA or its
  exact base-to-head range, is not rate-limited or failed, and has no valid actionable finding or
  unresolved review thread; or
- an `APPROVED` GitHub review from an eligible independent non-author reviewer, recorded against
  the exact current PR head SHA, with no valid unresolved review thread.

Any new commit makes predecessor-head review evidence stale. The current head must be reviewed
again unless repository policy provides an explicit, durable equivalent bound to that same head.
Status contexts, check runs, reactions, issue comments that only request, acknowledge, queue,
rate-limit, or fail a review, author/self reviews, and summaries without an exact-head binding are
not review-equivalent evidence. A completed review does not replace any stable required check, and
green checks do not replace a completed review.

If neither qualifying route is currently available, defer that merge, keep the PR open, and
continue other safe repository work. Do not weaken protection, invent a reviewer, self-approve, or
reinterpret a provider status as review evidence.

Missing repository state should trigger GitHub bootstrap per `docs/workflow/github-bootstrap-execution-policy.md`.
Only missing admin permissions or platform capability should be reported as `BLOCKED`.

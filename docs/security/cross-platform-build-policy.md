# BandScope Cross-Platform Build Security Policy

## Purpose

BandScope ships to Windows and macOS.
For that reason, Windows and macOS builds are security controls, not optional compatibility checks.
Each platform must be validated for both `amd64` and `arm64` packaging paths.

Cross-platform builds help catch:

- packaging and permission drift across OSes
- native dependency and bundled binary differences
- updater and release-asset differences
- OS-specific path, artifact, and integrity regressions

## Mandatory baseline

- every protected-branch change must build on Windows `amd64` + `arm64`
- every protected-branch change must build on macOS Intel + arm64
- every release or tag validation must build on the same four OS/architecture combinations
- build jobs must execute real dependency install, frontend build, native shell build, analysis engine packaging sanity, and artifact upload
- build jobs must remain merge gates on both `develop` and `main`
- workflow runner labels must be explicit and architecture-stable rather than `*-latest` shortcuts when the shortcut hides one architecture
- Windows runner evidence should include an antivirus baseline check before packaging artifacts; hosted-runner telemetry may be incomplete, so the check records available Defender or SecurityCenter evidence rather than assuming real-time flags are always enabled
- exact Windows 10 and macOS 24/25 GitHub-hosted labels are not currently published in the GitHub-hosted runner catalog; if those exact versions become release gates, self-hosted or larger-runner capacity is required

## Required check names

- `gate / build / windows`
- `gate / build / macos`

These are intended required checks for both `develop` and `main`.
Each gate must represent both architectures for its OS.

## Release connection

- release validation must produce Windows amd64, Windows arm64, macOS amd64, and macOS arm64 artifacts
- each artifact must have a checksum
- release artifacts should stay linkable to SBOM artifacts and supplemental inventory
- code signing and notarization readiness should be documented even if signing credentials are not present in CI yet

## Failure policy

Mark work as `BLOCKED` or `FAILED` if any of the following is missing:

- Windows amd64 build workflow path
- Windows arm64 build workflow path
- macOS amd64 build workflow path
- macOS arm64 build workflow path
- release or tag build coverage
- intended required checks recorded in repo docs
- actual branch protection enforcement when GitHub admin context is required but unavailable

Missing repository state should trigger GitHub bootstrap per `docs/workflow/github-bootstrap-execution-policy.md`.

## Fast reference

`보안 관리를 위해 모든 보호 브랜치 변경과 release 검증에서 Windows 빌드와 macOS 빌드를 모두 수행하며, 이 빌드는 GitHub의 필수 merge gate로 유지되고 임의로 해제할 수 없다.`

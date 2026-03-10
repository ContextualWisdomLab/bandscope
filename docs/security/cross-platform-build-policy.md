# BandScope Cross-Platform Build Security Policy

## Purpose

BandScope ships to Windows and macOS.
For that reason, Windows and macOS builds are security controls, not optional compatibility checks.

Cross-platform builds help catch:

- packaging and permission drift across OSes
- native dependency and bundled binary differences
- updater and release-asset differences
- OS-specific path, artifact, and integrity regressions

## Mandatory baseline

- every protected-branch change must build on Windows and macOS
- every release or tag validation must build on Windows and macOS
- build jobs must execute real dependency install, frontend build, native shell build, analysis engine packaging sanity, and artifact upload
- build jobs must remain merge gates on both `develop` and `main`

## Required check names

- `gate / build / windows`
- `gate / build / macos`

These are intended required checks for both `develop` and `main`.

## Release connection

- release validation must produce Windows and macOS artifacts
- each artifact must have a checksum
- release artifacts should stay linkable to SBOM artifacts and supplemental inventory
- code signing and notarization readiness should be documented even if signing credentials are not present in CI yet

## Failure policy

Mark work as `BLOCKED` or `FAILED` if any of the following is missing:

- Windows build workflow path
- macOS build workflow path
- release or tag build coverage
- intended required checks recorded in repo docs
- actual branch protection enforcement when GitHub admin context is required but unavailable

Missing repository state should trigger GitHub bootstrap per `docs/workflow/github-bootstrap-execution-policy.md`.

## Fast reference

`보안 관리를 위해 모든 보호 브랜치 변경과 release 검증에서 Windows 빌드와 macOS 빌드를 모두 수행하며, 이 빌드는 GitHub의 필수 merge gate로 유지되고 임의로 해제할 수 없다.`

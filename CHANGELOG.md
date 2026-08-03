# Changelog

## [Unreleased]

### Added

- Import a bounded, validated BandScope metadata-handoff JSON file, require an explicit fresh local-audio pairing, and reuse the handoff's focused rehearsal roles for reanalysis (#739).
- Display the analyzed song tempo (BPM) as a badge in the rehearsal workspace.
- 각 합주 역할(Role)별 개인 연습 진행도를 0~100% 범위로 기록 및 시각화할 수 있는 연습 진척도(`practiceProgress`) 트래커 기능 추가. UI 컨트롤(슬라이더 및 +/- 버튼)과 한/영 다국어 지원 포함.

## [0.1.3] - 2026-04-29

### Fixed

- Published release assets through a tag-driven draft release flow so immutable GitHub Releases include desktop installers, checksums, SBOM, and supplemental inventory before publication.
- Added a supply-chain regression guard that rejects post-publication release asset uploads.

## [0.1.2] - 2026-04-29

### Changed

- Aligned the packaged desktop app version with the release package metadata.

### Fixed

- Stabilized YouTube import fallback behavior in browser and desktop dev paths.
- Guarded OSSF Scorecard execution so release-branch pushes skip unsupported non-default branch runs cleanly.

## [0.1.1] - 2026-04-28

### Added

- Implemented rehearsal workspace design (Issue #107)
- Add capo and tuning detection heuristics (Issue #103)
- Add bandit security scan workflow

### Fixed

- Upgrade pytest to 9.0.3 to fix GHSA-6w46-j5rx-g56g
- Resolve npm audit vulnerabilities

## [0.1.0] - 2026-04-20

### Added

- Initial BandScope desktop application.
- Local audio import for WAV, MP3, FLAC, and M4A sources.
- Offline Python analysis service integration.
- Section, role, harmony, cue, range, confidence, and rehearsal-priority views.
- Manual chord overrides with provenance preservation.
- CSV cue-sheet and JSON chart-summary exports.
- Tauri desktop shell for macOS and Windows.
- CI, security gates, SBOM generation, and release workflows.

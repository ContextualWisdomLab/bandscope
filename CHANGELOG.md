# Changelog

## [Unreleased]

### Added

- After a local song or admitted YouTube source is chosen, the workspace names Analyze this song as the next action and lets the player pick tonight's part before analysis starts.
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

- Added a stable release packaging path for desktop artifacts.

## [0.1.1] - 2026-04-28

### Changed

- Aligned first release-candidate packaging and documentation.

## [0.1.0] - 2026-04-28

### Added

- Initial local-first BandScope rehearsal analysis surface.

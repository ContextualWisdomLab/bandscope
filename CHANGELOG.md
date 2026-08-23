# Changelog

## [Unreleased]

### Added

- Name tonight's first blocked assignment in the mounted rehearsal workspace so the room can unblock the stuck job before the next run; the Open action moves to the uniquely named rendered map section, while todo, in-progress, ready assignments, comments, and approvals are excluded from this callout and cannot become navigation authority.
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

- Published release assets through a tag-driven draft release flow so immutable GitHub Releases include desktop installers, checksums, SBOM, and supplemental inventory before publication.
- Added a supply-chain regression guard that rejects post-publication release asset uploads.

## [0.1.1] - 2026-04-29

### Fixed

- Restored the desktop package lockfile release version after the initial package-version bump missed the lockfile metadata.

## [0.1.0] - 2026-04-29

### Added

- Initial packaged desktop release with local audio analysis, rehearsal workspace, project persistence, and export flows.

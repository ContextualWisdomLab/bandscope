# Changelog

## [Unreleased]

### Added

- Display the analyzed song tempo (BPM) as a badge in the rehearsal workspace.
- 각 합주 역할(Role)별 개인 연습 진행도를 0~100% 범위로 기록 및 시각화할 수 있는 연습 진척도(`practiceProgress`) 트래커 기능 추가. UI 컨트롤(슬라이더 및 +/- 버튼)과 한/영 다국어 지원 포함.

### Fixed

- Enforce one canonical local-audio resource policy across desktop bridge intake, Python request preflight, temporal decoding, and stem separation so oversized, overlong, malformed, wrong-rate, or non-finite decoded input fails before it becomes project state or reaches expensive analysis/model work.

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

- Added a deterministic rehearsal planner output contract for section order, role priorities, handoff cues, and export summaries.
- Added local-first YouTube import fallback behavior with explicit source labeling and no credential storage.
- Added project score PDF attachment metadata and app-owned local score storage.

### Changed

- Hardened local audio intake and project bootstrap around app-owned project/cache/temp roots.
- Tightened analysis-job payload parsing, status validation, and desktop/native bridge behavior.
- Expanded deterministic music-analysis fixtures and release-preflight coverage.

### Fixed

- Prevented malformed project, audio, score, and bridge payloads from silently reaching downstream analysis or persistence boundaries.

## [0.1.0] - 2026-04-27

### Added

- Implemented secure local audio intake and project bootstrap.
- Added the first local-first rehearsal workspace, project persistence flow, and bounded analysis bridge.

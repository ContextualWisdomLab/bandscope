# Changelog

## [Unreleased]

### Added

- The ready workspace can set up tonight's selected part from the analyzed setup cue and name the first entrance on the groove map, instead of leaving `Transcribe Bass` inert.
- Name tonight's first playable range on the ready rehearsal map and tell the player to check that span on their instrument before the section.
- Display the analyzed song tempo (BPM) as a badge in the rehearsal workspace.
- 각 합주 역할(Role)별 개인 연습 진행도를 0~100% 범위로 기록 및 시각화할 수 있는 연습 진척도(`practiceProgress`) 트래커 기능 추가. UI 컨트롤(슬라이더 및 +/- 버튼)과 한/영 다국어 지원 포함.

### Changed

- Consolidated Bandit, dependency audits, supplemental secret checks, and Trivy into one trusted-branch security backstop, delegated CodeQL to GitHub default setup, and removed duplicate local PR security and release-preflight runs.
- Pinned npm `10.9.9` as the approved lockfile generator, activated it through Node-bundled Corepack before dependency consumption, and fail closed unless its bundled `tar` is at least `7.5.19`; primary CI still consumes the committed lock only through frozen `npm ci` validation, rejects mutable npm resolution in the lock gate, requires integrity evidence for public-registry lock entries, and preserves generator-sensitive root `@esbuild/*` peer metadata.

### Fixed

- Keep Groove Map loading truthfully indeterminate unless real progress exists, and expose Cancel only when a cancellation callback is actually available.
- Keep disabled Stem Player controls discoverable by their visible labels for
  assistive technology and speech input while retaining the translated
  unavailable reason in each accessible name and tooltip.
- Reject sentinel, malformed, and inverted setup ranges before they can enable
  a buyer-visible rehearsal action or render as playable evidence.
- Localize Groove Map states and the unavailable Loop control through the
  owned translation boundary, with literal fail-closed placeholder handling.
- Upgraded the local score PDF parser to `pdfjs-dist` 6.2.108, pinned Undici 7.29.0 across the workspace, and constrained PDF loading to copied in-memory bytes with a same-origin bundled worker and npm-generated lock provenance.
- Keep the Groove Map role-aware for non-bass parts, preserve a visible keyboard focus indicator, emit only one first-entrance DOM anchor for simultaneous notes, and fail closed when setup lacks both an analyzed entrance and a playable range.

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

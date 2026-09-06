# Changelog

## [Unreleased]

### Added

- Name tonight's first playable range on the ready rehearsal map and tell the player to check that span on their instrument before the section.
- Display the analyzed song tempo (BPM) as a badge in the rehearsal workspace.
- 각 합주 역할(Role)별 개인 연습 진행도를 0~100% 범위로 기록 및 시각화할 수 있는 연습 진척도(`practiceProgress`) 트래커 기능 추가. UI 컨트롤(슬라이더 및 +/- 버튼)과 한/영 다국어 지원 포함.
- Evolve local project writes to `projectFormatVersion: 3`: retain deterministic legacy/v1/v2 migration, persist the closed Active Player source preference, and optionally store a path-free app-owned audio `sourceReference` with bounded byte evidence and canonical SHA-256 content identity for process-restart re-admission.

### Changed

- Consolidated Bandit, dependency audits, supplemental secret checks, and Trivy into one trusted-branch security backstop, delegated CodeQL to GitHub default setup, and removed duplicate local PR security and release-preflight runs.
- Pinned npm `10.9.9` as the approved lockfile generator, activated it through Node-bundled Corepack before dependency consumption, and fail closed unless its bundled `tar` is at least `7.5.19`; primary CI still consumes the committed lock only through frozen `npm ci` validation, rejects mutable npm resolution in the lock gate, requires integrity evidence for public-registry lock entries, and preserves generator-sensitive root `@esbuild/*` peer metadata.

### Fixed

- Preserve a reopened v3 project's native source selector and stored playback-source preference across an Open Project → Save Project round trip, so resaving cannot silently drop `sourceReference` or reset a non-default stem intent to Full mix.
- Enforce one canonical local-audio resource policy across native local-file/YouTube bootstrap intake, the desktop bridge, Python request preflight, temporal decoding, and stem separation so oversized, overlong, malformed, wrong-rate, or non-finite input fails before bootstrap storage or expensive analysis/model work.
- Preflight source-container duration, sample rate, and channel count from the already-open audio handle before temporal, stem, or bass-transcription decoders resample, downmix, or truncate it; successful metadata probes rewind the handle and malformed probes fail closed.
- Bound the admitted canonical decoded mono buffer to 317,520,000 bytes as well as the existing 39,690,000-sample ceiling, so decoder dtype expansion cannot stay within the sample count while exceeding the explicit in-memory audio budget.
- Fail closed on malformed known YouTube duration metadata before `download=True`; Boolean, non-numeric, non-finite, zero, negative, and non-canonical numeric-subtype duration evidence can no longer authorize a media download through Python numeric coercion or subclass semantics.
- Align YouTube download admission with that same 100 MiB encoded-byte ceiling: abort in-flight with yt-dlp `max_filesize` and a progress hook, reject announced oversize before `download=True`, delete owned `.part` / `.ytdl` / `-Frag*` siblings from that import directory on abort, reject a completed path that resolves outside the current import cache before post-download validation, cleanup, or success, and delete owned post-download artifacts that still exceed the policy. A 60 MiB import that the old 50 MB check rejected is now accepted; a file one byte over 100 MiB is not.
- Bound native stored-score PDF reads to the 25 MiB product limit before heap allocation and revalidate PDF magic on the same opened descriptor, preventing an attached score that later grows from bypassing the local resource boundary.
- Treat every zero-element NumPy layout as empty chord input, including shapes whose first dimension is non-zero, before feature extraction.
- Upgraded the local score PDF parser to `pdfjs-dist` 6.2.108, pinned Undici 7.29.0 across the workspace, and constrained PDF loading to copied in-memory bytes with a same-origin bundled worker and npm-generated lock provenance.
- Stage and sync new project saves before non-clobbering publication, and enforce the existing 5 MiB project limit during the file read itself so a selected project cannot grow past a metadata preflight into an unbounded load allocation.
- Reject directly selected project symlinks before reading so a chosen `.bscope` path cannot silently redirect the loader to different file content.
- Reject a symlinked/reparse-point save parent before staging so a selected project path cannot redirect new project publication into a different directory.
- Fail closed when a selected `.bscope` path changes file identity between preflight and handle acquisition; Windows opens reparse points without following them and compares native volume serial plus file-index identity across the acquisition boundary.
- Refuse last-component symlink following during Linux/macOS project handle acquisition and make that acquisition non-blocking so a preflight-to-open path swap cannot redirect the loader or stall it on a special file.
- Preserve first-save crash safety on filesystems without hard-link support by publishing the fully synced staging file with an OS-native atomic no-replace rename, so a crash cannot leave an empty reserved final path.
- Reject a stale existing-project replacement when the selected target changes file identity while replacement bytes are staged; native exchange/backup publication restores the competing target instead of clobbering it.
- Recover an interrupted existing-project replacement from a bounded, same-directory identity journal when the target is selected again, while leaving mismatched files untouched.
- Keep renderer project admission passive and path-free: custom prototypes, enumeration/descriptor traps, accessors, runtime playback authorities, unknown fields, invalid app-owned source references, unsafe byte-size values, and missing/non-canonical SHA-256 source identity fail closed before persistence IPC.
- Keep local Demucs loading offline and bounded by resolving a private snapshot copied from the verified cache descriptor through `LocalRepo`; reject missing, modified, empty, non-regular, over-128-MiB, or descriptor-size-racing checkpoint state before model deserialization so mutable cache replacement, post-preflight growth/shrink, and oversized local artifacts cannot alter or exhaust one analysis load.
- Bound PyTorch 2.6+ weights-only checkpoint incompatibility at the admitted local-model boundary instead of leaking serialized class details or silently enabling legacy pickle loading; incompatible technical cache state now returns the existing local-model-unavailable diagnostic and remains a Distribution serialization/provenance decision.
- Reject PyTorch runtime-environment widening at the local Demucs boundary: `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD` cannot turn the upstream implicit checkpoint load back into unrestricted pickle deserialization, and `TORCH_DEVICE_BACKEND_AUTOLOAD=1` cannot auto-import out-of-tree backend extensions before model admission.

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
- Fix ruff import sorting and formatting errors
- Add missing docstrings to tests
- Fix test configuration and typing issues

## [0.1.0] - 2026-03-27

### Added

- Issue #29: Defined core `song -> section -> role` rehearsal domain contracts
- Issue #38: Added cross-architecture build support (Windows/macOS arm64+amd64)
- Issue #40: Enforced 100% Python docstring and test coverage
- Issue #32: Implemented local analysis orchestration and secure IPC boundaries
- Issue #33: Implemented secure local audio intake and project bootstrap
- Issue #35: Engineered section, form, and cue anchor extraction pipeline
- Issue #34: Implemented role extraction targets and part graph
- Issue #31: Added role-specific harmony, range, overlap, and confidence metrics
- Issue #28: Delivered practical rehearsal workspace UI
- Issue #27: Supported manual overrides, provenance tracking, and local project persistence
- Issue #36: Implemented rehearsal priority calculation and cue-sheet (CSV) / chart (JSON) exports
- Issue #30: Added policy-constrained YouTube import with local fallback
- Issue #26: Finalized roadmap and prepared application for initial release

## [0.1.4] - 2026-05-15

### 추가됨 (Added)

- `ChordsFeature` (코드 분석) 화면에서 각 파트(Role)의 `transpositionPlan`(이조/조옮김 계획)을 표시하는 기능을 추가했습니다.
- `RangesFeature` (음역대 분석) 화면에서 겹침 경고(Overlap warning) 외에 해당 파트의 채보(Transcription) 가능 노드 수를 요약하여 보여주는 기능을 추가했습니다.
- 신규 UI 요소에 대한 단위 테스트를 추가했습니다 (`apps/desktop/src/features/chords/index.test.tsx`, `apps/desktop/src/features/ranges/index.test.tsx`).
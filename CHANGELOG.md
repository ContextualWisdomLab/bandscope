# Changelog

## [Unreleased]

### Added
- 베이스 트랙에 대한 Transcription(피치 추출 및 MIDI 다운로드) 기능 추가
- `librosa.pyin` 기반의 베이스 음정 추적 백엔드 구현 (5분 길이 제한 포함)
- 추출된 음정을 가로형 타임라인으로 시각화하는 `GrooveMap` React 컴포넌트 추가

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

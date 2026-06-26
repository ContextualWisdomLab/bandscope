# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3]

### 변경됨 (Changed)

- Base UI 기반 재사용 가능한 컴포넌트(`button.tsx`, `tabs.tsx`, `input.tsx`)에서 비활성화(disabled) 상태일 때 `pointer-events-none` 대신 `cursor-not-allowed` 유틸리티 클래스를 사용하도록 수정했습니다. 이는 네이티브 `title` 속성이 툴팁으로 정상 작동하도록 보장하기 위함입니다.

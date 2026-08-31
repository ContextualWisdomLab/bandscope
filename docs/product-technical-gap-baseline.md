# BandScope Product-Technical Gap Baseline

Last updated: 2026-08-31
Base revision: `develop@749511c3` (feat(workspace): name tonight's first playable range on the map, #957)

## 1. 목적과 범위 (Purpose & Scope)

이 문서는 ADR/설계 문서(`ARCHITECTURE.md`, `docs/plans/*`), 브랜드 소스(`docs/brand-story.md`), 보안 소스(`docs/security/app-security.md`), 그리고 현재 저장소 상태(코드, 열린 PR 약 130건, 열린 이슈)를 대조하여 다음을 한 곳에 모은 baseline이다.

- 기능 명세(functional spec)와 PRD/TRD로 승격되지 않은 요구사항의 공백
- 구현된 코드와 문서가 선언하는 제품 범위 사이의 기술 Gap
- 누락된 UML/다이어그램 산출물
- 구매자가 체감하는 제품 Gap 우선순위 Backlog

범위에는 현재 열려 있는 PR 세트를 명시적으로 포함한다. 특히 `feat(workspace): name tonight's first X on the map` 시리즈는 아직 merge되지 않았으므로, 이 문서에서는 해당 시리즈가 착지했을 때 남는 Gap까지 함께 기술한다.

검증 원칙: 본 문서의 코드 관련 주장은 전부 실제 repo에 대해 `grep`/`glob`/파일 read로 확인했다. 확인 방법은 9장에 재실행 가능한 명령으로 남긴다.

## 2. 현행 제품 명세 스냅샷 (Current Product Specification Snapshot)

`ARCHITECTURE.md`와 `docs/brand-story.md` 기준, BandScope는 오늘날 다음을 지향한다.

- 퇴근 후 합주 준비자를 위한 local-first 데스크톱 앱(Tauri + Vite + React)
- 곡 보기(song view): 섹션별·연주 역할별 추정 화성, 폼(form)/그루브(groove) 큐, 스템(stems), 연주 가능 음역(playable ranges), 단순화 가이드(simplification), 전조/카포/튜닝/셋업 큐, 파트 겹침(part-overlap) 경고, 가시적 신뢰도(confidence), 리허설 우선순위
- 분석 대상 모델은 곡 전체 코드 트랙이 아니라 `song -> section -> role` 계층이며, role은 악기/보컬 기능/손(hand) 단위까지 확장될 수 있다
- 자동 분석 결과는 편집 가능하고, model-generated vs user-confirmed provenance를 유지해야 한다

아키텍처 개요:

```mermaid
flowchart LR
    subgraph Desktop["apps/desktop (Tauri + Vite + React)"]
        UI["React UI<br/>features/workspace, player,<br/>ranges, chords, score, settings"]
        Shell["src-tauri/src/main.rs<br/>9개 typed Tauri command"]
        Core["core/src/lib.rs<br/>URL/경로/프로젝트 페이로드<br/>검증 헬퍼 (분석 연산 없음)"]
    end
    subgraph Engine["services/analysis-engine (Python)"]
        CLI["cli.py / api.py<br/>stdin/stdout JSON IPC"]
        Mods["chords / sections / roles /<br/>ranges / temporal / separation /<br/>transcription / exports"]
        Sep["separation/audio_separator.py<br/>Demucs htdemucs (CPU)<br/>bandsplit-v1.json 폴백"]
    end
    Rust["services/analysis-engine/rust<br/>bandscope_numeric (PyO3/maturin)<br/>checkerboard_novelty + viterbi_decode"]
    Types["packages/shared-types<br/>song-section-role 계약<br/>confidence/provenance/cue/export"]

    UI -- "typed Tauri IPC" --> Shell
    Shell --> Core
    Shell -- "allowlisted subprocess<br/>stdin/stdout JSON" --> CLI
    CLI --> Mods
    Mods --> Sep
    Mods -. "Rust 커널 호출,<br/>Python 참조 구현 폴백" .-> Rust
    UI --- Types
    Mods --- Types
```

핵심 구조적 사실(코드 확인 완료):

- 로컬 오케스트레이션은 loopback HTTP가 아닌 typed Tauri IPC + stdin/stdout JSON 서브프로세스 방식이다 (`ARCHITECTURE.md`, `src-tauri/main.rs`)
- `apps/desktop/core`(Rust)는 분석 연산이 아니라 입력 검증(YouTube URL, project payload, score PDF source, 경로 가드) 담당이다 (`apps/desktop/core/src/lib.rs`)
- 무거운 수치 커널 중 checkerboard novelty와 Viterbi 디코딩만 `bandscope_numeric`(Rust/PyO3)으로 포팅되어 있고, 나머지는 Python/NumPy 참조 구현이며 `tests/test_numeric_parity.py`로 f64 parity를 잠근다 (`_native.py`)
- 스템 분리는 Demucs `htdemucs`를 CPU로 돌리고 플랫폼 게이트(demucs/torch 미설치 플랫폼은 불가)이며, 주파수 컷오프만 정의한 `bandsplit-v1.json` 휴리스틱 밴드스플릿 manifest가 별도로 존재한다 (`separation/audio_separator.py`, `separation/model_weights/bandsplit-v1.json`)
- 협업 타입(assignments/comments/approvals)은 `packages/shared-types`에 정의만 되어 있고 UI 참조가 전혀 없다 (grep 확인)

## 3. 기능 명세 및 요구사항 도출 (Functional Spec Derivation)

제품 능력 -> 구현 위치 -> 성숙도 매핑. 성숙도: 구현됨 / 부분구현 / 미구현.

| 제품 능력 | 구현 위치 | 성숙도 |
|---|---|---|
| 로컬 오디오 임포트(Rust 검증 + app-owned 루트) | `apps/desktop/src-tauri/src/main.rs`, `apps/desktop/core/src/lib.rs` | 구현됨 |
| YouTube 임포트(정책 제약, 실패 폴백) | `services/analysis-engine/src/bandscope_analysis/youtube.py` | 부분구현 (DRM/로그인 우회 없음, 실패 시 안내 카드는 PR 진행 중) |
| 스템 분리 | `separation/audio_separator.py` (htdemucs CPU), `bandsplit-v1.json` | 부분구현 (플랫폼 게이트, x86 macOS 미지원, GPU 없음) |
| 섹션 세그먼테이션(checkerboard novelty) | `sections/segmenter.py` + `bandscope_numeric::checkerboard_novelty` | 구현됨 |
| 섹션별 화성(HMM + Viterbi) | `chords/chord_recognizer.py`, `chords/section_harmony.py` | 구현됨 (hand-tuned prior 수준, 4장 참조) |
| 화성 기능 라벨/설명 | `chords/function_analyzer.py`, `RehearsalRole.harmonicExplanation?` | 부분구현 |
| 역할(role) 추출 및 역할별 조율 | `roles/extractor.py`, `roles/tuning.py` | 부분구현 (주파수 컷오프 휴리스틱 기반) |
| 음역/가압(range pressure) | `ranges/analyzer.py`, `ranges/pressure.py`, `ranges/pitch_tracker.py` | 구현됨 |
| 파트 겹침 경고 | `roles/overlap.py`, `RehearsalRole.overlapWarnings` | 구현됨 |
| 단순화 가이드 | `roles/priority.py` 연계, `RehearsalRole.simplification` 필드 | 구현됨 (문자열 필드 중심) |
| 전조/카포/튜닝 큐 | `chords/transposition.py`, `chords/capo.py`, `roles/tuning.py` | 구현됨 (계산), 워크스페이스 노출은 PR 진행 중 |
| 그루브/타이밍/히트 큐 | `temporal/groove.py`, `temporal/hits.py`, `temporal/stability.py` | 구현됨 |
| 진입/이탈/카운트/가사 큐 앵커 | `sections/anchors.py`, `CueAnchorKind = lyric\|count\|transition` | 부분구현 |
| 신뢰도 표시(section/role 수준) | `ConfidenceMarker(low/medium/high)` + `features/workspace/ConfidenceBadge.tsx` | 구현됨 |
| 리허설 우선순위 | `roles/priority.py`, `RehearsalPriority`, `PracticeProgress.tsx` | 구현됨 (규칙 기반 휴리스틱) |
| 수동 수정 + provenance | `ManualOverride[]`, `ProvenanceSource = model\|user` | 구현됨 |
| 내보내기(cue-sheet CSV, chart JSON) | `exports/chart.py`, `src/lib/export.ts` (filename sanitize, CSV escape) | 구현됨 |
| 악보(score) 보기 | `features/score/ScoreView.tsx`, `ScoreViewer.tsx`, `pdfjs.ts` | 부분구현 (PDF 뷰잉; PDF 바이트 검증은 PR 진행 중, 자동 채보 없음) |
| 루프 재생/역할별 재생 제어 | `features/player/index.tsx` | 미구현 (loop 미탐지, PR #903/#971 진행 중) |
| 협업(assignment/comment/approval) UI | `packages/shared-types` 타입만 존재 | 미구현 (UI 참조 0건; PR 시리즈가 첫 화면 진행 중) |
| pad/solo/riff/hook/fill/voicing/articulation/dynamics/tuning/capo/vamp 등 plan 필드 | 없음 (shared-types에 미존재) | 미구현 (PR 시리즈가 추가 예정) |
| 라이선싱/데모곡 first-run | 없음 | 미구현 (PR #1009, Issue #963/#964) |
| 자동 저장/crash-safe 프로젝트 포맷 | 없음 | 미구현 (Issue #961) |
| 서명/공증 배포+롤백 증적 | `.github/workflows/release.yml` 존재 | 부분구현 (Issue #960) |

## 4. 현재 열린 PR 기반 Gap 분석 (Open-PR Gap Analysis)

현재 open PR은 185건이다(`gh pr list --state open`, 2026-08-31 기준; 2026-08-25 130건 → 6일 만에 +55건). 대부분은 동일 패턴의 시리즈이며, `#1056`~`#1115+`의 `feat(workspace): name tonight's first … on the map` 체인이 새로 55건 이상 추가되었다(악상 기호 D.C./D.S./Coda/Segno/Fine, tacet, breath, tutti, leftover 파생 등). 이 기간 develop에 착지한 PR은 `#957`(2026-08-26) 1건뿐이므로 backlog는 순증하고 있다(§5(k) 참조).

시리즈 패턴: `feat(workspace): name tonight's first X on the map` — 워크스페이스 맵에 "오늘 밤 첫 X" next-action 카피를 올리고, Open 클릭 시 해당 섹션으로 이동. 각 PR은 role-owned plan 필드(예: `padPlan`)를 shared contract에 추가하고, own data-property descriptor 검증(Proxy `get` trap 방어), 한국어 조사 안전 카피(`패드`, `뱀프` 등), reduced-motion 처리, 그리고 강한 merge-gate 조항을 포함한다.

capability cluster 분류와 착지 후 남는 Gap:

| Cluster | 해당 PR (예시) | 착지가 의미하는 것 | 착지 후 남는 Gap |
|---|---|---|---|
| A. 역할별 연주 plan 필드 (pad/solo/riff/hook/fill/voicing/articulation/dynamics/tuning/capo/vamp) | #1020, #1013~#1018, #1021, #1024 | RehearsalRole 계약 확장과 첫 plan 노출. 데이터 생성기(engine)가 실제로 이 plan을 산출하는지와는 별개 | plan 값을 만들어내는 엔진 로직, plan 간 충돌/우선순위 정책, plan 편집 UX |
| B. 폼/섹션 네이밍 (intro/verse/pre-chorus/chorus/bridge/outro/tag/pickup/stop/handoff/entrance/dropout/lyric cue/transition/transition-cue/count) | #943, #947, #955, #939, #946, #986, #989, #916, #934, #937, #912, #914, #913, #994, #993, #995 | SECTION_FORM_LABELS와 CueAnchorKind가 이미 계약에 있으므로 주로 UI 노출 완성 | 앵커 정확도(가사/카운트 정렬), 사용자 직접 앵커 편집 |
| C. 화성 설명/확정/귀확인 (harmonic function/explanation/confirmed chord/ear check/setup note/transposition/part handoff/playable range/overlap/groove/simpler take/tempo-starting chord setup) | #1005, #1003, #1002, #1001, #1004, #1006, #1007, #957, #992, #991, #990, #987 | brand-story의 "추정 + 귀로 확인" 프레임을 UI 언어로 구체화 | confidence 산출 근거의 정량화, confirmed override의 재분석 반영(round trip, Issue #739) |
| D. 협업 최소면 (assignment/comment/approval/blocked/pending/open comment/export-priority actions/ready board) | #996, #997, #998, #1000, #900, #901 | shared-types의 collaboration 타입에 처음으로 UI가 붙음 | 동기화(syncMode local_only/planned_cloud), crash-safe 프로젝트 포맷(Issue #961), 권한 모델 |
| E. First-run/activation/실패 복구 (first-run card/license demo song/local intake 실패/import 실패/analysis 실패/save 실패/help) | #974, #1009, #981, #982, #976, #984, #972, #898 | 빈 상태/오류 상태의 next-action 카피 완성 | 라이선싱 백엔드, 데모곡 번들 정책, 오프라인 활성화 |
| F. 보안/신뢰경계 (log redaction x4, quick-xml RustSec, filesystem authority, canonical audio policy, CSV NUL/전각 우회 차단, credential drop, PDF bound reads, npm baseline) | #956, #951, #950, #949, #948, #858, #985/#781, #941, #894, #865, #783 | app-security.md 규칙의 코드 반영 마무리 | Issue #852(경계 재구축), #542(예외 추적), 모델 artifact checksum/signature 파이프라인 |
| G. 성능 (Bolt 시리즈: 관측 확률 벡터화, GrooveMap maxTime O(1), chart dedupe O(N), chord change count O(1), checkerboard/HMM 벡터화) | #999, #859, #849, #834, #746, #732 | 핫패스 최적화. Rust 커널 포팅과 같은 방향의 Python 측 보완 | Demucs GPU/offload, 대용량 파일 스트리밍, UI 가상화 |
| H. 접근성/디자인 시스템 (tooltip aria-disabled, icon tooltip, Storybook tokens, Figma drift check) | #833, #731, #897, #969 | WCAG 대응 시작점 | Issue #965(Figma/Storybook/shipped UI 정합 + WCAG 2.2 AA gate) 전체 |
| I. 테스트 현실성 (decoded WAV acceptance, known-take chord recovery, real YouTube known-stem benchmark, branch coverage) | #892, #891, #828, #861 | synthetic fixture에서 실오디오 기반 acceptance로 이동 시작 | Issue #770(실오디오 MIR accuracy benchmark) 체계화, RMSE/SI-SDR 임계값 정책 |
| J. 의존성/빌드 위생 (react, storybook, base-ui, lucide, sonner, codeql-action, setup-uv, uv group, numba, uuid, time, rust pinning, node floor, orphaned Actions identity) | #920, #942, #922, #921, #926, #927, #924, #931, #936, #919, #918, #754, #944, #896, #895 | 공급망/런타임 최신화 유지 | Dependabot train 정리(Issue #966), jsdom 30 전환 완료 |

시리즈 전체에 대한 종합 판단: 이 시리즈는 "계약(contract) 필드 추가 + 첫 노출" 단계다. 착지해도 (1) plan 값의 생성 로직, (2) plan들 사이 우선순위/중복 정책, (3) 재분석 시 override 보존 round-trip, (4) 협업 영속화는 여전히 Gap으로 남는다. 또한 130건이 develop 기준으로부터 장기간 분기되어 있어 rebase 비용과 exact-head CI 증적 요구(PR 본문 명시)로 인한 merge train 정체가 자체적으로 기술 위험이다(Issue #966).

## 5. 기술 Gap 목록 (Technical Gaps)

문서 vs 코드 대조로 확인한 구체적 Gap.

(a) **Rust compute layer 활용 범위** — 분석 핫패스 중 checkerboard novelty와 Viterbi decode만 Rust(`bandscope_numeric`)에 있다. 스템 분리(Demucs)는 Python/torch CPU 경로이고 GPU/CUDA/Metal 경로가 없으며, transcription은 에너지 마스크 휴리스틱(`transcription/api.py`)으로 ML 모델이 아니다. 데스크톱 단일 곡 처리 기준 CPU로도 실용적일 수 있으나, 긴 곡/다중 분석에서 병목이며 `docs/plans/2026-04-25-v2-transcription.md`가 v2 계획으로 존재한다.

(b) **다층/계층·시간 모델링** — `song -> section -> role` 계약과 sections/roles/temporal 모듈은 존재하지만, role-level harmony는 `bandsplit-v1.json`의 고정 주파수 컷오프 휴리스틱에 의존한다. 학습된 multilevel 모델(예: role-conditioned chord/voicing 모델)과 section 경계의 temporal 일관성 학습은 없다. `docs/plans/2026-03-28-ml-engine-integration.md`가 관련 계획 문서다.

(c)**임의 가중치 vs 문헌 기반 값** — `chord_recognizer._build_transition_matrix()`는 `self_prob=0.8`, `related_prob=0.03`, uniform baseline `0.01/n` 등 hand-set 상수를 쓴다("Encodes musical priors" 주석). 방향성(fifth/fourth/relative/parallel)은 음악 이론에 근거하지만 수치는 문헌 교정(calibration)되어 있지 않다. `roles/priority.py`는 숫자 가중치 없는 if-then 규칙이다. PR #732(relative-key prior correction)처럼 사후 수정이 발생해왔다. 교정 방향: 주석 코퍼스(예: Burgoyne et al., 2011의 McGill Billboard)에서 전이 행렬을 최대우도로 추정하고, HMM prior 민감도(Logan & Chu, 2000; Pauwels & Peeters, 2013; Boulanger-Lewandowski et al., 2013 참조)와 tonal pitch space 거리 기반 스무딩(Harte, 2010)으로 현재 hand-set 값과의 코드 복원 RMSE/accuracy 차이를 정량 비교한 뒤, 우세한 값을 상수가 아닌 데이터 산출물로 고정한다.

(d) **테스트 현실성** — `test_numeric_parity.py`(Rust-Python parity), `test_api.py` 등은 합성 입력 기반이고, tests 디렉터리에 .wav/.mp3 실오디오 fixture가 없다(find 확인). 실오디오 acceptance는 PR #892(decoded WAV C major), #891(known take verse/chorus recovery)이 열려 있고, 실 YouTube known-stem benchmark는 draft PR #828 + Issue #770 상태다. RMSE/SI-SDR 스타일 정량 임계값 acceptance gate는 아직 없다.

(e) **커버리지/docstring 100%** — Python은 `--cov-fail-under=100` + Ruff D100-D107 docstring 100%가 gate로 작동한다(AGENTS.md, roadmap-completion 문서). JS workspace는 2026-08-25 실측에서 desktop(469 stmts/357 branches/105 funcs)과 shared-types(717 stmts/643 branches/59 funcs) 모두 statements/branches/functions/lines **실측 100%**를 유지한다. 그러나 gate threshold(`vite.config.ts`, `vitest.config.ts`)는 90으로 Python보다 낮아, 리그레션 시 90~99% 구간이 무단 통과될 수 있다. Gate 상향은 Backlog #10.

(f) **보안 체크리스트 잔여 항목** — 구현된 것: allowlisted stdin/stdout subprocess, Tauri CSP, path guards(#727 착지), CSV escape/sanitize, shell=False. 열린 것: canonical audio resource budget(#985 draft, Issue #781), filesystem path containment 재구축(Issue #852, #858 진행), native PDF read bounding(#865, #750), quick-xml RustSec 예외(#948, Issue #542), npm/PDF.js/nanoid/undici baseline(#783). 모델 artifact(Demucs checkpoint) checksum/signature 검증 파이프라인은 문서(app-security.md "Models") 요구 대비 미구현.

(k) **운영 관측(2026-08-25 strix 공급자 장애)** — 중앙 Strix 게이트가 NVIDIA NIM 소진 시 최종 폴백 `openai-direct/gpt-5.4`를 NIM 엣지 API base로 라우팅해 `404 page not found`로 실패 닫기(fail-closed)하여 전 조직 PR 큐가 정체했다. 근본 원인 수정은 ContextualWisdomLab/.github#1324(openai-direct 폴백 전용 API base 라우팅 + 회귀 계약 테스트)로 추적했고, bandscope 의존성 CVE(pdfjs-dist CVE-2026-16633 등)는 canonical owner #783으로 일원화했다. 운영 교훈: required 스캐너의 공급자 장애는 repo 단위 우회가 아니라 중앙 게이트 계약 수정으로만 풀어야 한다.

(k2) **운영 관측(2026-08-31 merge train 정체 지속) — 현재 최우선 제품-기술 Gap** — 2026-08-31 기준 열린 PR 185건 중 확인한 표본(#1054·#1055·#1057·#1074·#1103·#1104) 전부에서 `ci / build-and-test`, cross-platform build, CodeQL/Semgrep/Bandit/Trivy/OSV, CodeRabbit, Devin 등 코드 게이트는 **통과**하나, 조직 소유 필수 리뷰 3종이 **일괄 실패 닫기**한다.

| 필수 체크 | 소스 | 실패 양상(표본) | 근본 원인(관측) |
|---|---|---|---|
| `opencode-review` | `ContextualWisdomLab/.github/.github/workflows/opencode-review.yml` | 수 초 내 fail. `opencode-review-target` 잡이 `api.opencode.ai`로 dispatch 후 현재 head SHA에 대한 `opencode-agent` verdict를 최대 90분 폴링하다 없으면 fail-closed | dispatch된 authenticated 리뷰가 exact-head APPROVED/CHANGES_REQUESTED 리뷰를 게시하지 못함(에이전트 미가동 또는 자격 미구성) |
| `strix` | `…/strix.yml` | 5–11분 후 fail | OpenCode app-token 교환/스캐너 실행이 공급자 키에 의존; §5(k) 계열 공급자 라우팅 장애의 연장선 |
| `noema-review` | `…/noema-review.yml` | 2–6분 후 fail | contextual-orchestrator 사이드카 + 공급자 키(BYTEZ/NVIDIA_NIM/OPENROUTER/OPENAI) 필요; `call_llm` HTTP 타임아웃(120s)이 조직 정책보다 짧아 verdict 미제출 |

관측된 진행 중 조치(중복 금지, 관망 대상): `ContextualWisdomLab/.github`가 Noema 리뷰 신뢰성을 집중 수정 중 — 2026-08-31 반나절에 #1477·#1480·#1483·#1487·#1490·#1497·#1501·#1504 착지 + `fix(noema): remove fixed LLM response timeout`(#1415/#1511) 활성. `pr-review-merge-scheduler`는 분 단위 재실행, `bandscope-hourly-review-repair`는 시간별 대체로 success이나 backlog 미해소. 로컬 git 세션에서 이 필수 체크를 직접 통과시킬 방법은 없다(branch protection + 조직 자격). 로컬 레버리지는 (1) 코드가 원인인 PR의 실질 리뷰·수정 stack, (2) 본 baseline 최신화, (3) `codex/project-format-v1` 같은 stale/이름 충돌 로컬 브랜치 정리에 한정된다.

조치 상태:
- **미해결 / 상위 에스컬레이션 필요** — 필수 리뷰 3종 fail-closed로 인해 185건 전부 merge 불가. 소유: `ContextualWisdomLab/.github` (원격 에이전트가 noema 타임아웃 수정 중). bandscope 측 액션: 없음(계약 수정은 중앙에서만). §5(k) 교훈 재확인 — repo 단위 우회 금지.
- **부분 조치 (merge-ready 대기열 축적)** — 게이트가 열리는 즉시 착지할 수 있도록 코드 원인 PR을 `develop` 기준으로 정비:
  - **PR #1116** — 본 baseline. stale `codex/project-format-v1`(자기 origin 대비 78 커밋 뒤처짐, PR #1073 이미 merged) 로컬 체크아웃에서 `develop` 기준 새 브랜치로 재분리. stale 로컬 브랜치는 삭제.
  - **PR #1117** — `refactor(engine): promote temporal probe from cli hack to api integration`. `cli.py`의 "Temporary: Inject temporal analyzer … just to prove it works" probe를 `api._build_local_temporal_features()` 정식 통합으로 대체(§5(d)·§6(a) 방향, 임시/데모 코드의 production 반입 금지 원칙). stem 분리 불가 시에도 tempo/제목 큐 보존. `STEM_SEPARATION_TIMEOUT_SECONDS` 20→300s, Rust `ANALYSIS_PROCESS_TIMEOUT` 30→360s(기존 값은 실제 길이 곡에서 무조건 timeout). `ruff`/`ruff format`/`mypy src`/`pytest --cov-fail-under=100`(678 pass, 100%) 로컬 통과.

(g) **i18n/현지화** — `src/i18n` + `locales/en`, `locales/ko` 존재, 하드코딩 한국어 문자열 미탐지(workspace tsx grep 0건), interpolation hardening PR #744 진행. en/ko 2개 언어뿐이며, PR 시리즈가 추가할 다수의 카피 키가 locales에 아직 없다.

(h) **접근성** — workspace 컴포넌트에 aria-* 속성 52건 존재. 그러나 WCAG 2.2 AA gate는 Issue #965로 열려 있고, Figma/Storybook/shipped UI 정합 점검도 미완이다. tooltip/a11y PR(#833, #731)이 진행 중.

(i) **Design token/Storybook** — shadcn/ui 프리미티브 중 stories는 button/checkbox/dialog 3개뿐이고, rehearsal 도메인 컴포넌트(GrooveMap, SectionRoadmap, RoleSwitcher 등) stories는 없다. Storybook token PR #897이 진행 중.

(j) **패키징/릴리스 준비** — `CHANGELOG.md`, `VERSION`, `release.yml`, `build-baseline.yml` 존재. Windows/macOS amd64+arm64 build gate가 protected branch 요건이다(ARCHITECTURE.md). 남는 Gap: 서명/공증/자동 업데이트 롤백 증적(Issue #960), crash-safe project format/autosave/migration(Issue #961), redacted diagnostics/support bundle(Issue #962).

## 6. UML 보완점

현재 docs 전역에서 Mermaid/sequence/class diagram이 하나도 존재하지 않는다(grep 확인). 아래 두 다이어그램이 최소 필수다.

### 6.1 import -> analyze -> workspace render happy path

```mermaid
sequenceDiagram
    actor U as User
    participant UI as React UI
    participant T as Tauri shell (main.rs)
    participant C as core/lib.rs (validation)
    participant P as Python engine (cli/api)
    participant N as bandscope_numeric (Rust)
    U->>UI: select local audio file
    UI->>T: invoke intake command
    T->>C: validate path/format/project id
    C-->>T: validated reference (no copy)
    T->>P: spawn allowlisted subprocess (stdin/stdout JSON)
    P->>P: separate stems (Demucs CPU) / segment / chords
    P->>N: checkerboard_novelty, viterbi_decode
    N-->>P: kernels result (parity-guaranteed)
    P-->>T: RehearsalSong JSON (schema-validated)
    T-->>UI: jobResult event
    UI->>UI: render Workspace/GrooveMap/Roles
```

### 6.2 untrusted-input trust boundaries

```mermaid
flowchart TD
    subgraph Untrusted["User Input Boundary (untrusted)"]
        F[local audio file]
        Y[YouTube URL + metadata]
        D[drag-and-drop payload]
        PF[imported project file]
        MF[model artifacts]
    end
    subgraph Gates["validation gates"]
        VF[path/format/id guard - core/lib.rs]
        VY[scheme/host/path/query allowlist - youtube.py]
        VP[payload schema validation - IPC]
        VM[checksum/signature required - 미구현]
    end
    subgraph Trusted["Process Boundary"]
        S[Tauri shell]
        PY[Python engine]
        RS[Rust kernels]
    end
    F --> VF --> S
    Y --> VY --> PY
    D --> VP --> S
    PF --> VP --> S
    MF -. "checksum/signature gate 없음" .-> VM
    VM -.-> PY
    S --> PY --> RS
```

### 6.3 완전히 누락된 UML 산출물

- 프로젝트 save/load/migration 흐름(crash-safe 포맷 설계 선행 다이어그램)
- manual override <-> 재분석 round-trip(provenance 보존) 시퀀스
- export(cue-sheet/chart) 파이프라인과 sanitize 지점 다이어그램
- state machine: analysis job(idle/running/done/failed) 상태 전이
- class diagram: shared-types 도메인(song/section/role/confidence/provenance) 정식 클래스 뷰

## 7. 우선순위가 매겨진 Gap Backlog (Prioritized Gap Backlog)

구매자 체감 순서 기준. 각 항목에 acceptance criteria를 둔다.

### P0

1. **실오디오 정확도 acceptance gate (Issue #770, PR #828/#891/#892 수렴)**
   - Why: brand-story의 Accuracy principle("easy to use does not mean accuracy can be loose")은 정량 근거 없이는 신뢰할 수 없다.
   - Acceptance: 실오디오 fixture(최소 3곡, known stems)에 대해 chord recognition 정확도와 stem SI-SDR 임계값이 CI gate로 실행되고, 실패 시 merge가 차단된다.
2. **canonical audio resource budget 착지 (PR #985/#866, Issue #781)**
   - Why: 대용량/악성 파일로 인한 메모리 폭주는 첫 사용 경험을 깬다. 보안 gate이자 안정성 gate다.
   - Acceptance: 파일 크기/길이 상한이 intake에서 강제되고, 초과 입력은 안전 실패 카피로 거부된다. quickcheck 통과.
3. **필수 리뷰 게이트 fail-closed 해소 → merge train 재가동 (Issue #966, §5(k2)) — 현재 단일 최우선**
   - Why: 185개 open PR 전부가 `opencode-review`/`strix`/`noema-review` 일괄 실패로 merge 불가하며, backlog는 6일간 +55건 순증했다. 다른 모든 P0/P1은 이 게이트가 열리기 전엔 착지할 수 없다.
   - Acceptance: 세 필수 워크플로가 표본 PR에서 exact-head verdict로 통과하고(중앙 `ContextualWisdomLab/.github` 계약 수정: noema `call_llm` 타임아웃 정렬, opencode/strix 공급자 라우팅), 이후 dependency-aware train으로 open PR이 cluster A-J 단위 수렴하며 중복 PR이 canonical PR로 link된다. repo 단위 우회(필수 체크 완화·삭제)는 금지(§5(k) 교훈).
4. **filesystem path containment 재구축 (Issue #852, PR #858)**
   - Why: 로컬 데스크톱 앱의 최상위 신뢰경계. 우회 시 임의 파일 접근으로 이어진다.
   - Acceptance: 모든 파일 접근이 authority 객체로 바인딩되고 traversal 테스트가 gate에 포함된다.

### P1

5. **plan 필드 시리즈의 엔진 생성 로직 + 우선순위 정책 (Cluster A/C 착지 후속)**
   - Acceptance: 각 plan(padPlan 등)이 engine이 실제 산출하는 값과 UI 노출로 연결되고, 다중 plan 충돌 시 표시 우선순위가 문서화되며, override 시 provenance가 보존된다.
6. **루프 재생/역할별 재생 제어 (Issue #960, PR #903/#971)**
   - Acceptance: 임의 섹션을 role 필터와 함께 loop 재생할 수 있고, reduced-motion/키보드 조작이 동작한다.
7. **crash-safe project format + autosave (Issue #961)**
   - Acceptance: 버전 필드를 가진 프로젝트 포맷, 저장 실패 시 known-good 보존(PRx #970 방향), migration 테스트.
8. **Demucs 플랫폼 커버리지 + 모델 artifact 검증**
   - Acceptance: x86 macOS 폴백 경로가 명시되고(현재 demucs 미설치 시 불가), 모델 checkpoint checksum 검증이 intake pipeline에 있다.
9. **WCAG 2.2 AA gate (Issue #965) + rehearsal 컴포넌트 Storybook tokens (PR #897)**
   - Acceptance: axe 기반 자동 점검이 CI에 있고, GrooveMap/SectionRoadmap/RoleSwitcher stories가 token 기반으로 존재한다.
10. **JS coverage 90% -> 100% 상향 또는 Python과 동일한 기준 명문화**
    - Acceptance: vite.config/vitest thresholds 상향 또는 "Python 100%, JS 90%" 정책이 acceptance-criteria.md에 명시된다.

### P2

11. **HMM transition prior 문헌 교정 (5장 (c))**
    - Acceptance: transition 행렬 상수의 출처(문헌 or 교정 데이터)가 주석/ADR로 기록되고, sensitivity test가 존재한다.
12. **v2 transcription (docs/plans/2026-04-25-v2-transcription.md) 착지**
    - Acceptance: 에너지 휴리스틱 대체 모델이 parity/perf gate를 통과한다.
13. **협업 동기화(local_only -> planned_cloud) 설계 문서화**
    - Acceptance: syncMode 전환 시 데이터 흐름/권한 모델이 TRD로 문서화된다(네트워크 정책 준수).
14. **i18n 확장 전략(en/ko 외) 및 PR 시리즈 카피 키 일괄 정리**
    - Acceptance: 신규 카피가 locales에 key로 존재하고 particle-safe 한국어 규칙이 lint/check로 검증된다.
15. **redacted diagnostics/support bundle (Issue #962, PR #967)**
    - Acceptance: 로그에 raw audio/full URL 미포함이 자동 점검으로 확인된다.

## 8. APA 7th 참고문헌 (References)

본 문서에서 실제 인용한 개념(MIR novelty kernel, HMM/Viterbi 디코딩, 소스 분리 평가, librosa, 접근성 표준)에 한정한다.

Boulanger-Lewandowski, N., Bengio, Y., & Vincent, P. (2013). Audio chord recognition with recurrent neural networks. In Proceedings of the 14th International Society for Music Information Retrieval Conference (ISMIR 2013) (pp. 335–340). ISMIR.

Burgoyne, J. A., Wild, J., & Fujinaga, I. (2011). An expert ground truth set for audio chord recognition and music analysis. In Proceedings of the 12th International Society for Music Information Retrieval Conference (ISMIR 2011) (pp. 633–638). ISMIR.

Défossez, A., Usunier, N., Bottou, L., & Bach, F. (2019). Music source separation in the waveform domain. arXiv. https://arxiv.org/abs/1911.13254

Harte, C. (2010). Towards automatic extraction of harmony information from music signals (Doctoral dissertation, Queen Mary University of London).

Logan, B., & Chu, S. (2000). Music summary using hidden Markov models. In IEEE International Conference on Acoustics, Speech, and Signal Processing (ICASSP 2000) (Vol. 6, pp. 3673–3676). IEEE.

Pauwels, J., & Peeters, G. (2013). Combining harmony-based and melody-based chroma features for chord recognition. In Proceedings of the 14th International Society for Music Information Retrieval Conference (ISMIR 2013) (pp. 597–602). ISMIR.

Foote, J. (1999). Visualizing music and audio using self-similarity. In Proceedings of the Seventh ACM International Conference on Multimedia (Multimedia '99) (pp. 77–80). ACM.

Le Roux, J., Wisdom, S., Erdogan, H., & Hershey, J. R. (2019). SDR – half-baked or well done? In IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP 2019) (pp. 626–630). IEEE.

McFee, B., Raffel, C., Liang, D., Ellis, D. P. W., McVicar, M., Battenberg, E., & Nieto, O. (2015). librosa: Audio and music signal analysis in Python. In Proceedings of the 14th Python in Science Conference (SciPy 2015) (pp. 18–24).

Müller, M. (2015). Fundamentals of music processing: Audio, analysis, algorithms, applications. Springer.

Viterbi, A. J. (1967). Error bounds for convolutional codes and an asymptotically optimum decoding algorithm. IEEE Transactions on Information Theory, 13(2), 260–269.

W3C. (2023). Web Content Accessibility Guidelines (WCAG) 2.2. World Wide Web Consortium. https://www.w3.org/TR/WCAG22/

참고: 위 항목 중 DOI가 확실치 않은 항목은 DOI 없이 plain APA로 기술했다(조작 금지 원칙). 코드 내 개념 대응: Foote(1999)=checkerboard novelty, Viterbi(1967)/Boulanger-Lewandowski et al.(2013)=HMM 코드 디코딩 prior, Défossez et al.(2019)=Demucs htdemucs, Le Roux et al.(2019)=SI-SDR(audio_separator.py 주석 언급), Müller(2015)/McFee et al.(2015)=섹션/코드/음역 분석 기반 라이브러리.

## 9. 검증 방법 (Verification Method)

각 절의 근거와 재실행 명령.

- Repo root: `git rev-parse --show-toplevel` -> `/Users/seonghobae/bandscope`
- 문서 소스 read: `ARCHITECTURE.md`, `AGENTS.md`, `docs/brand-story.md`, `docs/security/app-security.md`, `docs/workflow/one-day-delivery-plan.md`, `docs/engineering/acceptance-criteria.md`, `docs/plans/2026-03-27-bandscope-roadmap-completion.md`
- Open PR inventory:
  ```bash
  gh pr list --state open --limit 200 --json number,title,isDraft,headRefName \
    --jq 'sort_by(-.number) | .[] | "\(.number)\t\(.isDraft)\t\(.title)"' > /tmp/opencode/open_prs_full.txt
  wc -l /tmp/opencode/open_prs_full.txt   # 130
  gh pr view 1021 --json title,body       # 시리즈 패턴 샘플
  ```
- Open issues: `gh issue list --state open --limit 50 --json number,title --jq '.[]|"\(.number)\t\(.title)"'`
- 코드 검증 grep/glob (요지):
  - `grep -rn "padPlan\|PadPlan" apps/desktop/src packages/shared-types/src` -> 0건(시리즈 미착지 확인)
  - `find services/analysis-engine -name "*.py"` -> 모듈 목록(chords/sections/roles/ranges/temporal/separation/transcription/youtube/exports)
  - `sed -n '70,110p' .../chords/chord_recognizer.py` -> hand-set transition prior 확인
  - `sed -n '1,40p' .../_native.py` -> bandscope_numeric 커널/parity 확인
  - `ls services/analysis-engine/rust` + `grep maturin rust/pyproject.toml` -> Rust 커널 위치 확인
  - `head -30 separation/model_weights/bandsplit-v1.json` -> 휴리스틱 manifest 확인
  - `grep -rn "aria-" apps/desktop/src/features/workspace/*.tsx | wc -l` -> 52
  - `grep -rln "RehearsalAssignment\|RehearsalCollaboration" apps/desktop/src` -> 0건(UI 미구현 확인)
  - `grep -rn "loop" apps/desktop/src/features/player/index.tsx` -> 0건(loop 미구현 확인)
  - `ls CHANGELOG.md VERSION .github/workflows` -> 릴리스 자산 확인
  - `grep -n thresholds apps/desktop/vite.config.ts packages/shared-types/vitest.config.ts` -> JS 90% 확인
  - `grep -n "cov-fail-under" AGENTS.md docs` -> Python 100% gate 확인
  - Mermaid 존재 여부: `grep -rln "sequenceDiagram\|classDiagram\|flowchart" docs ARCHITECTURE.md` -> 0건(6장 전제 확인)

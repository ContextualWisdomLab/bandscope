# BandScope Product and Technical Gap Baseline

**Status:** Proposed baseline  
**Snapshot date:** 2026-08-20 (Asia/Seoul)  
**Protected base reviewed:** `develop@acdbea6344fe1231c39535b575f4de35e4c607c9`  
**Open pull requests inventoried:** 83  
**Program issue:** [#958](https://github.com/ContextualWisdomLab/bandscope/issues/958)

> This document is a point-in-time product-readiness baseline, not a claim that any listed pull request is merge-ready. Pull-request heads, checks, reviews, and branch-protection decisions can change after this snapshot. Before any merge, the exact live head must be refreshed and revalidated.

## Executive conclusion

BandScope already has a credible local-first product boundary, a typed Tauri/Python analysis architecture, extensive security hardening, and substantial rehearsal-oriented UI work. It is not yet a complete commercial desktop product.

The protected snapshot does not yet demonstrate the complete buyer journey:

```text
install a trusted build
→ import a real song
→ obtain measurably accurate analysis
→ actively rehearse with the analysis
→ save and recover the project
→ share a bounded handoff
→ diagnose failure without leaking the song
→ update or roll back safely
```

The highest-leverage work is therefore not another isolated cue card. It is to converge the current queue into measurable product verticals and finish the missing distribution, active rehearsal, durability, supportability, activation, accessibility, and scientific-evidence boundaries.

## Product boundary

BandScope is a **local-first rehearsal decision tool**. It should help musicians understand a recording, decide what to practise, and rehearse the difficult passage. It is not a notation editor, DAW, plugin host, cloud-storage product, or autonomous authority over musical truth.

The product must preserve these claim boundaries:

- analysis results are evidence-backed recommendations, not infallible transcription;
- local files remain local unless the user explicitly exports a bounded artifact;
- a visual state, mocked array, skipped GPU test, predecessor-head check, or unsigned package is not production evidence;
- unsupported stems, roles, formats, or model capabilities fail honestly rather than fabricating a result.

## Evidence reviewed

The investigation covered:

- repository metadata and the protected `develop` tree;
- README, architecture, acceptance, release, deployment, package, Tauri, workflow, Rust, TypeScript, and Python surfaces;
- all 83 open pull requests returned by the connected GitHub account;
- existing canonical product/security issues;
- saved Figma file `BP30foevuRtufwRpTknZUw`;
- current official guidance for Tauri signing/updating, Apple notarization, Microsoft signing, WCAG 2.2, and music-information-retrieval evaluation.

## Buyer-visible completion gaps

| Priority | Gap | Current evidence | Buyer impact | Owning issue |
|---:|---|---|---|---|
| P0 | Trusted distribution and update | Version `0.1.3`; release workflow is principally validation/preflight; no complete signed/notarized updater and rollback evidence | Buyers cannot establish publisher trust or safely update/repair | [#960](https://github.com/ContextualWisdomLab/bandscope/issues/960) |
| P0 | Active rehearsal player | Many cue/action PRs exist, but there is no single timing/playback authority proving count-in, precise looping, rate, cue navigation, and role controls through the production desktop boundary | Analysis does not yet close the loop into repeated practice | [#961](https://github.com/ContextualWisdomLab/bandscope/issues/961) |
| P0 | Crash-safe durable projects | Durable project truth, autosave, atomic publish, migrations, backups, recovery, and rollback are not governed by one versioned format | A crash or upgrade can threaten user work and trust | [#962](https://github.com/ContextualWisdomLab/bandscope/issues/962) |
| P0 | Scientific acceptance | Real decoded-audio acceptance exists as work in progress, but the broader licensed multi-fixture MIR program, recognized metrics, uncertainty, CPU/GPU parity, and claim matrix are not closed | Musicians cannot judge where results are trustworthy | [#770](https://github.com/ContextualWisdomLab/bandscope/issues/770) |
| P0 | Resource/cancellation contract | Canonical local-audio admission is being developed, but all decode, separation, analysis, PDF, cancellation, and fallback paths must converge | Large or hostile files can degrade availability or create inconsistent behavior | [#781](https://github.com/ContextualWisdomLab/bandscope/issues/781) |
| P1 | Diagnostics and support evidence | Multiple redaction fixes exist, but no single typed local diagnostics contract or previewable support bundle exists | Failures remain expensive to diagnose and risk leaking private paths/content | [#963](https://github.com/ContextualWisdomLab/bandscope/issues/963) |
| P1 | First-run activation | Empty states and next-action PRs exist, but no licensed demo proves time-to-first-rehearsal through the production path | A new buyer cannot evaluate value quickly or reproducibly | [#964](https://github.com/ContextualWisdomLab/bandscope/issues/964) |
| P1 | Design and accessibility parity | Storybook work is open. The saved Figma file claims 28 pages but currently exposes two top-level pages; its footer and protected repository/runtime metadata both cite `0.1.3`, so the remaining gap is implementation/design parity rather than version drift | Design status can be mistaken for shipped behavior; assistive-technology acceptance is incomplete | [#965](https://github.com/ContextualWisdomLab/bandscope/issues/965) |
| P0 | PR queue convergence | 83 open PRs include canonical bases, small feature slices, security repairs, dependency updates, and overlapping writers | Review drift and ancestry conflicts prevent coherent delivery | [#966](https://github.com/ContextualWisdomLab/bandscope/issues/966) |

## Completion program

| Issue | Product outcome |
|---|---|
| [#958](https://github.com/ContextualWisdomLab/bandscope/issues/958) | Parent BandScope 1.0 completion program and commercial definition of done |
| [#960](https://github.com/ContextualWisdomLab/bandscope/issues/960) | Signed/notarized, provenance-backed desktop release and verified updater |
| [#961](https://github.com/ContextualWisdomLab/bandscope/issues/961) | Active rehearsal transport, loop, count-in, cue navigation, and honest role controls |
| [#962](https://github.com/ContextualWisdomLab/bandscope/issues/962) | Versioned project schema, atomic save, autosave, migration, backup, and recovery |
| [#963](https://github.com/ContextualWisdomLab/bandscope/issues/963) | Typed redacted diagnostics, crash evidence, and offline support bundle |
| [#964](https://github.com/ContextualWisdomLab/bandscope/issues/964) | Licensed demo and measurable first-run rehearsal journey |
| [#965](https://github.com/ContextualWisdomLab/bandscope/issues/965) | Figma/Storybook/shipped-UI parity and WCAG 2.2 AA acceptance |
| [#966](https://github.com/ContextualWisdomLab/bandscope/issues/966) | Dependency-aware merge trains and explicit PR succession |

Existing canonical work that must be preserved rather than duplicated includes [#610](https://github.com/ContextualWisdomLab/bandscope/issues/610), [#739](https://github.com/ContextualWisdomLab/bandscope/issues/739), [#770](https://github.com/ContextualWisdomLab/bandscope/issues/770), [#781](https://github.com/ContextualWisdomLab/bandscope/issues/781), [#526](https://github.com/ContextualWisdomLab/bandscope/issues/526), [#542](https://github.com/ContextualWisdomLab/bandscope/issues/542), [#779](https://github.com/ContextualWisdomLab/bandscope/issues/779), [#847](https://github.com/ContextualWisdomLab/bandscope/issues/847), [#852](https://github.com/ContextualWisdomLab/bandscope/issues/852), and [#864](https://github.com/ContextualWisdomLab/bandscope/issues/864).

## Merge-train model

| Train | Responsibility | Initial live PR count | Completion issue |
|---|---|---:|---|
| `T0` | Dependency, toolchain, workflow and quality base | 30 | [#966](https://github.com/ContextualWisdomLab/bandscope/issues/966) |
| `T1` | Local input, filesystem authority, resource admission and cancellation | 6 | [#781](https://github.com/ContextualWisdomLab/bandscope/issues/781), [#962](https://github.com/ContextualWisdomLab/bandscope/issues/962) |
| `T2` | Scientific accuracy, MIR evaluation and numerical parity | 8 | [#770](https://github.com/ContextualWisdomLab/bandscope/issues/770) |
| `T3` | Rehearsal actions and active-player vertical | 23 | [#961](https://github.com/ContextualWisdomLab/bandscope/issues/961) |
| `T4` | Project portability, handoff and interoperability | 2 | [#739](https://github.com/ContextualWisdomLab/bandscope/issues/739), [#962](https://github.com/ContextualWisdomLab/bandscope/issues/962) |
| `T5` | Activation, UI system, Storybook and accessibility | 8 | [#964](https://github.com/ContextualWisdomLab/bandscope/issues/964), [#965](https://github.com/ContextualWisdomLab/bandscope/issues/965) |
| `T6` | Diagnostics, redaction, security evidence and supportability | 6 | [#963](https://github.com/ContextualWisdomLab/bandscope/issues/963) |
| `T7` | Signed commercial release and updater | 0 current implementation PRs in this snapshot | [#960](https://github.com/ContextualWisdomLab/bandscope/issues/960) |

The routing below is an **initial product-boundary classification**, not a merge-readiness verdict. Issue #966 must refresh exact head SHAs, dependency edges, current checks, current reviews, unresolved threads, and succession before any action.

## Current open PR inventory

| PR | Title | Initial train | Required next action |
|---:|---|---|---|
| [731](https://github.com/ContextualWisdomLab/bandscope/pull/731) | 🎨 Palette: 향상된 접근성을 위해 아이콘 버튼에 툴팁 및 aria-disabled 적용 | `T5` | Triage against the live exact head before action |
| [732](https://github.com/ContextualWisdomLab/bandscope/pull/732) | ⚡ Chords: vectorize HMM reference and correct relative-key prior | `T2` | Triage against the live exact head before action |
| [737](https://github.com/ContextualWisdomLab/bandscope/pull/737) | feat(integration): add versioned naruon rehearsal handoff | `T4` | Triage against the live exact head before action |
| [740](https://github.com/ContextualWisdomLab/bandscope/pull/740) | feat: import rehearsal handoffs for focused reanalysis | `T4` | Triage against the live exact head before action |
| [744](https://github.com/ContextualWisdomLab/bandscope/pull/744) | feat(i18n): localize Workspace controls and harden interpolation | `T5` | Triage against the live exact head before action |
| [746](https://github.com/ContextualWisdomLab/bandscope/pull/746) | perf(segmenter): vectorize checkerboard novelty reference | `T2` | Triage against the live exact head before action |
| [750](https://github.com/ContextualWisdomLab/bandscope/pull/750) | fix(score): validate PDF bridge byte arrays without coercion | `T1` | Triage against the live exact head before action |
| [754](https://github.com/ContextualWisdomLab/bandscope/pull/754) | build(deps): bump time from 0.3.53 to 0.3.55 in /apps/desktop/src-tauri | `T0` | Triage against the live exact head before action |
| [776](https://github.com/ContextualWisdomLab/bandscope/pull/776) | feat(chords): surface actionable rehearsal guidance | `T3` | Triage against the live exact head before action |
| [780](https://github.com/ContextualWisdomLab/bandscope/pull/780) | fix(security): keep every CodeQL Action phase on one revision | `T0` | Triage against the live exact head before action |
| [783](https://github.com/ContextualWisdomLab/bandscope/pull/783) | fix(security): establish canonical npm, PDF.js, Nanoid, and Undici baseline | `T0` | Triage against the live exact head before action |
| [811](https://github.com/ContextualWisdomLab/bandscope/pull/811) | 🔒 [보안] CLI 무제한 파일 읽기 취약점 수정 | `T1` | Triage against the live exact head before action |
| [824](https://github.com/ContextualWisdomLab/bandscope/pull/824) | 🧪 테스트: 줄기 분리 시간 초과 처리 테스트 추가 | `T1` | Triage against the live exact head before action |
| [826](https://github.com/ContextualWisdomLab/bandscope/pull/826) | 🧪 [테스트 개선] TemporalAnalyzer 분석 오류 테스트 추가 | `T6` | Triage against the live exact head before action |
| [827](https://github.com/ContextualWisdomLab/bandscope/pull/827) | fix(desktop): remove synthetic browser analysis success | `T2` | Triage against the live exact head before action |
| [828](https://github.com/ContextualWisdomLab/bandscope/pull/828) | test(analysis): govern real YouTube known-stem benchmark | `T2` | Triage against the live exact head before action |
| [833](https://github.com/ContextualWisdomLab/bandscope/pull/833) | 🎨 Palette: 코드 수정 버튼에 접근성 있는 툴팁 지원 추가 | `T5` | Triage against the live exact head before action |
| [834](https://github.com/ContextualWisdomLab/bandscope/pull/834) | ⚡ Bolt: O(1) 메모리로 순차적 코드 변경 횟수 계산 최적화 | `T2` | Triage against the live exact head before action |
| [845](https://github.com/ContextualWisdomLab/bandscope/pull/845) | feat(analysis): CSV 큐시트 내보내기 기능 및 수식 주입 보안 로직 추가 | `T3` | Triage against the live exact head before action |
| [849](https://github.com/ContextualWisdomLab/bandscope/pull/849) | ⚡ Bolt: 차트 내보내기(chart.py)의 중복 제거 로직 O(N^2)에서 O(N)으로 최적화 | `T5` | Triage against the live exact head before action |
| [850](https://github.com/ContextualWisdomLab/bandscope/pull/850) | feat: add Part Handoff Map UI component to workspace | `T3` | Triage against the live exact head before action |
| [858](https://github.com/ContextualWisdomLab/bandscope/pull/858) | fix(security): bind analysis paths to filesystem authority | `T1` | Triage against the live exact head before action |
| [859](https://github.com/ContextualWisdomLab/bandscope/pull/859) | ⚡ Bolt: GrooveMap의 maxTime 계산 성능 개선 | `T5` | Triage against the live exact head before action |
| [861](https://github.com/ContextualWisdomLab/bandscope/pull/861) | test(quality): enforce Python branch coverage | `T0` | Triage against the live exact head before action |
| [865](https://github.com/ContextualWisdomLab/bandscope/pull/865) | fix(score): bound native PDF reads before allocation | `T1` | Triage against the live exact head before action |
| [866](https://github.com/ContextualWisdomLab/bandscope/pull/866) | fix(audio): establish canonical local-audio resource policy | `T1` | Triage against the live exact head before action |
| [867](https://github.com/ContextualWisdomLab/bandscope/pull/867) | test(supply-chain): preserve simple dependency-path cycle semantics | `T0` | Triage against the live exact head before action |
| [873](https://github.com/ContextualWisdomLab/bandscope/pull/873) | feat(roles): wire measured register overlap into section warnings | `T2` | Triage against the live exact head before action |
| [874](https://github.com/ContextualWisdomLab/bandscope/pull/874) | feat(workspace): name the parts to lock in first | `T3` | Triage against the live exact head before action |
| [881](https://github.com/ContextualWisdomLab/bandscope/pull/881) | test(ci): lock local OpenCode small_model to NVIDIA NIM | `T0` | Triage against the live exact head before action |
| [884](https://github.com/ContextualWisdomLab/bandscope/pull/884) | feat(workspace): open Stem Lab as honest isolation lanes | `T3` | Triage against the live exact head before action |
| [891](https://github.com/ContextualWisdomLab/bandscope/pull/891) | test(analysis): lock verse/chorus chord recovery on a known take | `T2` | Triage against the live exact head before action |
| [892](https://github.com/ContextualWisdomLab/bandscope/pull/892) | fix(analysis): score C major acceptance from decoded WAV bytes | `T2` | Triage against the live exact head before action |
| [894](https://github.com/ContextualWisdomLab/bandscope/pull/894) | fix(security): drop persisted credentials before dependency lifecycle code | `T0` | Triage against the live exact head before action |
| [895](https://github.com/ContextualWisdomLab/bandscope/pull/895) | fix(workflows): audit orphaned Actions registry identities | `T0` | Triage against the live exact head before action |
| [896](https://github.com/ContextualWisdomLab/bandscope/pull/896) | build(node): coordinate Node 22.22.2 floor with jsdom 30 | `T0` | Triage against the live exact head before action |
| [897](https://github.com/ContextualWisdomLab/bandscope/pull/897) | feat(workspace): Storybook tokens for rehearsal components | `T5` | Triage against the live exact head before action |
| [898](https://github.com/ContextualWisdomLab/bandscope/pull/898) | feat(workspace): put the next rehearsal action on empty and error cards | `T5` | Triage against the live exact head before action |
| [899](https://github.com/ContextualWisdomLab/bandscope/pull/899) | feat(workspace): open existing rehearsal surfaces from the sidebar | `T5` | Triage against the live exact head before action |
| [900](https://github.com/ContextualWisdomLab/bandscope/pull/900) | feat(workspace): name tonight's export and priority actions | `T3` | Triage against the live exact head before action |
| [901](https://github.com/ContextualWisdomLab/bandscope/pull/901) | feat(workspace): start tonight's first part from the ready board | `T3` | Triage against the live exact head before action |
| [903](https://github.com/ContextualWisdomLab/bandscope/pull/903) | feat(workspace): loop tonight's first section on the map | `T3` | Triage against the live exact head before action |
| [904](https://github.com/ContextualWisdomLab/bandscope/pull/904) | feat(workspace): count in tonight's first section on the map | `T3` | Triage against the live exact head before action |
| [905](https://github.com/ContextualWisdomLab/bandscope/pull/905) | feat(workspace): open tonight's first notes on the groove map | `T3` | Triage against the live exact head before action |
| [907](https://github.com/ContextualWisdomLab/bandscope/pull/907) | chore(env): add Cloud Agent environment config | `T0` | Triage against the live exact head before action |
| [910](https://github.com/ContextualWisdomLab/bandscope/pull/910) | feat(workspace): set up tonight's part before the first entrance | `T3` | Triage against the live exact head before action |
| [912](https://github.com/ContextualWisdomLab/bandscope/pull/912) | feat(workspace): guide tonight's first entrance on map and player | `T3` | Triage against the live exact head before action |
| [913](https://github.com/ContextualWisdomLab/bandscope/pull/913) | feat(workspace): guide tonight's first lyric cue on map and player | `T3` | Triage against the live exact head before action |
| [914](https://github.com/ContextualWisdomLab/bandscope/pull/914) | feat(workspace): guide tonight's first dropout on map and player | `T3` | Triage against the live exact head before action |
| [916](https://github.com/ContextualWisdomLab/bandscope/pull/916) | feat(workspace): guide tonight's first pickup on map and player | `T3` | Triage against the live exact head before action |
| [918](https://github.com/ContextualWisdomLab/bandscope/pull/918) | build(deps): bump uuid from 1.23.4 to 1.24.1 in /apps/desktop/src-tauri | `T0` | Triage against the live exact head before action |
| [919](https://github.com/ContextualWisdomLab/bandscope/pull/919) | build(deps): update numba requirement from &lt;0.67.0 to &lt;0.68.0 in /services/analysis-engine | `T0` | Triage against the live exact head before action |
| [920](https://github.com/ContextualWisdomLab/bandscope/pull/920) | build(deps): bump react and @types/react | `T0` | Triage against the live exact head before action |
| [921](https://github.com/ContextualWisdomLab/bandscope/pull/921) | build(deps): bump @base-ui/react from 1.5.0 to 1.7.0 | `T0` | Triage against the live exact head before action |
| [922](https://github.com/ContextualWisdomLab/bandscope/pull/922) | build(deps-dev): bump storybook from 10.4.6 to 10.5.8 | `T0` | Triage against the live exact head before action |
| [923](https://github.com/ContextualWisdomLab/bandscope/pull/923) | build(deps-dev): bump @storybook/react-vite from 10.4.6 to 10.5.8 | `T0` | Triage against the live exact head before action |
| [924](https://github.com/ContextualWisdomLab/bandscope/pull/924) | build(deps): bump github/codeql-action/init from 4.37.0 to 4.37.7 | `T0` | Triage against the live exact head before action |
| [925](https://github.com/ContextualWisdomLab/bandscope/pull/925) | build(deps-dev): bump typescript-eslint from 8.63.0 to 8.67.0 | `T0` | Triage against the live exact head before action |
| [926](https://github.com/ContextualWisdomLab/bandscope/pull/926) | build(deps): bump lucide-react from 1.24.0 to 1.31.0 | `T0` | Triage against the live exact head before action |
| [927](https://github.com/ContextualWisdomLab/bandscope/pull/927) | build(deps): bump sonner from 2.0.7 to 2.0.8 | `T0` | Triage against the live exact head before action |
| [928](https://github.com/ContextualWisdomLab/bandscope/pull/928) | build(deps-dev): bump eslint-plugin-jsdoc from 63.0.13 to 64.2.0 | `T0` | Triage against the live exact head before action |
| [929](https://github.com/ContextualWisdomLab/bandscope/pull/929) | build(deps-dev): bump @testing-library/jest-dom from 6.9.1 to 7.0.1 | `T0` | Triage against the live exact head before action |
| [930](https://github.com/ContextualWisdomLab/bandscope/pull/930) | build(deps): bump github/codeql-action/autobuild from 4.37.0 to 4.37.7 | `T0` | Triage against the live exact head before action |
| [931](https://github.com/ContextualWisdomLab/bandscope/pull/931) | build(deps): bump astral-sh/setup-uv from 8.3.2 to 10.0.1 | `T0` | Triage against the live exact head before action |
| [932](https://github.com/ContextualWisdomLab/bandscope/pull/932) | build(deps): bump github/codeql-action/analyze from 4.37.0 to 4.37.7 | `T0` | Triage against the live exact head before action |
| [933](https://github.com/ContextualWisdomLab/bandscope/pull/933) | build(deps): bump github/codeql-action/upload-sarif from 4.37.0 to 4.37.7 | `T0` | Triage against the live exact head before action |
| [934](https://github.com/ContextualWisdomLab/bandscope/pull/934) | feat(workspace): guide tonight's first stop on map and player | `T3` | Triage against the live exact head before action |
| [936](https://github.com/ContextualWisdomLab/bandscope/pull/936) | build(deps): bump the uv group across 1 directory with 2 updates | `T0` | Triage against the live exact head before action |
| [937](https://github.com/ContextualWisdomLab/bandscope/pull/937) | feat(workspace): guide tonight's first labeled handoff on map and player | `T3` | Triage against the live exact head before action |
| [939](https://github.com/ContextualWisdomLab/bandscope/pull/939) | feat(workspace): guide tonight's first chorus on map and player | `T3` | Triage against the live exact head before action |
| [941](https://github.com/ContextualWisdomLab/bandscope/pull/941) | 🛡️ Sentinel: CSV 수식 주입 NUL·전각 연산자 우회 차단 | `T6` | Triage against the live exact head before action |
| [942](https://github.com/ContextualWisdomLab/bandscope/pull/942) | build(deps): bump react-dom and @types/react-dom | `T0` | Triage against the live exact head before action |
| [943](https://github.com/ContextualWisdomLab/bandscope/pull/943) | feat(workspace): guide tonight's first intro on map and player | `T3` | Triage against the live exact head before action |
| [944](https://github.com/ContextualWisdomLab/bandscope/pull/944) | build(rust): pin all product and release lanes to 1.97.1 | `T0` | Triage against the live exact head before action |
| [946](https://github.com/ContextualWisdomLab/bandscope/pull/946) | feat(workspace): guide tonight's first bridge on map and player | `T3` | Triage against the live exact head before action |
| [947](https://github.com/ContextualWisdomLab/bandscope/pull/947) | feat(workspace): guide tonight's first verse on map and player | `T3` | Triage against the live exact head before action |
| [948](https://github.com/ContextualWisdomLab/bandscope/pull/948) | fix(security): retire quick-xml RustSec exceptions | `T0` | Triage against the live exact head before action |
| [949](https://github.com/ContextualWisdomLab/bandscope/pull/949) | fix(security): redact key detector dependency failures | `T6` | Triage against the live exact head before action |
| [950](https://github.com/ContextualWisdomLab/bandscope/pull/950) | fix(security): redact temporal detector failure logs | `T6` | Triage against the live exact head before action |
| [951](https://github.com/ContextualWisdomLab/bandscope/pull/951) | fix(security): redact range-analysis failure logs | `T6` | Triage against the live exact head before action |
| [955](https://github.com/ContextualWisdomLab/bandscope/pull/955) | feat(workspace): guide tonight's first pre-chorus on map and player | `T3` | Triage against the live exact head before action |
| [956](https://github.com/ContextualWisdomLab/bandscope/pull/956) | fix(security): redact articulation failure logs | `T6` | Triage against the live exact head before action |
| [957](https://github.com/ContextualWisdomLab/bandscope/pull/957) | feat(workspace): name tonight's first playable range on the map | `T3` | Triage against the live exact head before action |

## Required execution order

1. Establish the canonical dependency, toolchain, workflow, and branch-coverage base.
2. Refresh the live PR graph and remove unrelated lock/toolchain drift from feature heads.
3. Complete local input/resource/cancellation and real-audio scientific acceptance.
4. Consolidate cue/action slices behind one active rehearsal-player contract.
5. Establish the versioned project/persistence boundary and portable handoff distinction.
6. Complete first-run activation, Storybook, Figma parity, localization, and end-to-end accessibility.
7. Consolidate diagnostics/redaction into one supportability contract.
8. Cut the signed/notarized updater-backed release only from the protected, evidenced product vertical.

For each train:

```text
refresh live queue
→ validate canonical predecessor
→ inspect current review threads
→ repair root causes
→ remove unrelated drift
→ run current-head checks
→ obtain qualifying independent approval
→ merge or enable auto-merge
→ restack the next PR
→ close superseded duplicates with succession evidence
→ refresh this baseline
```

Waiting for one train's external review or hosted runner is not a reason to stop work on an independent train. It is also not permission to create a competing writer or transfer stale evidence.

## BandScope 1.0 commercial definition of done

### Product outcome

- A clean supported Windows or macOS installation reaches one useful rehearsal action without terminal setup.
- A licensed demo and a user-selected local file use the same production intake, decode, analysis, player, save, and recovery boundaries.
- Analysis quality is reported with recognized metrics, fixture rights, uncertainty, backend parity, and explicit limitations.
- The user can repeat a selected passage using a deterministic, accessible rehearsal player.
- Project work survives ordinary restart, crash, interrupted write, migration, and supported rollback.
- A bounded rehearsal handoff preserves provenance without granting filesystem or network authority.

### Trust, privacy, and operations

- Windows artifacts are signed; macOS artifacts are signed and notarized.
- The updater verifies signatures/digests, works offline when unavailable, and has a tested recovery path.
- No ordinary log or support artifact contains raw audio, project payloads, credentials, absolute paths, or unnecessary PII.
- Support evidence is deterministic, bounded, user-previewable, and useful without uploading the song.
- All security, dependency, model, benchmark, and release artifacts are bound to the exact protected source commit.

### Accessibility and design

- Keyboard-only and screen-reader users complete first-run, import, analyze, rehearse, save/recover, share, support, and update-decision journeys.
- Charts, timelines, waveforms, confidence displays, and exports preserve exact values, units, warnings, and uncertainty.
- Code tokens, Storybook stories, Figma components, localization keys, runtime version, and shipped UI have an explicit parity matrix.
- Korean and English provide equivalent choices, limitations, privacy statements, and next actions.

### Engineering evidence

- Every open PR belongs to exactly one train and has an explicit disposition.
- There is one active canonical writer per product boundary or a declared stack order.
- Duplicate/superseded work is closed only after unique tests and requirements are transferred.
- Every merged exact head has all required terminal-success checks, qualifying independent approval, zero unresolved actionable threads, 100% repository-owned production statement/branch coverage, and complete public API documentation.
- The final release includes checksums, SBOM, provenance/attestation, migration/recovery evidence, accessibility evidence, and MIR accuracy evidence.

## Explicit non-goals

- Do not merge all 83 PRs merely to reduce the count.
- Do not turn BandScope into a DAW, notation editor, or mandatory cloud service.
- Do not claim unsigned validation artifacts are releases.
- Do not use synthetic arrays, mocked browser success, skipped GPU execution, stale checks, or predecessor-head approval as product evidence.
- Do not treat Figma labels or unimplemented Storybook states as shipped features.
- Do not silently discard project fields, unsupported analysis, migration data, or user corrections.

## Known limitations of this snapshot

- Exact PR head SHAs were not frozen into this human baseline because active branches can advance while the inventory is reviewed. The machine-readable seed marks them for refresh before action.
- This document does not assert that any existing PR is approved, passing, or safe to merge.
- The Figma inspection is a point-in-time metadata/structure review; visual and interaction acceptance remains issue #965 work.
- The investigation created requirements and a convergence plan. It did not implement, merge, sign, notarize, benchmark, or release the product.

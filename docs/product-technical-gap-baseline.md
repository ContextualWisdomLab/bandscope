# Product and technical gap baseline

## Authority and status

- Status: **Proposed / Draft / merge HOLD**
- Repository: `ContextualWisdomLab/bandscope`
- Pull request: [#1276](https://github.com/ContextualWisdomLab/bandscope/pull/1276)
- RED exact head: `cf8e0fbff81b58ddaca72c8eda83a9d2a805a53a`
- RED run/job: [CI 36609115637 / build-and-test 109721964531](https://github.com/ContextualWisdomLab/bandscope/actions/runs/36609115637/job/109721964531)

This document records proposed pull-request evidence. Protected branches and releases remain production authority.

## Goal and PRD acceptance

BandScope must accept large score-PDF byte responses without per-element callback overhead while preserving fail-closed response validation and the local-only Tauri IPC boundary.

Acceptance requires one unchanged exact head with the linear validation and valid/invalid response tests, complete repository quickcheck, native Rust, Security, SAST, SBOM, CodeQL and platform-build evidence, plus qualifying independent approval before ordinary merge.

## TRD and Context Map

`React score storage -> Tauri invoke boundary -> validated Uint8Array -> local PDF consumer`

The product owns the score-storage adapter and tests. Reusable workflows remain owned by `ContextualWisdomLab/.github`; this repair copies no workflow.

## RCA

The PR-added regression test used `catch (e)` without reading `e`. ESLint failed with `@typescript-eslint/no-unused-vars` at `scoreStorage.test.ts:159`, stopping `./scripts/harness/quickcheck.sh` before later suites. This is a source-controlled test defect, not runner, provider, or network transience.

The minimal repair uses an optional catch binding (`catch {}`). It changes no runtime behavior, PDF parsing rule, dependency, fixture size, security decision, or gate.

## Gap and action status

| Gap | Action | Status |
|---|---|---|
| Exact-head desktop lint fails on an unused exception binding | Replace it with an optional catch binding | Implemented; hosted GREEN pending |
| Durable RCA and acceptance evidence were absent | Add this baseline and synchronize CHANGELOG/PR evidence | Implemented |
| Exact-head hosted checks and independent approval are incomplete | Require terminal evidence on the new head | Open / merge HOLD |

## Security Notes

Score PDF bytes remain untrusted input. This repair does not widen accepted types, add a network path, alter the Tauri IPC trust boundary, or suppress validation errors. Invalid bridge responses continue to fail closed. Pending, queued, skipped, cancelled, and predecessor results are not passing evidence.


## 2026-10-01 — urllib3 exact-head Security RCA

- RED exact head: `d5f8fa53d149fe6fd99cb2e5aa27bdb942e7156c`
- RED evidence: [Security 36834013648 / Trivy 110276991854](https://github.com/ContextualWisdomLab/bandscope/actions/runs/36834013648/job/110276991854)
- Findings: CVE-2026-97687 and CVE-2026-97689 (HIGH), CVE-2026-97688 (MEDIUM) in `services/analysis-engine/uv.lock` at urllib3 2.7.0.
- Repair: declare urllib3 `>=2.8.0`, resolve the published 2.8.0 sdist/wheel with hashes, and bind both source floor and lock selection in a repository regression test.
- Status: implemented; fresh exact-head Security and complete product checks required. No advisory ignore, scanner suppression, or stale-head promotion is used.


## 2026-10-01 — independent review repair

CodeRabbit correctly found that the original `TAURI_INTERNALS` regression swallowed every failure. The repair mocks the statically imported Tauri invoke boundary, removes the catch, and asserts both the resolved attachment and exact command arguments. Documentation now states that both validation forms are synchronous O(N) scans and makes the optimization contingent on representative measurement.

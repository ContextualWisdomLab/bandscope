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

## 2026-10-01 — exact-head formatter RCA

- Evidence: CI run 36834621672, job 110279214152 reached the repository quickcheck and failed only at `ruff format --check src tests`; `tests/test_supply_chain_policy.py` would be reformatted.
- Root cause: the urllib3 regression test added at head `7e2d7a2d3fc5d533f245ca00285b4f75fad3fb7b` had only one blank line between top-level tests.
- Repair: commit `79ccc874bd6fbcc60c00050b935e73f5f9e43228` restored top-level separation; CI `36835015610`, job `110280400315` proved the file still differed from the pinned Ruff 0.15.5/100-column output. Commit `c2073b8b2d6be0d6717b69d49f6e58fae226f837` applies that exact formatter output without changing the dependency contract or assertions.
- Status: repaired from the exact log and pinned formatter; fresh exact-head checks remain required. Predecessor success, skipped CodeQL, and in-progress platform builds are not promotion evidence.

## 2026-10-01 — concurrent regression preservation

- Evidence: concurrent fast-forward commit `02e7c9f0868497782c9a0637dbcf9f371161db6c` preserved repository history but reverted the verified urllib3 2.8.0 floor/lock, the source-lock contract, independent-review test assertions, measured O(N) documentation, CHANGELOG entries, and this baseline.
- Integration decision: preserve that commit in ordinary history while restoring the eight exact validated paths from `9ed6a14161ebe305d406d0c47c646c40802f3368`; no force push, destructive rebase, or valid-delta disposal is used.
- Verification before the concurrent commit: exact-head CI run `36835445115` completed npm lock validation, complete quickcheck, Rust check, and Tauri tests successfully; SBOM run `36835445233` succeeded. Fresh checks remain required after restoration because predecessor evidence is not current-head evidence.

## 2026-10-01 — repeated writer regression

- Evidence: fast-forward commit `fa1c477c5516ec47004b28fddd178c2731e37c9e` repeated the same eight-path security, contract, review, and documentation rollback after the first restoration.
- Control: the PR was moved to Draft before the second restoration so the not-ready branch keeps all valid history while automated writers and reviewers stop treating it as merge-admissible.
- Restoration: the eight validated paths from `347cf973628e351bd59a3b0b77889080666ba708` are restored by ordinary commits. Promotion remains blocked until the head stays stable and fresh checks complete; Draft, cancellation, and predecessor results are not GREEN.


## 2026-10-01 — third repeated writer regression

- Evidence: fast-forward commit `e616968854bdce234f275018bf62862943684f75` again reverted the same eight validated security, lock, contract, review, CHANGELOG, and RCA paths after the PR had already been moved to Draft.
- Exact consequence: Security run [36837466501](https://github.com/ContextualWisdomLab/bandscope/actions/runs/36837466501) failed after urllib3 2.7.0 was restored and the 2.8.0 source/lock regression contract was removed.
- Integration decision: preserve `e616968854bdce234f275018bf62862943684f75` in ordinary history and restore every validated path from `8df35be2a03a8232ffaa36cc58f1d5659ecc5588`. The restoration commits begin at `118630eae9c4d59656dbd02b1ed6b483179942f1`; no force push, destructive rebase, Close, or valid-delta disposal is used.
- Status: restored and still Draft. Fresh exact-head Checks are required because all predecessor results are non-authoritative for the new head.

## 2026-10-01 — predecessor platform-build network RCA

- Evidence on predecessor head `8df35be2a03a8232ffaa36cc58f1d5659ecc5588`: build-baseline run [36836773312](https://github.com/ContextualWisdomLab/bandscope/actions/runs/36836773312), Windows amd64 job `110286308773` failed extracting the torch 2.12.1 wheel and macOS arm64 job `110286308666` failed extracting charset-normalizer 3.4.6.
- Root cause: both exact logs reported distribution download/extraction I/O failure caused by the same 30-second `UV_HTTP_TIMEOUT`, but at different packages and platforms. This is provider/network transience, not evidence of a lock or platform compatibility defect.
- Action: rerun only failed jobs without changing dependencies, samples, gates, or timeout policy. That rerun was later cancelled/superseded when the third writer advanced the PR head, so it is not GREEN evidence.
- Status: fresh exact-current-head platform builds remain required.

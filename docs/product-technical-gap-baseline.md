# BandScope Product-Technical Gap Baseline

Last updated: 2026-09-02
Evidence capture: fresh live GitHub state from the current delivery run
Protected product truth: `develop@749511c3ad4000090048718f685c6bee6b3d2c25`

## Purpose

This document is the canonical product/technical gap baseline for BandScope. It separates protected shipped truth from active pull-request work, research/acceptance work, superseded work, and external control-plane dependencies. A PR body, predecessor check, model review, screenshot, or remembered SHA is never shipped truth.

BandScope is a local-first rehearsal decision product. The commercial loop is complete only when a musician can admit a real local recording, obtain evidence-backed rehearsal guidance, rehearse a precise passage, save and recover the project, share a bounded handoff, diagnose failures without leaking private media, and install/update/roll back a verifiable signed build.

## 1. Live delivery authority

A fresh complete accessible-repository census in this run found **74 accessible ContextualWisdomLab repositories** and **2,722 organization-wide open pull requests** with GitHub search `incomplete_results=false`. At selection time `ContextualWisdomLab/bandscope` had **184 open pull requests**, the highest verified repository backlog and the buyer-visible local-first rehearsal workspace/analysis/export boundary. After the exact-head security-authority consolidation described below closed redundant PR #1119 without merge, a fresh BandScope search reported **183 open pull requests** while the organization-wide total remained **2,722** because a concurrent writer opened work elsewhere. These are capture-time operational data, not immutable totals.

Protected `develop` requires the following contexts before normal integration: `ci / build-and-test`, `dependency-review`, `security-audit`, `sbom`, `release-preflight`, `gate / build / windows`, `gate / build / macos`, `trivy-fs`, `coverage-evidence`, `opencode-review`, `strix`, `scan-pr-queue`, `osv-scan`, `scorecard`, `Analyze (javascript-typescript)`, and `Analyze (python)`.

Operational evidence rule: queued, pending, skipped-required, cancelled, neutral, failed, absent, stale, predecessor-head, protected-base, model-only, status-only, self/author, or administrative-bypass evidence is non-passing. A head change invalidates predecessor review/check receipts. Force-push, destructive rebase, self-approval, gate weakening, fabricated evidence, and unrelated rollback are prohibited.

Merge readiness is re-evaluated per unchanged exact PR head; an organization-wide approval search is not a substitute for that per-head proof.

## 2. Shipped protected truth

Only behavior reachable from protected `develop@749511c3ad4000090048718f685c6bee6b3d2c25` belongs in this section.

- BandScope is a React/Vite desktop workspace hosted by Tauri with local orchestration and a Python analysis service plus Rust/PyO3 numerical kernels.
- Typed Tauri IPC and bounded local process boundaries are the intended local execution model; ordinary rehearsal analysis does not require a public cloud service.
- Protected dependency-security repair #783 is already in `develop` ancestry. Open branches must not reframe its historical dependency findings as an unmerged product blocker or suppress them locally.
- The product already renders rehearsal-oriented section/role evidence, but protected truth does **not** yet satisfy the complete active-player, crash-recovery, real-audio acceptance, diagnostics, activation, accessibility-parity, or trusted-distribution contracts below.
- Latest published GitHub Release observed in this run is `v0.1.3` (2026-04-28). It is historical release evidence, not proof that the current protected head satisfies the commercial release gate.

## 3. Canonical active workstreams

Active work is not shipped truth until it is normally integrated into protected `develop` with current-head gates and qualifying independent review.

| Boundary | Canonical live owner / evidence | Current status |
|---|---|---|
| Merge-train control plane | Issue #966 with executable queue lane PR #968 | #968 is Draft and stacked on this baseline lane; exact current-head hosted checks are absent, therefore non-passing |
| Canonical baseline | PR #1116, this file | Open; this refresh creates a new exact head and invalidates predecessor evidence |
| Trusted distribution | Issue #960 | Windows signing, macOS signing/notarization, checksums, SBOM/provenance, signature-verified updater, staged rollout, rollback/repair, and version identity parity remain incomplete as one integrated protected-head receipt |
| Active rehearsal player | Issue #961; implementation lane #971 | Real authorized local audio playback/seek/stop/loop/rate/cue transport is active work; audible trusted-tempo count-in remains a separate unique behavior in #1070 until integrated into one transport state machine |
| Crash-safe project | Issue #962; implementation lane #970 | Atomic publication, versioned format, recovery, migration, autosave, rollback/export and persisted transport state remain active work, not protected truth |
| Real-audio science | Issue #770; Draft benchmark lane #828 | Rights-safe decoded-audio MIR acceptance, recognized metrics, uncertainty and reproducible evidence remain incomplete |
| Resource admission/decode | Issue #781; overlapping active lanes require semantic reconciliation | No synthetic/mock success may substitute for production-path resource/cancellation evidence |
| Diagnostics/supportability | Issue #963 | Typed redacted crash/hang evidence and user-previewable offline support bundle remain incomplete |
| Activation | Issue #964; licensed-demo work exists in active PRs | A measured production-path first rehearsal remains incomplete |
| Accessibility/design parity | Issue #965; design/Storybook work remains active | WCAG 2.2 AA, keyboard/screen-reader parity, EN/KO expansion, exact-value alternatives and current-head UI evidence remain incomplete |
| Quality floor | PR #1057 and successors | Repository-owned production statement/branch coverage and public API documentation target remain 100%; lower configured thresholds are a gap |

The product boundary, tests, contracts, and unique behavior decide succession—not PR number or title. In this run #1123 and #1074 were closed only after exact semantic comparison proved canonical Score accessibility lane #731 already preserved their production behavior and regressions. Their checks/reviews did not transfer.

## 4. Merge-train and succession contract

Backlog convergence is the primary engineering risk because micro-PR fan-out creates duplicate writers, stale evidence, dependency ambiguity, and review/check churn.

PR #968 owns the unique executable queue machinery needed by #966: bounded GitHub pagination, exact active-head capture, independent base-tip resolution, deterministic ordering, malformed/incomplete/duplicate rejection, reviewed dependency/succession metadata, network-independent validation, and symlink-safe atomic publication. It must not be discarded as stale documentation.

During this run #968 was non-destructively restacked on the current #1116 baseline branch with ordinary merge commit `2c44a37eea2b752dab55a01d7e9d11e1654f1810`. Immediately before this baseline refresh that exact queue head was 56 commits ahead and 0 behind the then-current #1116 head, and the semantic delta remained the 15 queue-contract files. Because this file is now being refreshed, #968 must be restacked again on the resulting new #1116 head before either lane can be considered current. No predecessor checks/reviews transfer across that restack.

PR #1007 is the canonical first-part-handoff lane after the unique scientific fallback prohibition from #1094 was transferred; #1094 is now closed. The #1007 branch moved normally during this run, so its PR-body SHA is stale and its independently resolved live head must be used before any action. Normal concurrent branch movement is not a race condition by itself.

PR #1119 is now closed unmerged after semantic consolidation. Its remaining local `pull_request` Trivy trigger duplicated the organization-required `Security Scan` control plane rather than owning a buyer/runtime capability. On #1119 exact head `58fa0a698f4a6238a14e38c0e4cf1f4d8944cc88`, required `Security Scan` run `33526173636` completed success and exact-head job `trivy-fs` (`99917475350`) completed success, including checkout identity verification, filesystem scan, SARIF requirement, finding gate, and upload. No #1119 checks, reviews, or model evidence transfer to another PR.

Duplicate closure requires a technical succession receipt naming the unique behavior/tests preserved in the successor. Draft status is used only for a real unverified/blocking boundary; it is never toggled solely to retrigger CI.

## 5. Domain model and ownership

BandScope keeps these bounded contexts distinct:

1. **Audio Ingestion** — user-selected source authority and intake intent.
2. **Resource Admission & Decode** — codec/MIME/path/resource/cancellation boundaries.
3. **Signal/MIR Analysis** — decoded-audio evidence and uncertainty.
4. **Rehearsal Insight** — section×role decisions, cues, confidence and correction provenance.
5. **Active Player** — one authoritative transport state machine for play/pause/seek/stop/loop/count-in/rate/cue navigation and source-backed stem controls.
6. **Project Persistence** — format version, atomic publication, autosave, migration, backup/recovery and portable export.
7. **Collaboration Handoff** — bounded share/export contracts, never a second project source of truth.
8. **Diagnostics/Support** — typed redacted evidence and support bundle lifecycle.
9. **Distribution/Update** — signed identity, SBOM/provenance, updater verification, rollout and rollback.
10. **UI/Interaction** — accessible, localized rendering of domain state; no duplicated transport/project stores.

Generic `utils`, `helpers`, `common`, `services`, `shared`, `core`, or `models` dumping that erases these responsibilities is a defect. Cross-context persistence and duplicated local transport stores are also defects.

Organization-owned identifiers must also preserve bounded-context meaning with at least two lexical words where a specific owner exists. Casing follows the implementation language: `section_id`, `sectionId`, and `SectionId` are all valid; meaningful multiword identifiers such as `firstGrooveChange` and `SectionRoadmap` are not renamed for casing alone. Bare owned names such as `id`, `name`, `status`, `data`, `value`, `type`, `key`, `result`, or `config` are repaired when they erase an otherwise-known semantic owner. Database-owned objects use the stricter two-or-more-word `snake_case` convention when the schema is under ContextualWisdomLab control. External protocol/vendor fields retain their mandated spelling at an anti-corruption boundary.

`context-graph-contracts` remains the contract-only shared kernel for canonical refs, authority/truth status, bitemporal/provenance Context Assertions, CloudEvents, schemas and conformance. `enterprise-architecture-core` remains the EA Decision Plane. While their dedicated writer is active they are read-only dependencies here; BandScope projects deployable/runtime/version/risk facts through released contracts and does not copy rehearsal audio/analysis/user truth into EA authoritative storage.

## 6. Real-audio scientific acceptance

Synthetic arrays, mocked UI journeys, direct feature matrices, source-text assertions, or generated audio may support unit tests but cannot prove product accuracy.

Commercial acceptance requires rights-safe real audio to pass the production intake → decode → analysis → UI path with fixture/annotation/license provenance. Metrics remain task-specific: chord/harmony evaluation uses a recognized chord metric such as benchmark-defined weighted chord recall; beat/timing uses recognized event metrics; separation uses SI-SDR plus task-appropriate robustness/perceptual evidence; range/pitch/transcription uses declared note/frame/event metrics; section/cue boundaries use tolerances derived from annotation uncertainty and rehearsal cost rather than an invented constant.

Acceptance criteria are preregistered before tuning and report uncertainty across tracks. Configured GPU lanes must actually execute and report parity/peak-resource evidence; unsupported hardware is not converted into a passing claim.

## 7. Rust compute ownership

Protected code is still mixed: selected numerical kernels are Rust/PyO3 while material analysis orchestration and some arithmetic remain Python/NumPy. The target architecture is Rust-first for repository-owned DSP, mathematical, vector, linear/matrix, data-science/ranking, and token-size core arithmetic.

Python is bounded orchestration/compatibility/fixture/reporting during migration. CPU reference behavior should be deterministic `f64` where scientifically appropriate, with bounded multithreading and unnecessary context switching removed. CUDA/OpenCL/MLX paths require real backend execution, parity and resource evidence where configured. A hidden Python numerical fallback is not the target architecture.

## 8. Security and privacy baseline

Local files, URLs, MIME/codec claims, decoder outputs, model artifacts, project files, updater manifests, subprocess output and support exports are untrusted.

Owning contexts must fail closed on path/symlink/reparse traversal, oversized/decompression/resource exhaustion, unsafe subprocess authority, credential/secret propagation and prompt-injection crossings. Valid source-backed GHAS/CodeQL/Semgrep/Strix/AppGuardrail findings are deduplicated by root cause and repaired in the canonical product lane. Scanner/control-plane defects remain with their owning repository; BandScope does not blanket-mask findings or weaken gates.

Ordinary logs/support bundles must not contain raw audio/project payloads, credentials or absolute local paths. Authorization is purpose-bound and least-privilege with field minimization, retention and access/export audit where relevant.

The current central security control-plane truth inspected in this run is `ContextualWisdomLab/.github@176ae54756657f4c18f43fd9ec4dae754f57fc48`. Its required `.github/workflows/security-scan.yml` explicitly owns pull-request security enforcement: it checks out the exact PR head, runs hard `trivy-fs`, `osv-scan`, and `dependency-review` gates, uploads SARIF, and fails independently of GitHub tool-specific code-scanning configuration bookkeeping. The workflow documentation intentionally keeps the code-scanning ruleset CodeQL-only because requiring multiple tool-specific configurations on incompatible PR refs is unsatisfiable; required workflow/job results are the protected enforcement boundary. This is why redundant local Trivy PR-trigger lane #1119 was consolidated closed rather than merged.

Central `.github` PR #1546 review-control repair is merged historical truth. A previously cited central coverage owner, `.github#1567`, is closed unmerged and must not be presented as a live dependency owner. Any fresh central regression is attributed only after current exact-head ownership is re-established.

## 9. UI/UX evidence gate

The live canonical design file referenced by protected BandScope docs in this run is Figma file `zthWmqfNKUgJBECvv002Qk`. A remembered design ID is not authority.

Storybook is the executable component/state inventory, Figma is the reviewed interaction/visual specification, and the shipped Tauri application is the final acceptance target. Material UI work must verify real pointer/touch/keyboard interaction, section/time-axis identity, playback cursor, persistence/reload, stale-response races, loading/partial/error/unsupported-codec/missing-stem states, responsive window sizes, visible focus, reduced motion, non-color-only status, screen-reader names/states, EN/KO expansion and exact-value/list/table alternatives for graph/timeline/waveform content.

A screenshot from a predecessor head, a Storybook-only state, or a Figma-only mock is not shipped UI evidence.

## 10. Release gate

A release may be created only from one exact integrated protected head where all applicable CI/security/SAST/dependency/coverage/documentation/real-audio/build/package gates, Windows signing, macOS signing/notarization, checksums, SBOM/provenance, reproducibility, independent review, project migration/recovery, accessibility/supportability, updater rollback and operability evidence are terminal-success on that same identity.

Unsigned validation artifacts are not releases. Queued evidence, stale Figma versions and mock-only audio journeys cannot establish release readiness.

## 11. Traceability

Primary normative/research anchors for this baseline include:

- World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*. https://www.w3.org/TR/WCAG22/
- National Institute of Standards and Technology. (2022). *Secure Software Development Framework (SSDF) Version 1.1 (NIST SP 800-218)*. https://csrc.nist.gov/pubs/sp/800/218/final
- Music Information Retrieval Evaluation eXchange. (n.d.). *MIREX*. https://www.music-ir.org/mirex/
- Raffel, C., McFee, B., Humphrey, E. J., Salamon, J., Nieto, O., Liang, D., Ellis, D. P. W., & Raffel, C. C. (2014). mir_eval: A transparent implementation of common MIR metrics. *Proceedings of the 15th International Society for Music Information Retrieval Conference*, 367–372.

Repository ADRs, PRD/TRD, architecture/context-map documents, security/threat-model material, test strategy, operability/recovery guidance, UI/Storybook inventory and doctoring traceability must remain code-current. Active PRs, planned work and research results are never promoted into the shipped section before protected integration.

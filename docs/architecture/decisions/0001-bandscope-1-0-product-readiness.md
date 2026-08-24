# ADR-0001: BandScope 1.0 Product-Readiness Program and Merge Trains

- **Status:** Proposed
- **Date:** 2026-08-20
- **Decision owners:** BandScope maintainers
- **Program issue:** [#958](https://github.com/ContextualWisdomLab/bandscope/issues/958)
- **Figma file ID:** `BP30foevuRtufwRpTknZUw`

## Context

BandScope has grown through many narrow, independently reviewable pull requests. The 2026-08-20 snapshot contains 83 open PRs above protected `develop@acdbea6344fe1231c39535b575f4de35e4c607c9`.

The repository already contains valuable local-first architecture, scientific-analysis, security, accessibility, and rehearsal-workspace work. The queue nevertheless lacks a single commercial completion sequence. Several boundaries have many small writers while other buyer-critical boundaries—trusted distribution, active playback, durable projects, support evidence, and licensed activation—have no complete protected vertical.

A large number of individually plausible PRs can make delivery less reliable when:

- several heads carry unrelated dependency/toolchain changes;
- adjacent UI slices create independent state or action stores;
- reviews and required checks are bound to predecessor heads;
- protected-base failures are copied into leaf PRs;
- a closed or squash-merged predecessor changes the successor's ancestry;
- design states are represented before runtime behavior exists;
- a validation package is described as a release without signing, notarization, updater, or rollback evidence.

The saved Figma file is useful but also demonstrates the need for source parity. Its cover describes a 28-page design-system plan while the current file exposes two top-level pages. Its footer and the reviewed repository/Tauri package metadata all cite version `0.1.3`; the remaining parity risk is planned or unimplemented design state rather than a current version-label mismatch.

## Decision

### 1. Preserve the product boundary

BandScope remains a **local-first rehearsal decision tool**.

It will:

- analyze user-authorized local audio;
- explain evidence, confidence, and limitations;
- turn analysis into concrete rehearsal actions;
- provide an active, accessible passage-rehearsal player;
- preserve durable local projects and bounded handoffs;
- distribute trusted desktop artifacts and support evidence.

It will not become a DAW, notation editor, plugin host, mandatory cloud account, or unbounded general-purpose media/file processor.

### 2. Use one completion program

Issue #958 is the parent product-completion program. The following child issues own independent buyer boundaries:

- #960 — trusted release, updater, and rollback;
- #961 — active rehearsal player;
- #962 — project format, autosave, migration, and recovery;
- #963 — diagnostics and offline support bundle;
- #964 — licensed demo and first-run activation;
- #965 — Figma, Storybook, shipped UI, and WCAG parity;
- #966 — dependency-aware PR convergence.

Existing canonical accuracy, resource, handoff, supply-chain, and platform issues remain authoritative where their responsibility already exists.

### 3. Process work as dependency-aware merge trains

Each reviewed open PR must belong to exactly one initial train:

- `T0` dependency, toolchain, workflow, and quality base;
- `T1` local input, filesystem authority, resource admission, and cancellation;
- `T2` scientific accuracy, MIR evaluation, and numerical parity;
- `T3` rehearsal actions and active-player vertical;
- `T4` project portability, handoff, and interoperability;
- `T5` activation, UI system, Storybook, and accessibility;
- `T6` diagnostics, redaction, security evidence, and supportability;
- `T7` signed commercial release and updater.

A live refresh may place newly discovered PRs in `T8`, a **triage-only temporary train** owned by issue #966. `T8` is inventory evidence, not an actionable merge train: every `T8` PR must be reviewed and reclassified to exactly one of `T0`–`T7` before any source/ref mutation, merge-readiness decision, auto-merge, or merge action is taken for that PR.

The initial routing is an investigation aid. Issue #966 must refresh the live exact head, checks, reviews, unresolved threads, dependencies, and succession before any action.

### 4. Enforce one canonical writer per boundary

A product/file boundary may have multiple active PRs only when their stack order is declared. Otherwise maintainers must select one canonical PR, transfer unique requirements/tests, and close duplicates or superseded heads with succession evidence.

No feature PR may carry an unrelated dependency, lockfile, workflow, or toolchain baseline. Those changes belong to `T0` and are inherited only after protected integration.

### 5. Treat exact-head evidence as non-transferable

A PR may merge only when its unchanged exact current head has:

- every required repository and central check in terminal success;
- qualifying independent non-author approval that covers the last push;
- zero unresolved actionable review threads;
- branch-protection acceptance without bypass;
- required repository-owned production statement and branch coverage;
- required public API documentation evidence.

Queued, skipped-required, failed inherited-base, predecessor-head, protected-base, model-only, self/author, or administrative-bypass evidence is not success.

### 6. Define design authority explicitly

- Runtime behavior, semantics, localization keys, and version identity originate in the repository.
- Design tokens are versioned in code and synchronized to Figma variables.
- Storybook is the executable component/state inventory.
- Figma file `BP30foevuRtufwRpTknZUw` is the reviewed visual/interaction specification.
- The shipped Tauri application is the final acceptance target.
- A Figma or Storybook state that is not implemented must be marked proposed rather than complete.

### 7. Release only after measurable product verticals

A release candidate is not created merely because packaging succeeds. The protected release commit must carry:

- real decoded-audio MIR acceptance and claim boundaries;
- bounded resource and cancellation evidence;
- active-player acceptance;
- project migration and recovery evidence;
- end-to-end accessibility evidence;
- support-bundle/privacy evidence;
- signed Windows artifacts;
- signed and notarized macOS artifacts;
- signature-verified updater and rollback evidence;
- checksums, SBOM, and build provenance.

## Consequences

### Positive

- Buyers can evaluate a coherent rehearsal workflow rather than isolated features.
- Maintainers can make explicit succession decisions and reduce review drift.
- Scientific, accessibility, security, release, and design evidence are bound to the same product version.
- Dependency and workflow changes stop contaminating unrelated feature heads.
- Waiting for one external review lane does not stop independent productive work.

### Costs

- Some existing PRs will be restacked, reconstructed, superseded, or closed.
- Exact-head verification must be repeated after ancestry changes.
- The initial queue manifest requires continuing maintenance.
- Design work may be revised when it does not match implemented contracts.
- A 1.0 release is later than an unsigned or evidence-light package, but materially more trustworthy.

## Rejected alternatives

### Merge every open PR in numerical order

Rejected because PR number is not dependency order, and merging all work can preserve duplicate stores, stale architecture, and conflicting dependency baselines.

### Close most PRs solely to reduce the count

Rejected because unique tests, security findings, and product requirements could be lost. Closure requires explicit succession evidence.

### Treat the Figma file as the product source of truth

Rejected because the current file contains planned or unimplemented pages. Behavior, semantics, and version identity must remain executable and testable in code.

### Release unsigned artifacts and add trust later

Rejected because signing, notarization, updater verification, project compatibility, and rollback are part of the commercial distribution contract.

### Expand into a DAW

Rejected because recording, plugin hosting, free-form mixing, and composition would dilute the buyer problem and multiply real-time/audio-platform risk.

## Review triggers

This ADR must be revisited when:

- the product boundary changes beyond rehearsal decision/support;
- BandScope adds a mandatory cloud account or remote project storage;
- the Figma source-of-truth model changes;
- the PR queue no longer needs train-based governance;
- the application adopts a different desktop/runtime distribution architecture;
- a project format or updater change makes rollback guarantees materially different.
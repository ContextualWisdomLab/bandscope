# Product and Technical Gap Baseline

## Scope and authority

This document records the current product/technical baseline for BandScope's buyer-facing desktop rehearsal flow. It is evidence and coordination material, not merge authority. Exact-head merge truth comes from the live pull request, branch protection, required workflows, current reviews, and the current Git object graph.

This baseline was created after inspecting `feat/licensed-demo-first-run` at parent head `1a89944186cdbe09c98f1b44c2fa5b3bf6aba292` against protected `develop@749511c3ad4000090048718f685c6bee6b3d2c25`. Any later commit invalidates predecessor check/review evidence for merge purposes.

## Buyer PRD baseline

BandScope must let a musician reach a trustworthy first rehearsal action without requiring prior project setup or a commercial recording. The current activation slice provides two explicit empty-workspace choices: use the bundled licensed demo or choose the musician's own local song. The demo is original CC0 audio and must enter the same downstream local-audio bootstrap and analysis contract after a stricter immutable-resource validator.

The slice is intentionally bounded. It does not claim first-run measurement complete, role/goal onboarding complete, MIR acceptance complete, hosted publication complete, or release readiness complete. No analysis starts automatically and browser-only execution must fail closed rather than fabricate production analysis.

## TRD baseline

The desktop boundary is Tauri orchestration plus TypeScript UI/shared contracts and Rust-owned local computation/validation. Source/project intake is serialized by the synchronous `workspaceIntakeInFlightRef` authority before asynchronous native work begins. Local audio, licensed demo, YouTube import, and Open Project operations must not race to replace active workspace identity, and Start analysis must not submit a stale prior bootstrap while intake is pending.

The bundled demo package is `apps/desktop/src-tauri/resources/demo/late-night-set.wav` plus `LICENSE`, `annotations.json`, and `provenance.json`. The WAV contract is 10 seconds, 22,050 Hz, mono PCM16, 441,044 bytes. Runtime validation fails closed on resource-path, symlink, post-read byte-count, RIFF/WAVE/chunk-layout, required-chunk multiplicity, PCM-field, and data-length drift. Provenance and supplemental inventory are traceability evidence, not filesystem authority.

Licensed-demo display identity is bounded. Current-renderer authority uses `currentLicensedDemoProjectId` and `currentLicensedDemoJobId`; session storage mirrors those identities only for ordinary renderer reload continuity. If session storage is unavailable, native analysis remains usable and the in-memory authority still preserves the canonical `Late Night Set` request/result title.

## DDD bounded contexts and context map

### Rehearsal Workspace

**Responsibility:** buyer-visible selection, project opening, analysis start, current rehearsal state, and next-action presentation.

**Aggregate:** Rehearsal Workspace.

**Entities/value objects:** selected project bootstrap, source selection kind, analysis job identity, rehearsal song, section identity, time range, confidence evidence.

**Domain services:** workspace intake serialization, analysis job orchestration, project open/save coordination.

**Invariants:** only one source/project intake owns workspace replacement at a time; failed replacement preserves a prior valid selection; analysis cannot start against stale selection authority; buyer-visible errors do not expose untrusted paths or dependency-controlled details.

### Local Audio Intake

**Responsibility:** convert an approved local/demo source into the shared local-audio bootstrap consumed by analysis.

**Domain services:** local source normalization and immutable licensed-demo validation.

**Invariant:** the licensed demo may use stricter validation, but after admission it enters the same `local_audio` bootstrap/analysis boundary as user audio.

### Analysis Job

**Responsibility:** validated request submission, job lifecycle, status polling/events, and result parsing.

**Aggregate:** Analysis Job.

**Entities/value objects:** analysis job request, analysis job status, job error, source label, project identifier, role focus.

**Invariant:** browser fallback does not synthesize successful analysis; status payloads are parsed at the adapter boundary; canonical demo naming survives start response, event updates, and later polling.

### Licensed Demo Package

**Responsibility:** immutable evaluation audio, licensing, annotations, provenance, runtime format contract, and supply-chain traceability.

**Entities/value objects:** demo song identity, demo asset metadata, annotation ranges, integrity digest, media type, license expression.

**Invariant:** package bytes, runtime size/PCM contract, provenance, supplemental inventory, and regression expectations move together; symlinks cannot satisfy the packaged-asset inventory.

### Context map

`Rehearsal Workspace -> Local Audio Intake -> Analysis Job` is the buyer execution path. `Licensed Demo Package -> Local Audio Intake` is a conformist input after its stricter immutable-resource gate. The external provenance JSON is translated through `parseDemoProvenanceManifest`; legacy generic wire keys remain compatibility input/output vocabulary while organization-owned runtime vocabulary is semantic and multiword.

## Ubiquitous language and naming contract

ContextualWisdomLab-owned semantic identifiers use at least two lexical words where the bounded context can provide the meaning. Idiomatic casing is preserved: examples in this slice include `workspaceIntakeInFlightRef`, `currentLicensedDemoProjectId`, `currentLicensedDemoJobId`, `demoSong`, `songId`, `songTitle`, `performerName`, `licenseExpression`, `demoAssets`, `assetPath`, `assetRole`, `assetSha256`, `assetByteCount`, and `assetMediaType`.

The provenance wire contract intentionally retains legacy external keys such as `id`, `title`, and `role`. Those names are not promoted into authoritative internal domain vocabulary; `parseDemoProvenanceManifest` is the anti-corruption boundary. Tiny-scope loop/test locals and language/framework-mandated identifiers are not renamed solely to satisfy a word-count rule.

No database tables, columns, indexes, constraints, sequences, views, materialized views, functions, ORM mappings, migrations, foreign keys, UPSERT paths, partitions, or read/write locking boundaries are changed by this activation slice. Database naming, 3NF, migration rollback, and hot-partition analysis are therefore not applicable to this change.

## Current product gaps and causal blockers

1. **Licensed-demo activation:** source/artifact defects identified in the current PR are repaired; fresh exact-head verification and qualifying independent approval remain governance gates rather than product-code gaps.
2. **MIR acceptance:** remains separately owned; this slice does not claim annotated verse/chorus evidence satisfies the full MIR acceptance boundary.
3. **First-run measurement and role/goal onboarding:** remain open product work outside this slice.
4. **Release evidence:** code-signing/notarization/updater/publication requirements are not proven by this slice.
5. **UI evidence:** the buyer copy and interaction regressions are source-backed. No new Figma artifact, Storybook capture, or screenshot accessibility evidence is claimed by this baseline; accessibility remains subject to the live UI review/test lanes.
6. **Shared security evidence:** PR-head Trivy configuration is owned by the canonical workflow repair in BandScope PR #1119 and must be validated on its own exact head before downstream evidence is treated as repaired.

## Verification and operability baseline

Required evidence is exact-head only. Predecessor, protected-base, model-only, skipped-required, neutral, queued, cancelled, stale, or synthesized status is not passing evidence. Current source regression coverage includes source/project race prevention, failed-replacement preservation, browser fail-closed behavior, bundled-resource integrity, WAV structure/PCM validation, provenance parsing, supplemental inventory integrity, UTF-8 manifest-size accounting, demo title continuity across renderer module reload, and demo naming when session storage is unavailable.

Merge requires the unchanged current head to satisfy live repository and organization required workflows, all valid review findings and threads, and qualifying independent non-author approval under branch protection. No force push, self-approval, administrative/ruleset bypass, gate weakening, finding suppression, or evidence transfer is permitted.

Operationally, local audio remains device-local. The licensed demo adds no telemetry or download authority. Native code reads the validated bundled resource; browser fallback does not claim successful production analysis. Rust remains the repository-owned boundary for core local audio validation/computation touched by this slice.

## Research and standards traceability

The security baseline follows the current final NIST SSDF publication, SP 800-218 version 1.1; NIST lists SP 800-218 Rev. 1 / SSDF 1.2 as a draft rather than a final replacement in its SSDF publications index. Accessibility review should target WCAG 2.2, recognized as ISO/IEC 40500:2025. The bundled demo's public-domain dedication follows CC0 1.0 Universal and keeps product description separate from license restrictions.

### References (APA 7)

Creative Commons. (n.d.). *CC0 1.0 Universal legal code*. https://creativecommons.org/publicdomain/zero/1.0/legalcode.en

National Institute of Standards and Technology. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). https://doi.org/10.6028/NIST.SP.800-218

National Institute of Standards and Technology. (2025). *Secure software development framework (SSDF) version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218 Rev. 1, Initial Public Draft). https://doi.org/10.6028/NIST.SP.800-218r1.ipd

World Wide Web Consortium. (2025, October 21). *Web Content Accessibility Guidelines (WCAG) 2.2 approved as ISO/IEC international standard*. https://www.w3.org/press-releases/2025/wcag22-iso-pas/

## Maintenance rule

Update this baseline when a public/domain/persistence contract, causal blocker, product-gap owner, or verification boundary changes. Record compatibility boundaries rather than renaming external/vendor protocol fields mechanically. Do not copy stale exact-head evidence forward after a push.
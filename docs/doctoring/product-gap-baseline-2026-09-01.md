# Product Gap Baseline Doctoring — 2026-09-01

## Purpose

This note records why `docs/product-technical-gap-baseline.md` is maintained on canonical PR #1116 instead of layering stale queue snapshots over product truth. It preserves exact-head corrections, causal repairs, naming-contract evidence, and research traceability without rewriting historical observations as current facts.

## Current live-state correction — 2026-09-02

Protected BandScope source remains `develop@749511c3ad4000090048718f685c6bee6b3d2c25` at this capture. A fresh complete accessible-repository sweep begun at **2026-09-02 15:31 KST** queried all **74** currently visible `ContextualWisdomLab` repositories individually and summed **2,889 open pull requests**. An organization-wide aggregate captured immediately after the sweep also returned **2,889 open pull requests** with `incomplete_results=false`. Equality between the sequential sum and later aggregate is capture-time evidence only; concurrent PR creation/closure can still occur during a non-atomic census.

`ContextualWisdomLab/bandscope` was the highest observed backlog at **196 open pull requests**. Fresh high-backlog peers were `ContextualWisdomLab/naruon` 145, `ContextualWisdomLab/OriginWeave` 141, `ContextualWisdomLab/newsdom-api` 137, `ContextualWisdomLab/pg-erd-cloud` 135, `ContextualWisdomLab/TEPP` 128, `ContextualWisdomLab/html4tree` 127, `ContextualWisdomLab/Orgmetra` 117, and `ContextualWisdomLab/.github` 117. BandScope remains selected by both backlog and product responsibility: it owns the buyer-facing local-first rehearsal/audio path plus high-leverage release, security, persistence, workflow, and shared-contract boundaries.

The accessible repository set for this capture was: `ContextualWisdomLab/kaefa`, `ContextualWisdomLab/naruon`, `ContextualWisdomLab/EgressWeave`, `ContextualWisdomLab/pg-erd-cloud`, `ContextualWisdomLab/nonnest2`, `ContextualWisdomLab/argos`, `ContextualWisdomLab/g7`, `ContextualWisdomLab/learning-record-store`, `ContextualWisdomLab/learning-management-platform`, `ContextualWisdomLab/ConceptWeave`, `ContextualWisdomLab/clearfolio`, `ContextualWisdomLab/CalendarWeave`, `ContextualWisdomLab/newsdom-api`, `ContextualWisdomLab/Orgmetra`, `ContextualWisdomLab/OmniRoute`, `ContextualWisdomLab/RankWeave`, `ContextualWisdomLab/ThreadWeave`, `ContextualWisdomLab/learning-interoperability-contracts`, `ContextualWisdomLab/psychometrics-commons`, `ContextualWisdomLab/PolicyWeave`, `ContextualWisdomLab/scopeweave`, `ContextualWisdomLab/enterprise-architecture-core`, `ContextualWisdomLab/inkspan`, `ContextualWisdomLab/wardnet`, `ContextualWisdomLab/four-pillars`, `ContextualWisdomLab/ELUNVERA`, `ContextualWisdomLab/accounting-information-platform`, `ContextualWisdomLab/disksage`, `ContextualWisdomLab/OriginWeave`, `ContextualWisdomLab/quarantine-sandbox-runtime`, `ContextualWisdomLab/linux-cluster-ops`, `ContextualWisdomLab/html4tree`, `ContextualWisdomLab/ContextualWisdomLab.github.io`, `ContextualWisdomLab/noema`, `ContextualWisdomLab/litellm-patched-proxy`, `ContextualWisdomLab/gyeot`, `ContextualWisdomLab/9drive`, `ContextualWisdomLab/IRT-bibliography-set`, `ContextualWisdomLab/metering-billing-platform`, `ContextualWisdomLab/mightyETL`, `ContextualWisdomLab/learning-content-studio`, `ContextualWisdomLab/aFIPC`, `ContextualWisdomLab/contextual-orchestrator`, `ContextualWisdomLab/fast-mlsirm`, `ContextualWisdomLab/mhtml-etl-gateway`, `ContextualWisdomLab/semantic-data-portal`, `ContextualWisdomLab/EmbedRelay`, `ContextualWisdomLab/xtrmLLMBatchPython`, `ContextualWisdomLab/trivy-sarif-repro`, `ContextualWisdomLab/pg-llm-batch`, `ContextualWisdomLab/codec-carver`, `ContextualWisdomLab/LineageWeave`, `ContextualWisdomLab/macos_utility_packs`, `ContextualWisdomLab/free-router`, `ContextualWisdomLab/TEPP`, `ContextualWisdomLab/keyverse`, `ContextualWisdomLab/.github`, `ContextualWisdomLab/hyosung-itx-slogan-brief`, `ContextualWisdomLab/vooster`, `ContextualWisdomLab/supply-chain-control-plane`, `ContextualWisdomLab/ccube-jco-potential-customer`, `ContextualWisdomLab/j-planner`, `ContextualWisdomLab/pingora-gateway`, `ContextualWisdomLab/governance-risk-compliance`, `ContextualWisdomLab/seedream_evasepic`, `ContextualWisdomLab/appguardrail`, `ContextualWisdomLab/context-graph-contracts`, `ContextualWisdomLab/bandscope`, `ContextualWisdomLab/life-os`, `ContextualWisdomLab/graphify`, `ContextualWisdomLab/xtrm-lead-pi-outbound`, `ContextualWisdomLab/feelanet-adfs`, `ContextualWisdomLab/saju-caldav`, and `ContextualWisdomLab/DiagramWeave`.

Volatile queue counts are dated evidence, not product truth. Every branch advance invalidates predecessor checks and approvals, and every later census must preserve non-simultaneous movement rather than manufacture a false simultaneous total.

## Canonical baseline recovery

A source-integrity defect was verified on predecessor #1116 head `f6207ef2cadadb5d3852e0595ab2f0b62e20a06b`. That census-only commit unintentionally removed 83 lines from `docs/product-technical-gap-baseline.md` and left the canonical product/technical contract ending immediately after §7.4. The deleted material included the identifier-policy migration boundary, Rust compute ownership, real-audio scientific acceptance, security/privacy, UI/UX evidence, quality/operability, release-gate, and traceability sections.

The parent `adbd9df394957ee1a2c68893b8a6025cdcf058c9` was inspected as recovery evidence before editing. The canonical branch then advanced through ordinary non-force history to `ec67371791c653eed21705600775c06ecd531cc7`, restoring the lost contract. At the start of this capture #1116 was independently re-fetched at `docs/gap-baseline-2026-08-31@39232f8bfecc2e0ea950cca597fd89354cee710a`, base `develop@749511c3ad4000090048718f685c6bee6b3d2c25`; the canonical baseline blob at that audited pre-write head was `cd4729d5580286783c9604e8e36bbd91bab610f2`. A document cannot truthfully self-embed the SHA of the commit that contains that self-reference, so successor head identity is always fetched from GitHub immediately after each write rather than inferred from prose.

The restored baseline carries the buyer PRD, end-to-end stories, DDD bounded contexts/context map/ubiquitous language/domain events, TRD topology and transport diagrams, persistence/versioning rules, organization naming and database migration rules, Rust-first compute ownership, persistence ERD discipline, rights-safe real-audio scientific acceptance, security/privacy, Storybook/Figma/shipped accessibility evidence, the 100% quality floor, release acceptance, and APA traceability.

## Organization naming-contract evidence

The organization-owned naming rule is semantic, not casing-based. Multiword names such as `section_id`, `sectionId`, `SectionId`, `firstGrooveChange`, and `SectionRoadmap` are valid. Generic single-word organization-owned names are repaired where bounded-context meaning is available. Persisted, released, IPC, vendor, or protocol spellings do not change in place merely to satisfy style; they cross explicit migration/version/anti-corruption boundaries.

### Workspace role vocabulary — #1130

`ContextualWisdomLab/bandscope#1130` owns the **active-PR** workspace role projection; it is not protected shipped truth until normally integrated. On that owner branch the semantic vocabulary is `RehearsalRoleOption.roleId`, `roleName`, and primary `roleOptions`, while the previous component projection `{ id, name }[]` is retained only as an explicitly deprecated `LegacyRehearsalRoleOption` adapter input translated by `normalizeLegacyRoleOptions`. Protected `develop` must not be described as already containing that projection until #1130 or its semantic successor lands. No persisted project, IPC, database, vendor, or shared-types wire contract is intended to change in that slice.

### Score attachment compatibility boundary — #1092

`ContextualWisdomLab/bandscope#1092` exposed another material naming defect in a buyer-visible workspace path. The persisted project format already uses `scoreAttachments` entries with compatibility keys `id` and `fileName`; changing those keys in place would silently break stored projects. The safe repair therefore keeps the wire shape and moves semantic naming immediately behind an anti-corruption boundary.

The focused RED commit `35dc521f03711d749771751ecf39b904f193057d` changed the regression to require `{ scoreId, scoreFileName }` while production still returned `{ id, fileName }`. The GREEN production commit `8cd6756ef242d99fc323181b21b58f96fe24c731` introduced `TrustedScoreAttachment`, validates only the compatibility wire keys at `trustedScoreAttachment`, returns semantic `scoreId`/`scoreFileName`, and renamed touched workspace-owned locals to bounded score/range vocabulary. No database table, column, index, constraint, sequence, migration, foreign key, ORM/query mapping, UPSERT path, lock topology, or persisted project wire key changed.

A current CodeRabbit review also identified a truthful-documentation defect: `ARCHITECTURE.md`, `AGENTS.md`, `CHANGELOG.md`, and `CLAUDE.md` could be read as promising that any persisted score attachment is openable. Production actually requires both validated attachment metadata and a live Score workspace; reopened metadata-only projects or untrusted metadata fall back to adding a score or checking the range by ear. The same canonical branch was directly repaired in commits `5af64f5c3ddc85b237a4426678de0233ee4f5fdf`, `5a2abb1aa404eb0df133cbaeade44439621e56d6`, `893b87a53faaa08f3f972a4dc264c47ff9c83511`, and `8099e3b2525723474aca09db4d669167035263b3` so product guidance and production now express one invariant.

At the latest #1092 capture, exact head `8099e3b2525723474aca09db4d669167035263b3` had **27** fresh check runs. Required/security lanes including `dependency-review`, `scorecard`, and `trivy-fs` were still queued, while a skipped manual-evidence helper was not treated as passing required evidence. No predecessor success was promoted.

### Release identity — #1126

`ContextualWisdomLab/bandscope#1126` remains a separate release-identity naming lane. Its repository-owned helper/test vocabulary uses names such as `repository_root`, `release_version`, `workflow_text`, `job_marker`, `workflow_lines`, `job_start_index`, `job_end_index`, `release_guard`, `expected_version`, `package_document`, and `publication_job`. External Pytest fixture names and package/Tauri JSON keys remain unchanged where their contracts own those spellings. This is an internal naming boundary and does not itself require a persistence migration.

## Database discipline

BandScope's current project authority is file/project-format based rather than an organization-owned relational production schema, so the #1092 repair required no DDL. The canonical baseline nevertheless records the database rule for future owned schemas: use semantic multiword snake_case for tables, columns, indexes, constraints, sequences, views, materialized views, functions, and related objects; normalize to 3NF where relevant; and verify migration ordering, foreign keys, indexes, constraints, ORM/query mappings, UPSERT semantics, hot-partition risk, locking/read-write separation, compatibility, rollback, and recovery before integration.

The protected `.bscope` documentation currently describes structural schema validation but only proposes introducing a format-version field if future structural changes require one. Therefore `project_format_version` is a **target migration contract**, not current protected persisted behavior. Any future rename of a persisted generic field must first introduce a compatible versioned reader/migration/writer path with previous-version fixtures, deterministic repeated migration, rollback/recovery, and no dual writable truth.

## Queue and causal-owner evidence

Issue #966 remains the dependency-aware merge-train control plane, while PR #968 retains unique executable queue machinery: bounded pagination, exact active-head capture, independently resolved target tips, deterministic ordering, malformed/incomplete/duplicate rejection, network-independent validation, and symlink-safe atomic publication. Fresh metadata now shows #968 as `docs/bandscope-product-readiness-baseline@ab89d16a9fbd6f47ca4747147f60d130a1ed8588` with base branch `docs/gap-baseline-2026-08-31` and base SHA `39232f8bfecc2e0ea950cca597fd89354cee710a`. Its PR-body prose still contains older stack SHAs and is navigation-only until corrected; checks/reviews from those predecessor identities do not transfer.

The baseline owner #1116 and temporal-analysis PR #1117 are separate evidence lanes. The audited pre-write #1116 source identity was `docs/gap-baseline-2026-08-31@39232f8bfecc2e0ea950cca597fd89354cee710a`, base `develop@749511c3ad4000090048718f685c6bee6b3d2c25`, document blob `cd4729d5580286783c9604e8e36bbd91bab610f2`. PR #1117 is `refactor/temporal-features-api@b98f266d2356d56be624fb617580b5252e85baaa`, also based on `develop@749511c3ad4000090048718f685c6bee6b3d2c25`; its visible review threads are independently resolved and do not constitute #1116 review evidence.

The latest protected central control-plane evidence recorded by the baseline is `ContextualWisdomLab/.github@669505bdf267d92989298857c740a59807bbd735`. Issue `.github#712` remains the organization-wide runner-admission/queue-health owner. Earlier protected `.github#1658`, `.github#1656`, `.github#1665`, and `.github#1645` reduce avoidable queue/review pressure and review-routing ambiguity but do not turn a queued exact-head job into terminal success. Repository-local Trivy PR-head configuration remains owned by open BandScope #1119 until normally integrated or superseded.

The connected repository write surface permits ordinary source/workflow/PR changes but does not expose organization runner-pool, Actions quota/billing, or equivalent admission-setting mutation. A fresh attempt to read the protected `develop` branch-protection endpoint in this run returned GitHub **403 `Resource not accessible by integration`**; therefore the previously recorded 16-context inventory is not promoted as newly revalidated branch-protection truth in this capture. Unchanged-head reruns and runner-label churn are not substitutes for causal evidence.

Canonical product ownership remains explicit: #961 owns active rehearsal player/transport, #962 owns crash-safe project persistence, **#963 owns diagnostics/support bundles**, and #960 owns trusted release/distribution. These scopes are distinct even when one leaf PR exercises more than one acceptance gate.

## Security Notes

This documentation change introduces no new runtime authority. The durable security contract remains: untrusted file/project/codec/model/update/subprocess inputs cross typed validation boundaries; ordinary local analysis uses allowlisted Tauri IPC, bounded stdin/stdout, or loopback strictly limited to `127.0.0.1` where a loopback adapter is explicitly required, and does not depend on public HTTP or another network path. Structured inputs are schema-validated before domain use. Subprocess execution uses argument arrays and `shell=False`-equivalent non-shell authority. Logs and support bundles redact credentials, raw audio/project payloads, and absolute local paths. Release artifacts require signature/checksum/SBOM/provenance verification at the owning distribution boundary. Queued, pending, neutral, skipped-required, stale, or predecessor evidence is non-passing.

## Historical observations and RCA

Historical queue observations remain useful only as dated evidence. On 2026-09-01 10:31 KST BandScope had 190 open pull requests. At 2026-09-01 13:29 KST, 72 repositories were visible and an organization recount reported 2,697 open pull requests, with BandScope at 188. Later 2026-09-02 sweeps observed 2,827/2,834 and 185 BandScope, 2,856/2,855 and 194 BandScope, then 2,865/2,866 and 196 BandScope before the current 2,889/2,889 and 196 BandScope capture. None may be reused as an undated permanent count.

Review findings previously validated on #1116 included stale PR evidence, a false repository-wide Mermaid-absence claim, stale product-owner issue numbers, and prose-inherited live Noema/PR claims. The replacement baseline separates protected-source facts from timestamped GitHub observations and uses exact current-head examples instead of assigning one cause to the whole queue.

A historical review-gate example remains instructive. PR #956 once had a predecessor exact-head Strix failure unrelated to its articulation privacy code. The central workflow exhausted the NVIDIA primary, encountered an EOL NVIDIA fallback, then used GPT-5.4 through `/v1/chat/completions` with function tools plus non-none reasoning effort; the provider rejected that contract. `ContextualWisdomLab/.github#1350` repaired the GPT-5.4 tool/reasoning contract in commit `f655a901f7ccdfef0d62694c818ad2896a2f5da1`. At that historical capture, `.github/main@1186a9f4e5eda7683b23ae63d2c806831743432a` contained that fix. PR #956 was then advanced through ordinary history to `e46a7aa3121c902ebcf9ea9d256a199659a482df` using the identical tree so fresh workflows could be created. This evidence remains historical and must be re-fetched before any current action.

PR #1117 similarly demonstrated that the queue cannot be truthfully summarized as “all code checks fail”: at its historical capture, exact head `b98f266d2356d56be624fb617580b5252e85baaa` had successful repository CI/release/security/SBOM workflows while `opencode-review` remained in progress. Pending was still non-passing, but it had a different cause from older blanket claims.

## Research / standards review

The baseline uses current authoritative standards/research as acceptance anchors rather than decorative citations:

- ISO/IEC 25010:2023 defines the current SQuaRE product-quality model and supports requirements, design objectives, testing objectives, acceptance criteria, and product-quality evaluation.
- NIST SP 800-218 SSDF v1.1 emphasizes tracked security requirements/design decisions, provenance, and root-cause-oriented secure development.
- WCAG 2.2 is a W3C Recommendation covering focus visibility, dragging alternatives, target size, consistent help, redundant entry, accessible authentication, and the broader accessibility baseline required by the product.
- MIREX real-recording evaluation practice supports rights-safe production-path MIR evidence rather than synthetic-only accuracy claims.

### APA 7th references

International Organization for Standardization, & International Electrotechnical Commission. (2023). *ISO/IEC 25010:2023 Systems and software engineering—Systems and software Quality Requirements and Evaluation (SQuaRE)—Product quality model* (2nd ed.). ISO.

Music Information Retrieval Evaluation eXchange. (2025). *Audio beat tracking*. MIREX Wiki. https://music-ir.org/mirex/wiki/2025:Audio_Beat_Tracking

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) Version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218

World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*. https://www.w3.org/TR/WCAG22/

## Decision

PR #1116 remains the canonical baseline owner. Its source contains the complete recovered PRD/TRD/DDD/naming/Rust/science/security/UI/quality/release/traceability contract plus current delivery evidence. PR #1025 is an older competing owner of the same path; it may only be closed as superseded when every unique semantic requirement remains executable or represented in the canonical source and its discussion history is preserved.

Future loops should refresh live counts and exact-head evidence when they materially change prioritization or causal ownership. They must not rewrite stable product/architecture sections merely to chase a volatile PR number, and they must never repeat the predecessor truncation failure by replacing a complete canonical document with a partial census fragment.
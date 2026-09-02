# Product Gap Baseline Doctoring — 2026-09-01

## Purpose

This note records why `docs/product-technical-gap-baseline.md` is maintained on canonical PR #1116 instead of layering stale queue snapshots over product truth. It preserves exact-head corrections, causal repairs, naming-contract evidence, and research traceability without rewriting historical observations as current facts.

## Current live-state correction — 2026-09-02

Protected BandScope source remains `develop@749511c3ad4000090048718f685c6bee6b3d2c25` at this capture. A fresh complete accessible-repository sweep queried all **74** currently visible `ContextualWisdomLab` repositories individually and summed **2,865 open pull requests**. An organization-wide aggregate captured immediately after the sweep returned **2,866 open pull requests** with `incomplete_results=false`. The one-request difference is retained as non-simultaneous live queue movement rather than normalized away or treated as evidence of an omitted repository.

`ContextualWisdomLab/bandscope` was the highest observed backlog at **196 open pull requests**. Fresh high-backlog peers were `ContextualWisdomLab/naruon` 143, `ContextualWisdomLab/OriginWeave` 141, `ContextualWisdomLab/newsdom-api` 137, `ContextualWisdomLab/pg-erd-cloud` 135, `ContextualWisdomLab/html4tree` 127, and `ContextualWisdomLab/TEPP` 127. BandScope remains selected by both backlog and product responsibility: it owns the buyer-facing local-first rehearsal/audio path plus high-leverage release, security, persistence, workflow, and shared-contract boundaries.

Volatile queue counts are dated evidence, not product truth. Every branch advance invalidates predecessor checks and approvals, and every later census must preserve non-simultaneous movement rather than manufacture a false simultaneous total.

## Canonical baseline recovery

A source-integrity defect was verified on predecessor #1116 head `f6207ef2cadadb5d3852e0595ab2f0b62e20a06b`. That census-only commit unintentionally removed 83 lines from `docs/product-technical-gap-baseline.md` and left the canonical product/technical contract ending immediately after §7.4. The deleted material included the identifier-policy migration boundary, Rust compute ownership, real-audio scientific acceptance, security/privacy, UI/UX evidence, quality/operability, release-gate, and traceability sections.

The parent `adbd9df394957ee1a2c68893b8a6025cdcf058c9` was inspected as recovery evidence before editing. The current canonical branch then advanced through ordinary non-force history to `ec67371791c653eed21705600775c06ecd531cc7`, restoring the lost contract while incorporating the fresh 74-repository census and current naming evidence. This was a direct source repair, not an issue/comment/delegation-only response.

The restored baseline now again carries the buyer PRD, end-to-end stories, DDD bounded contexts/context map/ubiquitous language/domain events, TRD topology and transport diagrams, persistence/versioning rules, organization naming and database migration rules, Rust-first compute ownership, persistence ERD discipline, rights-safe real-audio scientific acceptance, security/privacy, Storybook/Figma/shipped accessibility evidence, the 100% quality floor, release acceptance, and APA traceability.

## Organization naming-contract evidence

The organization-owned naming rule is semantic, not casing-based. Multiword names such as `section_id`, `sectionId`, `SectionId`, `firstGrooveChange`, and `SectionRoadmap` are valid. Generic single-word organization-owned names are repaired where bounded-context meaning is available. Persisted, released, IPC, vendor, or protocol spellings do not change in place merely to satisfy style; they cross explicit migration/version/anti-corruption boundaries.

### Workspace role vocabulary — #1130

`ContextualWisdomLab/bandscope#1130` owns the exported workspace role projection. Its semantic vocabulary is `RehearsalRoleOption.roleId`, `roleName`, and primary `roleOptions`. The previous component projection `{ id, name }[]` remains only inside the explicitly deprecated `LegacyRehearsalRoleOption` adapter input and is translated immediately by `normalizeLegacyRoleOptions`. No persisted project, IPC, database, vendor, or shared-types wire contract changed in that slice. The latest exact head recorded for that workstream is `724dd0445039b6e99863b46535a8497c784699ab`; predecessor verification never transfers after a later push.

### Score attachment compatibility boundary — #1092

`ContextualWisdomLab/bandscope#1092` exposed another material naming defect in a buyer-visible workspace path. The persisted project format already uses `scoreAttachments` entries with compatibility keys `id` and `fileName`; changing those keys in place would silently break stored projects. The safe repair therefore keeps the wire shape and moves semantic naming immediately behind an anti-corruption boundary.

The focused RED commit `35dc521f03711d749771751ecf39b904f193057d` changed the regression to require `{ scoreId, scoreFileName }` while production still returned `{ id, fileName }`. The GREEN production commit `8cd6756ef242d99fc323181b21b58f96fe24c731` introduced `TrustedScoreAttachment`, validates only the compatibility wire keys at `trustedScoreAttachment`, returns semantic `scoreId`/`scoreFileName`, and renamed touched workspace-owned locals to bounded score/range vocabulary. No database table, column, index, constraint, sequence, migration, foreign key, ORM/query mapping, UPSERT path, lock topology, or persisted project wire key changed.

A current CodeRabbit review also identified a truthful-documentation defect: `ARCHITECTURE.md`, `AGENTS.md`, `CHANGELOG.md`, and `CLAUDE.md` could be read as promising that any persisted score attachment is openable. Production actually requires both validated attachment metadata and a live Score workspace; reopened metadata-only projects or untrusted metadata fall back to adding a score or checking the range by ear. The same canonical branch was directly repaired in commits `5af64f5c3ddc85b237a4426678de0233ee4f5fdf`, `5a2abb1aa404eb0df133cbaeade44439621e56d6`, `893b87a53faaa08f3f972a4dc264c47ff9c83511`, and `8099e3b2525723474aca09db4d669167035263b3` so product guidance and production now express one invariant.

At the latest #1092 capture, exact head `8099e3b2525723474aca09db4d669167035263b3` had **27** fresh check runs. Required/security lanes including `dependency-review`, `scorecard`, and `trivy-fs` were still queued, while a skipped manual-evidence helper was not treated as passing required evidence. No predecessor success was promoted. The connected GraphQL review-thread endpoint also hit a GitHub rate limit during this run; that transient platform read/mutation limitation does not convert an unresolved thread into resolved evidence and does not justify merge.

### Release identity — #1126

`ContextualWisdomLab/bandscope#1126` remains a separate release-identity naming lane. Its repository-owned helper/test vocabulary uses names such as `repository_root`, `release_version`, `workflow_text`, `job_marker`, `workflow_lines`, `job_start_index`, `job_end_index`, `release_guard`, `expected_version`, `package_document`, and `publication_job`. External Pytest fixture names and package/Tauri JSON keys remain unchanged where their contracts own those spellings. This is an internal naming boundary and does not itself require a persistence migration.

## Database discipline

BandScope's current project authority is file/project-format based rather than an organization-owned relational production schema, so the #1092 repair required no DDL. The canonical baseline nevertheless records the database rule for future owned schemas: use semantic multiword snake_case for tables, columns, indexes, constraints, sequences, views, materialized views, functions, and related objects; normalize to 3NF where relevant; and verify migration ordering, foreign keys, indexes, constraints, ORM/query mappings, UPSERT semantics, hot-partition risk, locking/read-write separation, compatibility, rollback, and recovery before integration.

## Queue and causal-owner evidence

Issue #966 remains the dependency-aware merge-train control plane, while PR #968 retains unique executable queue machinery: bounded pagination, exact active-head capture, independently resolved target tips, deterministic ordering, malformed/incomplete/duplicate rejection, network-independent validation, and symlink-safe atomic publication. Because #1116 advanced again during this repair, every predecessor #968 target/check/review receipt is stale until #968 is normally re-resolved/restacked against the new canonical baseline head.

The latest protected central control-plane evidence recorded by the baseline is `ContextualWisdomLab/.github@669505bdf267d92989298857c740a59807bbd735`. Issue `.github#712` remains the organization-wide runner-admission/queue-health owner. Earlier protected `.github#1658`, `.github#1656`, `.github#1665`, and `.github#1645` reduce avoidable queue/review pressure and review-routing ambiguity but do not turn a queued exact-head job into terminal success. Repository-local Trivy PR-head configuration remains owned by open BandScope #1119 until normally integrated or superseded.

The connected repository write surface permits ordinary source/workflow/PR changes but does not expose organization runner-pool, Actions quota/billing, or equivalent admission-setting mutation. Unchanged-head reruns and runner-label churn are therefore not substitutes for causal evidence. Queued jobs remain non-passing while independent source work proceeds.

## Historical observations and RCA

Historical queue observations remain useful only as dated evidence. On 2026-09-01 10:31 KST BandScope had 190 open pull requests. At 2026-09-01 13:29 KST, 72 repositories were visible and an organization recount reported 2,697 open pull requests, with BandScope at 188. Later 2026-09-02 sweeps observed 2,827/2,834 and 185 BandScope, then 2,856/2,855 and 194 BandScope, before the current 2,865/2,866 and 196 BandScope capture. None may be reused as an undated permanent count.

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

PR #1116 remains the canonical baseline owner. Its source now contains the complete recovered PRD/TRD/DDD/naming/Rust/science/security/UI/quality/release/traceability contract plus current delivery evidence. PR #1025 is an older competing owner of the same path; it may only be closed as superseded when every unique semantic requirement remains executable or represented in the canonical source and its discussion history is preserved.

Future loops should refresh live counts and exact-head evidence when they materially change prioritization or causal ownership. They must not rewrite stable product/architecture sections merely to chase a volatile PR number, and they must never repeat the predecessor truncation failure by replacing a complete canonical document with a partial census fragment.
# Product Gap Baseline Doctoring — 2026-09-01

## Purpose

This note records why `docs/product-technical-gap-baseline.md` was replaced on PR #1116 instead of layering another stale queue snapshot over it, and preserves later live-state corrections without rewriting historical observations as if they were current.

## Current live-state correction — 2026-09-02

Protected source remains `develop@749511c3ad4000090048718f685c6bee6b3d2c25` at this capture. A fresh complete accessible-repository sweep queried all **74** currently visible `ContextualWisdomLab` repositories individually and summed **2,784 open pull requests**. The organization-wide aggregate immediately after that sequential sweep also returned **2,784 open pull requests** (`incomplete_results=false`), so the final census and aggregate agreed at this capture. `ContextualWisdomLab/bandscope` remained the highest-backlog repository at **185 open pull requests** and **19 open issues**. Freshly counted peers were `ContextualWisdomLab/OriginWeave` 141, `ContextualWisdomLab/newsdom-api` 138, `ContextualWisdomLab/naruon` 135, `ContextualWisdomLab/pg-erd-cloud` 131, and `ContextualWisdomLab/TEPP` 131. BandScope remains selected by both backlog and product responsibility: it owns the buyer-facing local-first rehearsal/audio path and several high-leverage release/security/workflow boundaries.

The previously recorded statement that PR #1119 was closed is stale. `ContextualWisdomLab/bandscope#1119` is open on canonical branch `fix/trivy-pr-code-scanning`, owning the repository-local Trivy pull-request-head configuration contract until normal protected integration or a freshly verified successor supersedes it.

The central Actions causal boundary has advanced beyond the earlier `.github#1645` queue-coalescing repair. Protected central truth at this capture is `ContextualWisdomLab/.github@2792b964b321d096ed292979e175510cf94aa03c`, and issue `.github#712` remains the organization-wide runner-admission/queue-health owner. The exact current `ContextualWisdomLab/bandscope#1130@724dd0445039b6e99863b46535a8497c784699ab` CI admission job `100084171595` remains queued before execution (`steps=null` in the Actions jobs API), while the same head's Windows/macOS build matrix has already acquired hosted runners and completed multiple jobs successfully. That split is important: the current blocker is not a BandScope source failure and no longer supports the broader claim that every hosted runner is unavailable. It remains a current-head Actions admission/control-plane problem for specific required lanes, which #712 must classify by the first causal boundary rather than by a misleading run-level status.

Two central source repairs previously described as active are now protected history. `.github#1658` merged the one-line Strix `LLM_TIMEOUT=300` → `0` contract repair as commit `69e80bdf37bfbae813851c1b0e6b8a0cfb4a704c`. `.github#1656` then merged the removal of redundant runner-backed `closed`-event no-op jobs as commit `6a25bc11d58a2e36da9ccea390ade6ccee57ec4d`, preserving real Noema/Strix cancellation behavior and permanent queue-contract regressions. Current central `main` has advanced beyond both repairs. They reduce avoidable queue pressure but do not by themselves close #712 while exact current required jobs can still remain unassigned before execution.

The connected repository write surface permits ordinary source/workflow/PR changes but does not expose organization runner-pool, Actions quota/billing, or equivalent settings mutation. Until the remaining admission condition changes or #712 produces another source-owned causal repair, repeated unchanged-head reruns or label churn would generate noise rather than evidence. Queued jobs remain non-passing; fresh exact-head workflows should be allowed to remain queued while independent source work proceeds.

The canonical baseline source remains the durable PRD/TRD/DDD contract; volatile queue numbers are evidence, not product truth. Every branch advance invalidates predecessor checks and approvals.

## Repository evidence

Protected source at capture: `develop@749511c3ad4000090048718f685c6bee6b3d2c25`.

Current direct naming repair evidence: `ContextualWisdomLab/bandscope#1130` was created from that exact protected head after the repository-wide naming sweep found the exported workspace-owned `RehearsalRoleOption` projection using bare `id` and `name`, with public component prop `roles`. The branch first advanced focused tests to `roleId`, `roleName`, and `roleOptions`, then changed the authoritative switcher-owned vocabulary to those semantic names. The previous `{ id, name }[]` component shape is retained only inside the explicitly deprecated `LegacyRehearsalRoleOption` compatibility input and is immediately translated by `normalizeLegacyRoleOptions`; switcher-owned logic uses the semantic projection thereafter. Current exact head is `724dd0445039b6e99863b46535a8497c784699ab`; it also addresses the current-head CodeRabbit public-API documentation finding by documenting `RehearsalRoleOption` and both semantic fields. No persisted project, IPC, database, vendor, or shared-types wire contract changed in this slice.

Fresh workflows created for `#1130@724dd0445039b6e99863b46535a8497c784699ab` are mixed current-head evidence rather than a blanket failure: Windows/macOS build jobs have acquired runners and several completed successfully, while exact-head CI job `100084171595` (`gate / ci / npm-lock-validation`) is still queued with no steps. The PR therefore remains non-merge-ready until every live required check is terminal-success and qualifying independent review evidence applies to the unchanged head.

`ContextualWisdomLab/bandscope#1126` remains a separate release-identity naming repair lane. Its release-identity production helper/test surface uses bounded-context names such as `repository_root`, `release_version`, `workflow_text`, `job_marker`, `workflow_lines`, `job_start_index`, `job_end_index`, `release_guard`, `expected_version`, `package_document`, and `publication_job`; Pytest's external `tmp_path` fixture and externally mandated package/Tauri JSON keys remain unchanged. The change is internal naming only and needs no persistence/API migration.

Historical queue observations remain useful only as dated RCA. On 2026-09-01 10:31 KST BandScope had 190 open pull requests. At 2026-09-01 13:29 KST, 72 repositories were visible and an organization recount reported 2,697 open pull requests, with BandScope at 188. Those captures must not be reused as current queue authority.

Review findings on PR #1116 previously validated as real:

1. the open-PR evidence was stale;
2. the repository-wide Mermaid absence claim was false because protected `develop` already contains Mermaid in `docs/doctoring/high-security-pdf-http-baseline.md` and `docs/doctoring/npm-lockfile-generator-provenance.md`;
3. playback and crash-safe project work were mapped to stale issue numbers — canonical owners are #961 and #962 respectively, while #960 owns signed/notarized release/update/rollback;
4. live Noema/PR claims needed independent GitHub verification rather than prose inheritance.

The replacement baseline therefore separates protected-source facts from timestamped GitHub observations and uses exact current-head examples instead of asserting one blocker for the entire queue.

## Historical review-gate RCA example

PR #956 had a predecessor exact-head Strix failure unrelated to its articulation privacy code. The failing central workflow exhausted the NVIDIA primary, encountered an EOL NVIDIA fallback, then used GPT-5.4 through `/v1/chat/completions` with function tools plus non-none reasoning effort; that combination was rejected by the provider contract. `ContextualWisdomLab/.github#1350` fixed the GPT-5.4 tool/reasoning contract in commit `f655a901f7ccdfef0d62694c818ad2896a2f5da1`.

At the historical RCA capture, `.github/main@1186a9f4e5eda7683b23ae63d2c806831743432a` was 245 commits ahead of that fix and had it as the merge base. To obtain fresh evidence without altering production content, PR #956 was advanced by a normal non-force commit to `e46a7aa3121c902ebcf9ea9d256a199659a482df` using the identical tree `6d777d7fec8b35de23f8d77f1b22e158828f0288`; repository workflows then re-queued. No stale check was promoted to current evidence. These identities are historical RCA evidence, not current merge authority.

PR #1117 independently demonstrated at its capture that the queue was not accurately described by “all code checks fail”: exact head `b98f266d2356d56be624fb617580b5252e85baaa` had successful repository CI/release/security/SBOM workflows while `opencode-review` remained in progress. Pending is still non-passing, but its cause and state differ from the older blanket claim. This is historical example evidence and must be re-fetched before any action on #1117.

## Research / standards review

The baseline was checked against current authoritative sources on 2026-09-01:

- ISO/IEC 25010:2023 defines the current SQuaRE product-quality model and explicitly supports requirements, design objectives, testing objectives, acceptance criteria, and product-quality evaluation.
- NIST SP 800-218 SSDF v1.1 remains the current NIST SSDF baseline and emphasizes tracked security requirements/design decisions, provenance, and root-cause-oriented secure development.
- WCAG 2.2 remains a W3C Recommendation and adds criteria including focus visibility, dragging alternatives, target size, consistent help, redundant entry, and accessible authentication.
- MIREX 2025 Audio Beat Tracking evaluates predicted beat locations against listener-annotated real recordings, supporting the decision to require real-audio timing evidence rather than synthetic-only unit fixtures.

### APA 7th references

International Organization for Standardization, & International Electrotechnical Commission. (2023). *ISO/IEC 25010:2023 Systems and software engineering—Systems and software Quality Requirements and Evaluation (SQuaRE)—Product quality model* (2nd ed.). ISO.

Music Information Retrieval Evaluation eXchange. (2025). *Audio beat tracking*. MIREX Wiki. https://music-ir.org/mirex/wiki/2025:Audio_Beat_Tracking

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) Version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218

World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*. https://www.w3.org/TR/WCAG22/

## Decision

PR #1116 is the canonical current baseline owner. PR #1025 is an older competing owner of the same path; its unique requirements (PRD/TRD/UML, Rust migration, real-audio accuracy, security, accessibility, release evidence, and reproducible verification) were deliberately carried into the #1116 replacement. Once this current head is present, #1025 can be closed as superseded without deleting its discussion history.

Future loops should refresh live counts/evidence only when they materially change prioritization or causal ownership. They must not rewrite immutable product and architecture sections merely to chase a volatile PR number.

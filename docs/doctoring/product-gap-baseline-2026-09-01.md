# Product Gap Baseline Doctoring — 2026-09-01

## Purpose

This note records why `docs/product-technical-gap-baseline.md` was replaced on PR #1116 instead of layering another stale queue snapshot over it, and preserves later live-state corrections without rewriting historical observations as if they were current.

## Current live-state correction — 2026-09-02

Protected source remains `develop@749511c3ad4000090048718f685c6bee6b3d2c25` at this capture. A fresh complete accessible-repository sweep queried all **74** currently visible `ContextualWisdomLab` repositories individually and summed **2,789 open pull requests**. A later organization-wide search returned **2,790**, a net +1 across non-simultaneous measurements. The delta is queue churn evidence, not proof of one specific creation and not evidence of a missing repository. `ContextualWisdomLab/bandscope` remains the highest-backlog repository at **187 open pull requests** and **19 open issues**, both complete (`incomplete_results=false`), ahead of `ContextualWisdomLab/OriginWeave` 141, `ContextualWisdomLab/newsdom-api` 138, `ContextualWisdomLab/naruon` 134, `ContextualWisdomLab/pg-erd-cloud` 132, and `ContextualWisdomLab/TEPP` 131.

The previously recorded statement that PR #1119 was closed is stale. `ContextualWisdomLab/bandscope#1119` is open on canonical branch `fix/trivy-pr-code-scanning`, owning the repository-local Trivy pull-request-head configuration contract until normal protected integration or a freshly verified successor supersedes it.

The central Actions causal boundary has advanced beyond the earlier `.github#1645` queue-coalescing repair. Protected central truth at this capture is `ContextualWisdomLab/.github@cfcde258dc2836838d00982ed812dd3b9d6072ca`, and issue `.github#712` is the current organization-wide runner-starvation owner. Diagnostic `.github#1652` used a deliberately minimal one-step `ubuntu-latest` job with no checkout, third-party action, matrix, `needs`, environment, credentials, repository code, or job environment. Its exact job remained queued with zero executed steps and `runner_id=0`; the draft diagnostic PR was then closed unmerged so the canary would not become permanent no-op load. Independent exact-head jobs using explicit `ubuntu-24.04` exhibit the same no-runner/no-step state. This falsifies a BandScope source checkout or runner-label-only fix as the current first boundary and places the incident at hosted-runner admission under repository/organization Actions capacity, scheduler, quota, billing, or policy/control-plane state.

The connected repository write surface permits ordinary source/workflow/PR changes but does not expose organization runner-pool, Actions quota/billing, or equivalent settings mutation. Until that external condition changes, repeated unchanged-head reruns or label churn would generate noise rather than evidence. Queued jobs remain non-passing; fresh exact-head workflows should be allowed to remain queued while independent source work proceeds.

The canonical baseline source remains the durable PRD/TRD/DDD contract; volatile queue numbers are evidence, not product truth. Every branch advance invalidates predecessor checks and approvals.

## Repository evidence

Protected source at capture: `develop@749511c3ad4000090048718f685c6bee6b3d2c25`.

Current direct naming repair evidence: `ContextualWisdomLab/bandscope#1126` was re-fetched before modification and advanced by ordinary history to exact head `b0d5ecbf18f20842b88879c74fdadd7208476ad7`. Its new release-identity production helper already used bounded-context names; the owning test surface still had generic repository-owned locals/parameters (`spec`, `module`, `root`, `version`, `workflow`, `marker`, `lines`, `start`, `end`, `guard`, `expected`, `package`, `publisher`). Those are now `guard_module_spec`, `guard_module`, `repository_root`, `release_version`, `workflow_text`, `job_marker`, `workflow_lines`, `job_start_index`, `job_end_index`, `release_guard`, `expected_version`, `package_document`, and `publication_job`. Pytest's external `tmp_path` fixture and externally mandated package/Tauri JSON keys remain unchanged. The change is internal naming only and needs no persistence/API migration.

Fresh workflows created for `#1126@b0d5ecbf18f20842b88879c74fdadd7208476ad7` are queued. Its `ci` job `100068301102` requests `ubuntu-latest`, has `steps=[]`, `runner_id=0`, and no runner/group identity, reproducing the central #712 admission boundary on the new exact head rather than a predecessor. Both existing substantive #1126 review threads are source-resolved; there is still no qualifying independent approval on the last push, so the PR is not mergeable by policy even aside from the queued required evidence.

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

# Product Gap Baseline Doctoring — 2026-09-01

## Purpose

This note records why `docs/product-technical-gap-baseline.md` was replaced on PR #1116 instead of layering another stale queue snapshot over it, and preserves later live-state corrections without rewriting historical observations as if they were current.

## Current live-state correction — 2026-09-02

Protected source remains `develop@749511c3ad4000090048718f685c6bee6b3d2c25` at this capture. A prior complete accessible-repository sweep queried all **74** repositories then visible under `ContextualWisdomLab` individually. That sequential sweep summed to **2,786 open pull requests**; a fresh organization-wide search immediately afterward reported **2,787**, a net +1 difference across two non-simultaneous measurements. The delta demonstrates queue churn during the census but does not prove that exactly one PR was created: concurrent creations and closures can produce the same net result. It therefore is not evidence of a missing repository either. A fresh repository search in this delivery run reports **187 open pull requests** and **19 open issues** in `ContextualWisdomLab/bandscope`, both with `incomplete_results=false`. Previously captured peer counts are retained only as historical observations and are not reused as current merge authority.

The previously recorded statement that PR #1119 was closed is also stale. `ContextualWisdomLab/bandscope#1119` is open on canonical branch `fix/trivy-pr-code-scanning`, currently owning the repository-local Trivy pull-request-head configuration contract. Its independently revalidated exact head at this correction remains `8f9c0762c8d336c08028298c276fe0fad745090f`. Downstream PRs with neutral/missing Trivy configuration evidence must therefore continue to treat #1119 as a live causal-owner lane until normal protected integration or a newer verified owner supersedes it.

The central Actions queue-saturation cause has also moved: `ContextualWisdomLab/.github#1645` was previously verified as merged into protected central truth. That control-plane repair coalesces redundant queued current-head workflow runs while preserving exact PR/head/base/workflow identity checks. BandScope heads pushed after that integration should receive fresh evidence normally; unchanged queued heads must not be spam-rerun merely because they are waiting.

The canonical baseline source remains the durable PRD/TRD/DDD contract; volatile queue numbers are evidence, not product truth. When this branch advances, predecessor checks and approvals are invalidated and must be regenerated on the new exact head.

## Repository evidence

Protected source at capture: `develop@749511c3ad4000090048718f685c6bee6b3d2c25`.

Observed live queue at 2026-09-01 10:31 KST: 190 open pull requests in `ContextualWisdomLab/bandscope`. The older branch text said 185, and its verification block still printed 130; that evidence could not reproduce the document claim.

A fresh organization-wide recount at 2026-09-01 13:29 KST enumerated 72 repositories accessible through the connected `ContextualWisdomLab` account and 2,697 open pull requests across the organization. The prior 71-repository/2,686-PR snapshot became stale because `ContextualWisdomLab/litellm-patched-proxy` and `ContextualWisdomLab/pingora-gateway` were then newly visible in the accessible repository set. Individual count checks at that timestamp put `ContextualWisdomLab/bandscope` first at 188 open PRs, ahead of `ContextualWisdomLab/newsdom-api` 144, `ContextualWisdomLab/TEPP` 141, `ContextualWisdomLab/OriginWeave` 140, and `ContextualWisdomLab/naruon` 128. These numbers are historical evidence only and must not be reused as current queue authority.

Review findings on PR #1116 were validated as real:

1. the open-PR evidence was stale;
2. the repository-wide Mermaid absence claim was false because protected `develop` already contains Mermaid in `docs/doctoring/high-security-pdf-http-baseline.md` and `docs/doctoring/npm-lockfile-generator-provenance.md`;
3. playback and crash-safe project work were mapped to stale issue numbers — canonical owners are #961 and #962 respectively, while #960 owns signed/notarized release/update/rollback;
4. live Noema/PR claims needed independent GitHub verification rather than prose inheritance.

The replacement baseline therefore separates protected-source facts from timestamped GitHub observations and uses exact current-head examples instead of asserting one blocker for the entire queue.

## Current review-gate RCA example

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

Future loops should refresh live counts/evidence only when they materially change prioritization. They must not rewrite immutable product and architecture sections merely to chase a volatile PR number.

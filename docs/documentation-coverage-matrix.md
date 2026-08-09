# Documentation Coverage and Traceability Matrix

Last evaluated: 2026-08-10
Evaluation scope: real known-stem YouTube source-separation validation and the affected BandScope
runtime/release boundaries.

## Sufficiency verdict

The pre-change repository had a strong benchmark operator note but was insufficient: it lacked a
canonical PRD, TRD, ADRs, UML, logical data model, traceability, model inventory consistency, and
release/operations criteria. This branch adds those authorities and mechanical presence checks.

The documentation graph is now structurally sufficient and explicitly code-current for this bounded
slice: every declared PRD/TRD requirement is mapped to a decision, implementation, test/evidence,
and release control, and that ID coverage is machine-checked. The product is not yet release-ready
for source separation. A passing live run on every advertised platform, model-rights/legal delivery
decision, exact-checkpoint approved-pickle risk acceptance (or non-pickle replacement), threshold
calibration, accepted evidence-retention controls, and a valid schema-v1 artifact remain open.
Full-hash pre-load verification is now implemented and regression-tested.
The same-byte loader now uses `weights_only=True`, one exact reviewed global allowlist, strict Demucs
construction, and a serialized one-time read/load cache. Repository mutation tests reject an
unrestricted fallback, an allowlist expansion or second allowlist API, moved/broad scanner
suppression, and any second `torch.load` site.

Issue #770 remains open. This branch must not be described as completing the full real-audio MIR
acceptance layer.

## Artifact coverage

| Family | Canonical authority | Assessment | Remaining gap |
|---|---|---|---|
| PRD | `docs/PRD.md` | Adequate for product outcome, scope, users, platform-scoped acceptance, legal boundary, rollout, and non-goals. | Broader multi-fixture/four-stem requirements and PRD-KS-011 failure UX remain planned. |
| TRD | `docs/TRD.md` | Adequate for interfaces, metrics, versioned stage-aware evidence schema, platform matrix, stable failure taxonomy, model delivery, and traceability. | Performance budget, calibrated thresholds, evidence emitter/store, and TRD-KS-013 remain planned. |
| Architecture | `ARCHITECTURE.md`, `docs/architecture/overview.md` | Updated for fail-closed htdemucs provisioning, platform-scoped claims, evidence aggregate, and known-stem boundaries. | Rights, approved-pickle, retention, and platform evidence gates remain open. |
| ADR | `docs/adr/README.md`, ADR-0001..0003 | Captures model, live quality gate, and persistence/ERD decisions with alternatives and supersession. | ADR-0001..0003 remain Proposed until branch merge. |
| UML | `docs/architecture/diagrams.md` | Component, sequence, state, implementation-class, evidence-aggregate, and deployment views included. | No additional UML is needed for the bounded slice. |
| ERD/data | `docs/architecture/diagrams.md`, ADR-0003 | Logical run/evidence provenance and optional measured blocks are explicit, including early failure records. | A physical database ERD is intentionally not applicable unless relational persistence is introduced. |
| Security/privacy | `docs/engineering/youtube-known-stem-validation.md`, `docs/security/app-security.md`, ADRs | Threats, trust boundaries, non-collection, sanitized command/tool identity, integrity, cleanup, and legal limits covered; exact model bytes use the reviewed restricted loader and serialized one-time cache. | Exact-checkpoint approved-pickle risk acceptance plus rights/platform authorization remain open. |
| Test strategy | `docs/TRD.md`, operator guide, acceptance criteria | Offline/live split and metric/failure contracts covered. | No successful live score has been recorded. |
| MIR doctoring | `docs/doctoring/real-audio-accuracy-acceptance.md` | Issue #770 metrics, claim boundaries, tiers, and roadmap are separated from the bounded vocal slice. | Accuracy manifest, reports, other MIR families, and corpus tiers remain open. |
| Operations/release | runbook and release policy | Prospective preflight, schema-v1 evidence, platform scope, triage, rollback, and blocking conditions covered. | Retention stays disabled; platform matrix and live passes are incomplete. |
| Supply chain | supplemental inventory, ADR-0001, and dependency policy | Retired model removed; code/inventory artifact parity, fail-closed same-byte restricted loading, exact allowlist mutation guards, uv.lock-bound yt-dlp, sanitized ffmpeg/ffprobe identity, and explicit pickle-risk closure criteria recorded. | Model rights/delivery and the exact-checkpoint pickle-risk decision remain unresolved. |
| Automation | active CWL autonomous loop and `docs/workflow/pr-review-merge-scheduler.md` | BandScope continuity and no-status-only termination are covered without creating a competing writer. | Dedicated BandScope loop remains paused due writer topology/active-task capacity. |
| Review governance | `docs/security/github-required-checks.md`, governance, gitflow, contributing, bootstrap policy | Stable checks and review are cumulative; qualifying evidence is an exact-head completed CodeRabbit artifact or exact-head independent non-author `APPROVED` review. Status-only, rate-limited, author, or predecessor evidence is excluded. | A provider rate limit can still defer review, blocking only merge. |

## Requirement-to-evidence traceability

| Product requirement(s) | Technical requirement(s) | Decision/research | Module or artifact | Test/evidence | Release control |
|---|---|---|---|---|---|
| PRD-KS-001, PRD-KS-007, PRD-KS-010 | TRD-KS-001 | ADR-0002; YouTube Terms | `bandscope_analysis.youtube` | production downloader policy tests and opted-in live case | Authorization, duration/size bounds, and four-part media-runtime preflight |
| PRD-KS-005, PRD-KS-007, PRD-KS-010 | TRD-KS-002 | ADR-0002 | `KnownStemFixture` and verified reference/master loaders | exact host, redirect, byte-size, and full-hash tests | Fixture change requires rights, provenance, and integrity review |
| PRD-KS-007, PRD-KS-008, PRD-KS-010 | TRD-KS-003 | ADR-0002/0003 | bounded streaming and one-member archive reader | hostile redirect/archive/member/size tests | No `extractall()`; ephemeral storage only |
| PRD-KS-003, PRD-KS-005 | TRD-KS-004 | ADR-0002 | `align_active_reference_window`, `align_known_stem_through_master` | delayed-window, polarity, composed-lag, and no-prediction-realignment tests | Authorized candidate identity and calibration required |
| PRD-KS-002, PRD-KS-004 | TRD-KS-005 | ADR-0001/0002; Rouard et al. (2023) | `AudioStemSeparator` and canonical separation result | finite/equal-shape/canonical-stem tests and live production-boundary assertion | Exact model identity and a pass for every advertised OS/architecture |
| PRD-KS-003 | TRD-KS-006 | Le Roux et al. (2019) | `zero_mean_si_sdr` | hand-defined metric, silence, shape, finite, and offset-invariance tests | Threshold calibration before blocking promotion |
| PRD-KS-003, PRD-KS-004 | TRD-KS-007 | ADR-0002 | SI-SDR improvement and named-stem assignment assertions | offline score/margin tests and creator-master calibration | Authorized exact-candidate passing scores required |
| PRD-KS-005, PRD-KS-010 | TRD-KS-008 | ADR-0002 | duration and identity-drift gates | duration/correlation negative cases before separator invocation | Drift/flake owner and triage record |
| PRD-KS-006, PRD-KS-007, PRD-KS-010 | TRD-KS-009 | ADR-0002 | pytest live marker, environment guard, and preflight | required-suite marker exclusion and explicit failure cases | Advisory until a superseding promotion ADR |
| PRD-KS-008, PRD-KS-010 | TRD-KS-010 | ADR-0003 | nested temporary roots and cleanup postcondition | success/failure cleanup and path-redaction tests | No raw media/stem retention |
| PRD-KS-002, PRD-KS-010 | TRD-KS-011 | ADR-0001 | separator manifest, restricted-loader allowlist, serialized load lock, and supplemental inventory | filename/hash/size parity; same-byte `weights_only=True`; strict construction; concurrency/read-once and mutation tests; real-artifact load smoke | Security-owner exact-hash/dependency-lock pickle-risk record plus separate rights/legal decision; hash/allowlist/dependency changes trigger re-review |
| PRD-KS-008, PRD-KS-009 | TRD-KS-012 | ADR-0003; NIST AI RMF TEVV | schema-v1 `BenchmarkRun`/`BenchmarkEvidence` aggregate and sanitized operator template | schema/invariant design and historical failure classification exist; emitter/store and retained pass do not | Store/access/TTL/deletion controls and exact-candidate per-platform artifacts required before blocking promotion |
| PRD-KS-011 | TRD-KS-013 | Product failure-experience contract; app-security safe-error rules | planned typed engine/desktop import, model, decode, separation, and recovery states | current downloader/model fallbacks are partial; distinct end-to-end copy/state tests remain planned | Capability cannot claim complete recoverable failure UX until every state and fallback is accepted |

## Live evidence snapshot

| Date | Commit under test | Offline contract | Live result | Classification |
|---|---|---|---|---|
| 2026-08-09 | `5a3648a11d9097b8da48bb4a3ccbd97986aec25b` | 13 passed | Reference archive verified; YouTube download failed with HTTP 502 before separation; no score | Exact failure evidence, not a pass |
| 2026-08-09 | `6e937a34f9036d92e909db3ce8848a5c39dc8e3b` (historical exact commit) | Full quickcheck: 680 Python passed, 24 skipped, live marker deselected; 100% source coverage | Archive, extracted vocal, creator master, and pre-provisioned model hash verified; production YouTube download failed with HTTP 502 after 65.49 s; no score | Historical exact-commit failure evidence; neither a pass nor current-head evidence |

The 13-test row is a pre-correction partial suite, not a competing total. It did not contain
`test_download_verified_creator_master_authenticates_exact_file`,
`test_align_known_stem_through_master_composes_two_global_offsets`, or
`test_required_root_suite_explicitly_excludes_live_youtube_marker`; adding those three produced the
later 16-test revision. Current regression additions intentionally make a fixed count non-normative.

Separate creator-master calibration on that environment measured `shifts=0` vocal SI-SDR
improvement +1.752 dB and assignment margin +7.631 dB. Dry-vocal/mix correlation was 0.016856, so
the branch now uses a separately pinned finished master for identity. This probe did not download
YouTube and is not a live pass.

## Machine-checkable contract

`scripts/checks/verify_docs.py` requires the canonical index, PRD, TRD, ADR index and records,
diagram authority, and this matrix; checks cross-links from architecture and the index; requires
every PRD/TRD ID declared in its visible requirements-table row to appear in a visible traceability
table row; rejects undeclared trace IDs; and requires contributing, governance, gitflow, bootstrap,
and GitHub bootstrap policy to link the canonical required-check authority so review policy cannot
silently fork. Both documentation checks share `scripts/checks/markdown_sections.py`, which uses
the directly pinned `markdown-it-py 4.0.0` CommonMark parser with its table rule enabled. Only
rendered top-level headings and rendered canonical outer-pipe tables count: fenced, commented, raw
HTML, or list-nested lookalikes do not. The checker requires exactly one canonical requirements
section/table per PRD and TRD, unique source IDs in the correct family, exactly one six-column
traceability section/table, plain PRD/TRD IDs in their respective columns, and nonempty
decision/module/evidence/release-control cells.
`scripts/checks/verify_supply_chain.py` derives the configured separator model and exact code-owned
filename/hash/size manifest, then rejects inventory drift. It also binds the yt-dlp record to
`uv.lock`, requires both ffmpeg and ffprobe operator records, rejects the retired bandsplit profile,
and validates every model artifact's schema, types, full SHA-256, positive non-boolean size, and
HTTPS source. `scripts/checks/verify_security_notes.py` recursively requires the exact visible
canonical `## Security Notes` section and all six visible H3 subsection headings in every plan.
`scripts/checks/security_gates.py` permits only the one
exact full-hash same-byte `torch.load` call, requires its rule-specific Semgrep and Bandit
suppressions in place, and binds it to `weights_only=True`, the exact global allowlist, and no other
allowlist mutation API.

## Re-evaluation triggers

Re-run this matrix whenever the model/signature, fixture, threshold, downloader, separator output
contract, failure UX, supported platform, evidence schema, persistence policy, evidence retention,
workflow scheduling, or release-blocking status changes.

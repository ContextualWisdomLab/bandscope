# Documentation Coverage and Traceability Matrix

Last evaluated: 2026-08-09
Evaluation scope: real known-stem YouTube source-separation validation and the affected BandScope
runtime/release boundaries.

## Sufficiency verdict

The pre-change repository had a strong benchmark operator note but was insufficient: it lacked a
canonical PRD, TRD, ADRs, UML, logical data model, traceability, model inventory consistency, and
release/operations criteria. This branch adds those authorities and mechanical presence checks.

The documentation graph is now structurally sufficient and explicitly code-current, but the product
is not yet release-ready for source separation. A passing live run, full-hash pre-load model
verification, model-rights decision, threshold calibration, supported-platform evidence, and
bounded evidence artifact remain open.

Issue #770 remains open. This branch must not be described as completing the full real-audio MIR
acceptance layer.

## Artifact coverage

| Family | Canonical authority | Assessment | Remaining gap |
|---|---|---|---|
| PRD | `docs/PRD.md` | Adequate for product outcome, scope, users, acceptance, legal boundary, rollout, and non-goals. | Broader multi-fixture/four-stem requirements await evidence. |
| TRD | `docs/TRD.md` | Adequate for interfaces, metrics, schema, platform matrix, failure taxonomy, model delivery, evidence, and traceability. | Performance budget and calibrated thresholds are not yet accepted. |
| Architecture | `ARCHITECTURE.md`, `docs/architecture/overview.md` | Updated for htdemucs and known-stem boundaries. | Full-hash model resolver remains implementation work. |
| ADR | `docs/adr/README.md`, ADR-0001..0003 | Captures model, live quality gate, and persistence/ERD decisions with alternatives and supersession. | ADR-0002/0003 remain Proposed until branch merge. |
| UML | `docs/architecture/diagrams.md` | Component, sequence, state, class, and deployment views included. | No additional UML is needed for the bounded slice. |
| ERD/data | `docs/architecture/diagrams.md`, ADR-0003 | Logical artifact relationships and persistence status are explicit. | Physical ERD is intentionally not applicable until persistence exists. |
| Security/privacy | `docs/engineering/youtube-known-stem-validation.md`, `docs/security/app-security.md`, ADRs | Threats, trust boundaries, non-collection, integrity, cleanup, and legal limits covered. | Full model hash must be enforced before load. |
| Test strategy | `docs/TRD.md`, operator guide, acceptance criteria | Offline/live split and metric/failure contracts covered. | No successful live score has been recorded. |
| MIR doctoring | `docs/doctoring/real-audio-accuracy-acceptance.md` | Issue #770 metrics, claim boundaries, tiers, and roadmap are separated from the bounded vocal slice. | Accuracy manifest, reports, other MIR families, and corpus tiers remain open. |
| Operations/release | runbook and release policy | Preflight, evidence, triage, rollback, and blocking conditions covered. | Platform matrix and live pass are incomplete. |
| Supply chain | supplemental inventory and dependency policy | Retired model removed; exact runtime artifact, ffmpeg status, and hash recorded. | Weight redistribution rights and pre-load enforcement unresolved. |
| Automation | active CWL autonomous loop and `docs/workflow/pr-review-merge-scheduler.md` | BandScope continuity and no-status-only termination are covered without creating a competing writer. | Dedicated BandScope loop remains paused due writer topology/active-task capacity. |

## Requirement-to-evidence traceability

| Requirement | Decision/research | Module or artifact | Test/evidence | Release control |
|---|---|---|---|---|
| PRD-KS-001, KS-007 | ADR-0002; YouTube Terms | `bandscope_analysis.youtube` | `test_youtube.py`; opted-in live test | Authorization preflight |
| PRD-KS-002, KS-004 | ADR-0001/0002; Rouard et al. (2023) | `separation/audio_separator.py` | `test_youtube_stem_e2e.py` live case | Exact model identity and supported platform |
| PRD-KS-003 | Le Roux et al. (2019) | `tests/known_stem_benchmark.py` | SI-SDR unit tests and live threshold | Calibration plus exact-candidate score |
| PRD-KS-005 | ADR-0002 | master identity plus composed global alignment helpers | delayed/composed-window tests; live duration/correlation | Authorized YouTube calibration and drift triage |
| PRD-KS-006, KS-010 | ADR-0002 | pytest marker and failure taxonomy | 16 default offline tests; explicit live failure | Advisory until promotion ADR |
| PRD-KS-008 | ADR-0003 | temporary directory and sanitized errors | cleanup postcondition and archive failure tests | Evidence excludes raw media/paths |
| PRD-KS-009 | ADR-0003; NIST AI RMF TEVV | planned bounded evidence schema | No retained score yet | Required before blocking release gate |
| TRD-KS-011 | ADR-0001 | supplemental inventory | inventory consistency tests | Full-hash pre-load blocker |

## Live evidence snapshot

| Date | Commit under test | Offline contract | Live result | Classification |
|---|---|---|---|---|
| 2026-08-09 | `5a3648a11d9097b8da48bb4a3ccbd97986aec25b` | 13 passed | Reference archive verified; YouTube download failed with HTTP 502 before separation; no score | Exact failure evidence, not a pass |
| 2026-08-09 | `6e937a34f9036d92e909db3ce8848a5c39dc8e3b` (published byte-identical implementation tree) | Full quickcheck: 680 Python passed, 24 skipped, live marker deselected; 100% source coverage | Archive, extracted vocal, creator master, and pre-provisioned model hash verified; production YouTube download failed with HTTP 502 after 65.49 s; no score | Exact implementation-head failure evidence, not a pass |

Separate creator-master calibration on that environment measured `shifts=0` vocal SI-SDR
improvement +1.752 dB and assignment margin +7.631 dB. Dry-vocal/mix correlation was 0.016856, so
the branch now uses a separately pinned finished master for identity. This probe did not download
YouTube and is not a live pass.

## Machine-checkable contract

`scripts/checks/verify_docs.py` requires the canonical index, PRD, TRD, ADR index and records,
diagram authority, and this matrix, and checks cross-links from architecture and the index.
`scripts/checks/verify_supply_chain.py` derives the configured separator model name and rejects an
inventory that lacks it, uses the retired bandsplit profile, omits required fields, lacks a full
SHA-256/positive byte size, or uses a non-HTTPS model source.

## Re-evaluation triggers

Re-run this matrix whenever the model/signature, fixture, threshold, downloader, separator output
contract, supported platform, persistence policy, evidence retention, workflow scheduling, or
release-blocking status changes.

# Documentation Coverage and Traceability Matrix

Last evaluated: 2026-08-10
Evaluation scope: real known-stem YouTube source-separation validation and the affected BandScope
runtime/release boundaries.

## Sufficiency verdict

The pre-change repository had a strong benchmark operator note but was insufficient: it lacked a
canonical PRD, TRD, ADRs, UML, logical data model, traceability, model inventory consistency, and
release/operations criteria. This branch adds those authorities and mechanical presence checks.

The documentation graph is now structurally sufficient and explicitly code-current, but the product
is not yet release-ready for source separation. A passing live run, model-rights/legal delivery
decision, threshold calibration, supported-platform evidence, and bounded evidence artifact remain
open. Full-hash pre-load verification is now implemented and regression-tested.
The same-byte loader now uses `weights_only=True`, one exact reviewed global allowlist, strict Demucs
construction, and a serialized one-time read/load cache. Repository mutation tests reject an
unrestricted fallback, an allowlist expansion or second allowlist API, moved/broad scanner
suppression, and any second `torch.load` site.

Issue #770 remains open. This branch must not be described as completing the full real-audio MIR
acceptance layer.

## Artifact coverage

| Family | Canonical authority | Assessment | Remaining gap |
|---|---|---|---|
| PRD | `docs/PRD.md` | Adequate for product outcome, scope, users, acceptance, legal boundary, rollout, and non-goals. | Broader multi-fixture/four-stem requirements await evidence. |
| TRD | `docs/TRD.md` | Adequate for interfaces, metrics, schema, platform matrix, failure taxonomy, model delivery, evidence, and traceability. | Performance budget and calibrated thresholds are not yet accepted. |
| Architecture | `ARCHITECTURE.md`, `docs/architecture/overview.md` | Updated for fail-closed htdemucs provisioning and known-stem boundaries. | Model-rights/legal delivery decision remains open. |
| ADR | `docs/adr/README.md`, ADR-0001..0003 | Captures model, live quality gate, and persistence/ERD decisions with alternatives and supersession. | ADR-0001..0003 remain Proposed until branch merge. |
| UML | `docs/architecture/diagrams.md` | Component, sequence, state, class, and deployment views included. | No additional UML is needed for the bounded slice. |
| ERD/data | `docs/architecture/diagrams.md`, ADR-0003 | Logical artifact relationships and persistence status are explicit. | Physical ERD is intentionally not applicable until persistence exists. |
| Security/privacy | `docs/engineering/youtube-known-stem-validation.md`, `docs/security/app-security.md`, ADRs | Threats, trust boundaries, non-collection, integrity, cleanup, and legal limits covered; exact model bytes use the reviewed restricted loader and serialized one-time cache. | Approved-pickle semantic/provenance risk acceptance plus rights/platform authorization remain open. |
| Test strategy | `docs/TRD.md`, operator guide, acceptance criteria | Offline/live split and metric/failure contracts covered. | No successful live score has been recorded. |
| MIR doctoring | `docs/doctoring/real-audio-accuracy-acceptance.md` | Issue #770 metrics, claim boundaries, tiers, and roadmap are separated from the bounded vocal slice. | Accuracy manifest, reports, other MIR families, and corpus tiers remain open. |
| Operations/release | runbook and release policy | Preflight, evidence, triage, rollback, and blocking conditions covered. | Platform matrix and live pass are incomplete. |
| Supply chain | supplemental inventory and dependency policy | Retired model removed; code/inventory artifact parity, fail-closed same-byte restricted loading, exact allowlist mutation guards, uv.lock-bound yt-dlp, and verified ffmpeg/ffprobe evidence contract recorded. | Model provisioning/distribution rights and any future non-pickle conversion remain unresolved. |
| Automation | active CWL autonomous loop and `docs/workflow/pr-review-merge-scheduler.md` | BandScope continuity and no-status-only termination are covered without creating a competing writer. | Dedicated BandScope loop remains paused due writer topology/active-task capacity. |
| Review governance | `docs/security/github-required-checks.md`, governance, gitflow, contributing, bootstrap policy | Stable checks and review are cumulative; qualifying evidence is an exact-head completed CodeRabbit artifact or exact-head independent non-author `APPROVED` review. Status-only, rate-limited, author, or predecessor evidence is excluded. | A provider rate limit can still defer review, blocking only merge. |

## Requirement-to-evidence traceability

| Requirement | Decision/research | Module or artifact | Test/evidence | Release control |
|---|---|---|---|---|
| PRD-KS-001, KS-007 | ADR-0002; YouTube Terms | `bandscope_analysis.youtube` | `test_youtube.py`; opted-in live test | Authorization preflight |
| PRD-KS-002, KS-004 | ADR-0001/0002; Rouard et al. (2023) | `separation/audio_separator.py` | `test_youtube_stem_e2e.py` live case | Exact model identity and supported platform |
| PRD-KS-003 | Le Roux et al. (2019) | `tests/known_stem_benchmark.py` | SI-SDR unit tests and live threshold | Calibration plus exact-candidate score |
| PRD-KS-005 | ADR-0002 | master identity plus composed global alignment helpers | delayed/composed-window tests; live duration/correlation | Authorized YouTube calibration and drift triage |
| PRD-KS-006, KS-010 | ADR-0002 | pytest marker and failure taxonomy | Every collected default offline test; explicit live failure | Advisory until promotion ADR |
| PRD-KS-008 | ADR-0003 | temporary directory and sanitized errors | cleanup postcondition and archive failure tests | Evidence excludes raw media/paths |
| PRD-KS-009 | ADR-0003; NIST AI RMF TEVV | planned bounded evidence schema | No retained score yet | Required before blocking release gate |
| TRD-KS-011 | ADR-0001 | separator manifest, restricted-loader allowlist, serialized load lock, and supplemental inventory | exact filename/hash/size parity; same-byte `weights_only=True`; strict construction; concurrency/read-once and mutation tests; real-artifact load smoke | Approved-pickle risk acceptance and model-rights/legal delivery blocker; any hash/allowlist/dependency change requires new smoke evidence |

## Live evidence snapshot

| Date | Commit under test | Offline contract | Live result | Classification |
|---|---|---|---|---|
| 2026-08-09 | `5a3648a11d9097b8da48bb4a3ccbd97986aec25b` | 13 passed | Reference archive verified; YouTube download failed with HTTP 502 before separation; no score | Exact failure evidence, not a pass |
| 2026-08-09 | `6e937a34f9036d92e909db3ce8848a5c39dc8e3b` (published byte-identical implementation tree) | Full quickcheck: 680 Python passed, 24 skipped, live marker deselected; 100% source coverage | Archive, extracted vocal, creator master, and pre-provisioned model hash verified; production YouTube download failed with HTTP 502 after 65.49 s; no score | Exact implementation-head failure evidence, not a pass |

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
diagram authority, and this matrix; checks cross-links from architecture and the index; and requires
contributing, governance, gitflow, bootstrap, and GitHub bootstrap policy to link the canonical
required-check authority so review policy cannot silently fork.
`scripts/checks/verify_supply_chain.py` derives the configured separator model and exact code-owned
filename/hash/size manifest, then rejects inventory drift. It also binds the yt-dlp record to
`uv.lock`, requires both ffmpeg and ffprobe operator records, rejects the retired bandsplit profile,
and validates every model artifact's schema, types, full SHA-256, positive non-boolean size, and
HTTPS source. `scripts/checks/verify_security_notes.py` recursively requires the exact canonical
`## Security Notes` section in every plan. `scripts/checks/security_gates.py` permits only the one
exact full-hash same-byte `torch.load` call, requires its rule-specific Semgrep and Bandit
suppressions in place, and binds it to `weights_only=True`, the exact global allowlist, and no other
allowlist mutation API.

## Re-evaluation triggers

Re-run this matrix whenever the model/signature, fixture, threshold, downloader, separator output
contract, supported platform, persistence policy, evidence retention, workflow scheduling, or
release-blocking status changes.

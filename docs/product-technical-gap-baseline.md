# BandScope product / technical gap baseline

Status: commercial-development baseline, 2026-09-15. This document is a buyer-facing gap register, not a completion claim. Live protected branches, PR/Issue state, executable tests, release receipts and platform evidence remain authoritative when they are more specific.

## Product truth

BandScope is a local-first rehearsal decision tool. A buyer should be able to admit a real audio source, derive reproducible MIR evidence, turn it into section/role rehearsal decisions, rehearse against audible source material, save and recover the project safely, and install a verifiable update without losing project usability. A synthetic array, mock player, unsigned package, mutable model dependency, or documentation-only workflow cannot satisfy those claims.

The product keeps BandScope-specific audio/rehearsal truth inside BandScope. Organization-wide identity, orchestration, graph, sandbox, egress, policy and other CWL foundation capabilities are consumed only through released contracts when needed; their source is not copied into this repository.

## Bounded-context gap register

| Bounded context | Current buyer truth | Commercial gap / acceptance boundary |
| --- | --- | --- |
| Audio Ingestion | Local file and YouTube intake have narrow validation paths; project bootstrap is local-first. | Rights-cleared real-audio fixtures must prove supported decode/admission on packaged Windows/macOS, including corrupt/truncated/oversized/link/path edge cases. |
| Resource Admission & Decode | Source identity and admission are separate from derived cache/persistence authority. | The protected integration must preserve one source-admission owner and prove decoder/license/provenance behavior on real files. |
| Signal / MIR Analysis | Rehearsal analysis and stem separation have scientific-generation/cache identity work in flight. | Rights-cleared real decoded audio, recognized MIR metrics, uncertainty boundaries, exact implementation/model generation, full model provenance/rights and reproducible CPU reference evidence remain release gates. |
| Rehearsal Insight | Section/role contracts carry rehearsal-facing cues, confidence and export semantics. | Buyer acceptance still needs real-audio evidence that recommendations remain directionally correct, explainable and stable across supported platforms. |
| Active Player | Desktop UI has a player surface but commercial acceptance is not complete. | Actual decoded audio must remain audible and synchronized across seek/range/section selection, reload and stale-source races; pointer/touch/keyboard and screen-reader alternatives require current-head E2E evidence. |
| Project Persistence | Project/cache integrity and scientific cache equivalence have dedicated owner work. | Crash/power-loss, disk-full, interrupted write/recovery, last-known-good project state and packaged-OS fault injection remain buyer gates. |
| Collaboration Handoff | Export/handoff belongs to BandScope without creating a second collaboration platform. | Only released, bounded artifacts should cross product boundaries; mutable shared DB or cross-service SQL is not accepted. |
| Diagnostics | Existing harness/security/build evidence is substantial. | Buyer-safe diagnostics must avoid audio/project/credential leakage and distinguish user cancel, provider/runtime failure, corrupt project and release/update failure. |
| Distribution / Update | #1126 owns exact release identity, model/updater admission, native platform trust, receipts, static manifest, hosted-byte re-verification and immutable-release evidence. The static manifest carries exact source commit, per-target updater digest/size and compatibility floor. Rust decision and state crates now define replay/equivocation/target/schema policy plus a bounded append/sync highest-seen log with torn-tail recovery. | Production updater authority is intentionally blocked until an organization-approved public key and production endpoint exist. Runtime still needs authenticated `Update.raw_json` admission, app-owned state-path wiring, packaged restart/power-loss acceptance, offline-safe checks, partial/disk-full/cancel/first-launch recovery and packaged wrong-key/signature/digest/replay acceptance. Windows/macOS signing/notarization authority and commercial model rights are external prerequisites. |
| UI / Interaction | Rehearsal-first UI is the product surface; Anti-Slop and accessibility are acceptance criteria, not decoration. | Normal/loading/empty/error/permission/responsive states, KO/EN/JA/ZH/VI/ES/DE/FR expansion/fallback, keyboard/focus/contrast/state semantics and actual-audio E2E must be verified on the exact release candidate. |

## Distribution/update decision boundary

The Distribution updater path uses three different evidence classes and must not collapse them into one claim.

1. Tauri updater signatures authenticate updater artifacts under an organization-approved updater key.
2. BandScope release receipts and `bandscope` updater metadata bind exact version, source commit, target, artifact byte size/full SHA-256 and minimum supported version.
3. GitHub immutable-release verification provides hosted publication evidence for the published asset set.

The Rust `apps/desktop/distribution-core` is the deterministic decision layer after authentication. It rejects malformed stable versions, target mismatch, downgrade candidates, metadata older than the locally highest authenticated release, same-version release-identity equivocation and rollback to a build that cannot read the current project schema. It does not fetch, install, sign, notarize, parse arbitrary remote JSON, or write project data.

Highest-seen update identity is Distribution state, not Project Persistence state. `apps/desktop/distribution-state` now provides a separate bounded append-only Rust log that revalidates committed identities, rejects local version regression/equivocation, synchronizes successful appends and recovers only a syntactically valid torn final record prefix. It deliberately does not claim packaged power-loss equivalence across Windows/macOS until platform fault-injection evidence exists. Project Persistence remains authoritative only for project bytes and the project-schema evidence used by rollback compatibility checks.

## Release gate

A release candidate is not commercial-ready until all of the following are true on the exact protected head: required checks and independent review are terminal/qualifying; Windows artifacts are signed by the approved publisher and macOS artifacts are signed/notarized/stapled; updater authority is admitted without placeholder values; updater replay/rollback/recovery is exercised on packaged targets; SBOM/NOTICE/provenance agree with exact shipped bytes; model rights and exact model provenance are established; rights-cleared real-audio scientific acceptance is reproducible; the updater can recover to a compatible known-good build without losing project usability; and material UI passes actual-audio, responsive, locale and accessibility E2E.

Until those conditions are satisfied, Draft/open PRs and blocked release policies are expected safety states rather than reasons to bypass gates.

## Evidence links

- Distribution admission: `docs/traceability/updater-release-admission.md`
- Release receipt/publication: `docs/traceability/release-artifact-receipt.md`
- Updater security metadata, durable freshness state and replay/rollback model: `docs/traceability/updater-security-metadata.md`
- Security trust boundaries: `docs/security/app-security.md`
- Cross-platform release controls: `docs/security/cross-platform-build-policy.md`
- Architecture ownership: `ARCHITECTURE.md`

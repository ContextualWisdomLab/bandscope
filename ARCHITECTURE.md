# ARCHITECTURE.md

Last updated: 2026-09-15

## Brand source

BandScope's product framing and UX hierarchy are governed by `docs/brand-story.md` and `docs/prd/bandscope-prd.md`. Architecture exists to preserve that rehearsal-first product truth rather than to surface implementation capabilities for their own sake.

## Architectural direction

BandScope is a local-first rehearsal decision tool whose scientific and operational claims must remain traceable to actual decoded audio, explicit provenance, deterministic contracts, and release evidence.

The system favors narrow bounded contexts, explicit ownership, typed contracts, fail-closed resource admission, and durable local state. Cross-context sharing should use released contracts rather than source copies, direct database access, or implicit mutable state.

## Product-level invariants

- Actual audio is the source of rehearsal truth. Synthetic data is unit-test evidence only.
- Source admission, decode, scientific analysis, rehearsal insight, playback, project state, distribution/update state, and UI interaction have distinct ownership.
- A derived artifact must carry enough generation and provenance identity to decide whether it remains equivalent to the current source and implementation.
- Local project state must survive process interruption and recover without silently presenting stale or incompatible analysis as current.
- A packaged release is not commercial-ready until exact source, package, signing/notarization, model rights, SBOM/provenance, update and recovery evidence agree.
- Distribution/update trust is promoted in stages; remote JSON, downloaded bytes, a synchronized file, a signature, publication evidence, and local freshness state are not interchangeable evidence classes.

## Security posture

- Treat local and remote paths, links, media, updater metadata, model bytes, archives and subprocess boundaries as untrusted until admitted by their owning context.
- Avoid privilege expansion caused by generic filesystem handles, generic process execution, mutable release references, unbounded response buffering or cross-context state mutation.
- Keep write authority narrow. A read-side verification interface must not accidentally expose a writable underlying object.
- Split privilege where feasible across UI, analysis workers, subprocesses, model delivery, and updater behavior.
- Fail safely when a link, file, artifact, or boundary cannot be validated.

## Repository map

- `apps/desktop` - desktop shell and user-facing React UI
- `apps/desktop/distribution-core` - Tauri-independent Rust security policy for updater release identity, anti-replay, target compatibility, and project-schema-aware rollback decisions
- `apps/desktop/distribution-runtime` - stateless Rust admission boundary for untrusted Tauri updater JSON; returns provisional metadata only and cannot mutate freshness state
- `apps/desktop/distribution-download` - network-library-independent Rust streaming/staging boundary for updater artifacts; owns expected-size/content-length/chunk/cumulative limits, exclusive temporary artifact lifecycle, cleanup-on-drop and read-only descriptor-bound verifier access, but not HTTP, signatures, digests or installation
- `apps/desktop/distribution-state` - Distribution-owned bounded append/sync log for the highest authenticated updater identity; consumes `distribution-core` identity and never project bytes
- `packages/shared-types` - stable cross-layer types shared by the UI and orchestration layer
- `services/analysis-engine` - Python analysis service for source separation and music analysis
- `scripts/harness` - fail-fast repo verification
- `scripts/checks` - small doc and structure checks

## Distribution/update bounded context

- Distribution owns commercial release identity, native signing/notarization admission, updater policy, immutable publication evidence, bounded updater artifact transport/storage admission, highest-seen update freshness state, and last-known-good installer recovery decisions.
- `apps/desktop/distribution-core` contains deterministic security decisions only. It does not fetch metadata, verify Tauri signatures, write project data, run installers, or manufacture signing/key authority.
- `apps/desktop/distribution-runtime` admits the current static updater JSON only as bounded provisional remote input. It rejects duplicate/unknown members, unexpected targets, mutable release URLs and invalid release-identity syntax, and it projects the fixed app-owned highest-seen path without creating or writing it. It deliberately has no `distribution-state` dependency.
- `apps/desktop/distribution-download` owns the pure streaming/staging primitive used before artifact trust is established. It enforces a 2 GiB artifact ceiling, exact optional `Content-Length`, 1 MiB maximum caller chunk, cumulative overrun rejection before sink write, sink-error poisoning, exact-length completion, exclusive app-owned staging and cleanup-on-drop. A sealed artifact remains provisional; downstream verification reads the exact still-open descriptor through a positional `Read` wrapper and cannot obtain the underlying write-capable staging `File` through the public API. This context does not perform network I/O, authenticate metadata, verify signatures/digests, run installers or mutate freshness state. Commercial completion requires the production HTTP adapter to route actual response bytes through this boundary instead of relying on Tauri's full-response buffering.
- `apps/desktop/distribution-state` persists only the highest authenticated release identity as a bounded append-only log. It revalidates committed identities, rejects local version regression/equivocation, synchronizes accepted appends, and recovers only a syntactically valid torn final-record prefix; it does not own Tauri networking/signature verification, installer execution, or project persistence.
- Tauri updater signatures authenticate downloaded updater artifact bytes. They do not, by themselves, authenticate the whole `Update.raw_json` response or BandScope's `sourceCommit`/digest extensions. Remote metadata therefore stays provisional until a canonical metadata-authentication path binds its release identity to trusted authority.
- Only after metadata authentication and updater artifact signature/digest/size binding may exact `version`, `sourceCommit`, updater SHA-256, target, and compatibility floor enter `distribution-core` and `distribution-state` as freshness authority.
- Stable-channel automatic update decisions use canonical numeric `MAJOR.MINOR.PATCH`. Prerelease/build ordering is not approximated; a future beta channel requires a separate ADR and canonical SemVer implementation.
- A release older than locally persisted highest-seen authenticated metadata is replay, and the same version with a different source commit or updater digest is equivocation. Neither may be silently downgraded into a normal update offer.
- Highest-seen release identity belongs to Distribution-owned app state and is recorded only after its metadata identity has authenticated authority; installation completion is not required, but syntactically valid remote JSON alone is insufficient. Project Persistence remains owner of project bytes and project-schema truth.
- Automatic rollback may use only a previously authenticated known-good installer whose version is older than the current installation and whose declared reader can open the current on-disk project schema. The decision core does not bypass project recovery or schema ownership.
- `release/updater-policy.json` remains fail-closed while organization-approved updater key/production endpoint authority is absent. No source code or test fixture is production authority.
- Traceability and claim boundaries live in `docs/traceability/updater-release-admission.md`, `docs/traceability/release-artifact-receipt.md`, `docs/traceability/updater-security-metadata.md`, and `docs/traceability/updater-bounded-download.md`.

## Product capability scope

- BandScope is not only a shell around chord labels, stems, and ranges.
- The technical scope includes rehearsal-facing outputs for harmony, section roadmap, groove cues, role entry and dropout cues, simplification guidance, transposition or setup guidance, confidence flags, and rehearsal priority.
- These outputs must stay aligned with `docs/brand-story.md` rather than drifting back to a song-summary-only analyzer.

## Analysis target model

- The analysis target is a `song -> section -> role` hierarchy, not a single song-wide chord track.
- A `role` can represent an instrument, a vocal function, or a hand-specific subdivision when the arrangement exposes it clearly.
- Typical roles include bass, guitar, keyboard players, keyboard left hand, keyboard right hand, lead vocal, backing vocal, horns, strings, and other arrangement-carrying parts.
- Shared contracts should be able to carry different harmonic guidance for simultaneous roles in the same section.

## Rehearsal outputs

- Core rehearsal artifacts should include:
  - likely harmony by section and by role
  - section roadmap with entries, dropouts, pickups, stops, tags, and handoffs
  - groove and timing cues relevant to locking the band together
  - playable ranges and density or overlap warnings, with the ready workspace naming tonight's first span and the next instrument check

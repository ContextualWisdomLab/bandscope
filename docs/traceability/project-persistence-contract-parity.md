# Project persistence contract parity

## Finding

The renderer saves a `RehearsalSong` only after `@bandscope/shared-types` accepts the current contract, then sends the complete object to the native `save_project` command. The native command independently deserializes that object as `RehearsalSongPayload` before writing it.

At PR #1160 predecessor `ded24060f7cd7e3ab5cc69111d7545e76ccbbe0e`, those two contracts had drifted. The shared contract already admitted top-level `tempo` and `collaboration`, and role-level `harmonicExplanation`, `transpositionPlan`, `transcription`, and `practiceProgress`. The native Rust payload used `deny_unknown_fields` but did not declare those fields. A valid current rehearsal result could therefore pass renderer validation and then fail native Save with `Invalid project payload`.

This is a Project Persistence prerequisite under #962, not a new Active Player storage authority. #1160 encountered it while preparing selected-source persistence/reload; the repair keeps the existing single native save/load boundary and does not persist a playback authority.

## Test-first evidence

RED `0926ab89950221e595e0f002962838330b464066` adds `apps/desktop/core/tests/project_persistence_contract.rs`. The fixture uses the already-canonical shared fields and requires native parse/serialize round-trip preservation of tempo, collaboration, harmonic explanation, transposition plan, transcription, and practice progress. The predecessor native payload rejects that fixture because those properties are unknown.

No pull-request-triggered hosted workflow materialized on the RED commit, so the RED is source-level test evidence rather than a hosted failure receipt.

## Causal repair

Fix `38b1328b12bf2285f3ca632f208ecf82029ede0a` brings the native persistence DTO into structural parity with those existing shared fields. Optional additions remain optional for older `.bscope` files. The native payload continues to use `deny_unknown_fields`; the repair does not replace schema validation with an untyped `serde_json::Value` pass-through.

The new nested DTOs mirror the existing collaboration and transcription shapes. No arbitrary path, local source path, selected stem authority, credential, model-provider setting, or volatile transport receipt is added to the project artifact.

## Alternatives considered

- **Drop the newer fields before native Save** — rejected because it would silently destroy accepted rehearsal work and violate #962's no-hidden-data-loss requirement.
- **Remove `deny_unknown_fields` or persist arbitrary JSON** — rejected because `.bscope` is untrusted input and unknown project data must not bypass the native trust boundary.
- **Create a second React/localStorage persistence store for Active Player state** — rejected because #962 requires one storage authority and transaction boundary.
- **Implement the complete #962 format/version/autosave/recovery system inside #1160** — rejected as an ownership violation and an unrelated expansion of the Active Player child.

## Security notes

`.bscope` remains untrusted user-controlled JSON. Tauri still enforces the existing 5 MiB load bound before parsing, and both native and renderer contracts retain structural validation. This change broadens only the explicit allowlist to fields already accepted by the canonical shared `RehearsalSong` contract. It does not weaken arbitrary-field rejection and does not make filesystem paths portable project data.

The present native validator is not yet the complete #962 commercial project schema: enum/value-domain parity, collection/string/depth limits, duplicate/cycle rules, an independent `project_format_version`, golden fixtures, and migration receipts remain canonical #962 work.

## Effect and remaining risk

The source-level repair removes the immediate contract-drift cause that rejected normal current-song Save. It is not sufficient evidence for crash-safe persistence. `save_project` still writes the final path directly with `std::fs::write`; atomic staging, flush/validation/replace, known-good backup, autosave, recovery, migration and fault injection remain open under #962.

Selected playback-source persistence also remains unresolved. When that state becomes durable it must persist a stable project semantic (for example an admitted source kind) through the #962 project contract, never a revocable opaque `bandscope-project://...` authority or renderer-local receipt.

## Verification boundary

Repository GREEN requires the unchanged final head to run the core integration test plus the protected repository/central checks, Windows/macOS build, dependency/SBOM/security and coverage gates, and qualifying independent review. Absent, queued, skipped, cancelled, stale, predecessor or self evidence is non-passing.

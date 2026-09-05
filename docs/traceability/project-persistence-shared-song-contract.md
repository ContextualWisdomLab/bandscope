# Project Persistence Shared-Song Contract Traceability

## Problem

The desktop shared contract already permits collaboration data and role-level rehearsal fields, but the native Project Persistence DTO on #970 did not preserve them. Because the native DTO uses `deny_unknown_fields`, a renderer-valid `RehearsalSong` containing collaboration, `harmonicExplanation`, `transpositionPlan`, `transcription`, or `practiceProgress` could be rejected at save/load. Follow-up review found two inverse drift modes as well: unrestricted Rust strings / unconstrained progress could accept invalid domain values, and Rust `Option<T>` would silently accept explicit JSON `null` where the TypeScript validator accepts only omission or a value of the declared type.

## Constraints

- #970/#962 remains the canonical Project Persistence owner; #1160 is evidence/consumer work, not a second durable storage authority.
- Preserve `projectFormatVersion: 1`, finite-positive tempo validation, strict unknown-field rejection, the existing golden fixture, and current atomic publication/recovery behavior.
- Do not serialize volatile `bandscope-playback` authorities into `.bscope` files.
- Do not replace the current file wholesale with the older #1160 snapshot because it predates #970's v1 envelope and later persistence hardening.

## RED → fix evidence

- Structural RED: `93e9e80fa13d93692fdbd8d7d9acd10714ee8e8d` adds an integration contract requiring parse/serialize preservation of current collaboration and role fields.
- Structural fix: `819d8af80e425dc5627d86659a5fc97ec90c2767` adds typed native DTOs for those fields while retaining the existing v1/tempo/unknown-field invariants.
- Domain RED: `6bcdf160a7e95cc540d96e49e25868c19a438106` proves invalid collaboration sync/status tokens and `practiceProgress = 101` must fail closed.
- Domain fix: `a1cf37ea98db2f8024ca710d563d879c04204961` replaces unrestricted collaboration state strings with serde enums and bounds `practiceProgress` to an integer from 0 through 100.
- Optional-null RED: `ed61d1c5f10e2baa4290fb40d692b82fb7dde500` proves explicit `null` is not equivalent to an omitted optional field for collaboration, collaboration `roleId`, or role explanation/transposition/transcription fields.
- Optional-null fix: `8b4ae848ec360a5af42b50076af15b643ae5275e` uses one generic present-value deserializer so missing properties retain `None` compatibility while explicit `null` must deserialize as the declared value type and therefore fails closed. `ed9abedf0e5069fa93780fa3440ca91500cbdd93` extends the same regression coverage to optional `scoreAttachments`.

The shared renderer authority is `packages/shared-types/src/index.ts` on protected `develop`: `syncMode` accepts `local_only | planned_cloud`; assignment status accepts `todo | in_progress | ready | blocked`; comment status accepts `open | resolved`; approval status accepts `pending | approved | changes_requested`; and `practiceProgress`, when present, is an integer from 0 through 100. Its optional fields test `!== undefined` before validating the concrete declared type, so explicit `null` is invalid rather than another spelling of absence.

## Alternatives rejected

- **Copy the #1160 `lib.rs` snapshot:** rejected because it would overwrite later #970 persistence invariants and violate owner/consolidation boundaries.
- **Store new fields as `serde_json::Value`:** rejected because it weakens the fail-closed schema boundary and silently turns project compatibility into an untyped bag.
- **Keep collaboration states as `String`:** rejected because malformed or future tokens could be persisted as if they were current domain values.
- **Clamp out-of-range practice progress:** rejected because changing user/project data on load hides corruption or contract drift; malformed input must fail closed.
- **Treat explicit `null` as omission:** rejected because the renderer parser does not do so, and normalizing malformed project input during load would conceal schema drift.

## Effects and remaining risks

A current shared rehearsal song can now cross the native Project Persistence boundary without dropping the newly covered fields; collaboration/progress domains and omission-versus-null semantics for the newly touched optionals match the renderer validator. This does not complete #962. Existing older native DTO fields still include stringly typed domain values whose exact renderer-domain parity needs a separate focused audit. Numeric transcription bounds and other legacy field invariants also need an evidence-driven cross-language pass rather than speculative tightening. Autosave, backup rotation, global startup recovery, deterministic migrations beyond v1, fault injection, and selected-playback-source persistence/reload remain open.

Selected playback source persistence must use a stable semantic (`full_mix | vocals | bass | drums | other`) and resolve a fresh native playback authority on reopen; a missing source must fail closed to Full mix.

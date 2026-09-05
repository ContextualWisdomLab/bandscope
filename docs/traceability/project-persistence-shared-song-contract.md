# Project Persistence Shared-Song Contract Traceability

## Problem

The desktop shared contract already permits collaboration data and role-level rehearsal fields, but the native Project Persistence DTO on #970 did not preserve them. Because the native DTO uses `deny_unknown_fields`, a renderer-valid `RehearsalSong` containing collaboration, `harmonicExplanation`, `transpositionPlan`, `transcription`, or `practiceProgress` could be rejected at save/load. Follow-up review found inverse drift modes as well: unrestricted Rust strings / unconstrained progress could accept invalid domain values, Rust `Option<T>` would silently accept explicit JSON `null` where the TypeScript validator accepts only omission or a value of the declared type, and several older native fields still admitted arbitrary strings where the shared contract defines closed domains.

## Constraints

- #970/#962 remains the canonical Project Persistence owner; #1160 is evidence/consumer work, not a second durable storage authority.
- Preserve `projectFormatVersion: 1`, finite-positive tempo validation, strict unknown-field rejection, the existing golden fixture, and current atomic publication/recovery behavior.
- Do not serialize volatile `bandscope-playback` authorities into `.bscope` files.
- Do not replace the current file wholesale with the older #1160 snapshot because it predates #970's v1 envelope and later persistence hardening.
- Closed-domain validation must mirror the current shared renderer contract rather than inventing new persistence-only values.

## RED → fix evidence

- Structural RED: `93e9e80fa13d93692fdbd8d7d9acd10714ee8e8d` adds an integration contract requiring parse/serialize preservation of current collaboration and role fields.
- Structural fix: `819d8af80e425dc5627d86659a5fc97ec90c2767` adds typed native DTOs for those fields while retaining the existing v1/tempo/unknown-field invariants.
- Collaboration/progress RED: `6bcdf160a7e95cc540d96e49e25868c19a438106` proves invalid collaboration sync/status tokens and `practiceProgress = 101` must fail closed.
- Collaboration/progress fix: `a1cf37ea98db2f8024ca710d563d879c04204961` replaces unrestricted collaboration state strings with serde enums and bounds `practiceProgress` to an integer from 0 through 100.
- Optional-null RED: `ed61d1c5f10e2baa4290fb40d692b82fb7dde500` proves explicit `null` is not equivalent to an omitted optional field for collaboration, collaboration `roleId`, or role explanation/transposition/transcription fields.
- Optional-null fix: `8b4ae848ec360a5af42b50076af15b643ae5275e` uses one generic present-value deserializer so missing properties retain `None` compatibility while explicit `null` must deserialize as the declared value type and therefore fails closed. `ed9abedf0e5069fa93780fa3440ca91500cbdd93` extends the same regression coverage to optional `scoreAttachments`.
- Closed-domain RED: `2b0a47e6305b7b7a3e87857335d0f36dfabc9712` adds a current-song fixture with a valid user-owned harmony override and proves that invalid section labels, confidence levels/provenance, role types, harmony provenance, cue kinds, rehearsal priorities, export formats, and manual-override field/authority tokens must fail closed.
- Closed-domain fix: `96d66ed6f5fad918b0ddef8a1e6494b76f8bafd0` replaces those unrestricted native strings with serde enums that serialize to the exact shared values. Manual overrides use a dedicated user-only harmony payload so an outer `source: "user"` cannot mask a nested model-owned override value.
- Positive-domain coverage: `f8c30150375b39d54e1775d941f6515d2686410c` exercises every currently valid section-form, confidence, provenance, role-type, cue-kind, rehearsal-priority, and export-format token. This guards the serde rename rules, including `pre-chorus`, `cue-sheet`, and `chart-summary`, against a repair that rejects legitimate existing projects.
- Security-note contract RED: `d7886876b285f16ceda83ff5e0dd848e31cf7f97` extends the repository Security Notes verifier from plans to traceability records. The previous version of this document has no `Security Notes` section, so the governed check fails until the boundary below is explicit.

The shared renderer authority is `packages/shared-types/src/index.ts` on protected `develop`. Its relevant domains are: section form label `intro | verse | pre-chorus | chorus | bridge | outro | tag | pickup | stop | handoff`; confidence `low | medium | high`; provenance `model | user`; cue kind `lyric | count | transition`; role type `instrument | vocal | hand`; rehearsal priority `low | medium | high`; export format `cue-sheet | chart-summary`; manual override field `harmony` with both outer and value provenance fixed to `user`; collaboration sync `local_only | planned_cloud`; assignment status `todo | in_progress | ready | blocked`; comment status `open | resolved`; approval status `pending | approved | changes_requested`; and `practiceProgress`, when present, an integer from 0 through 100. Optional fields test `!== undefined` before validating the concrete declared type, so explicit `null` is invalid rather than another spelling of absence.

## Alternatives rejected

- **Copy the #1160 `lib.rs` snapshot:** rejected because it would overwrite later #970 persistence invariants and violate owner/consolidation boundaries.
- **Store new fields as `serde_json::Value`:** rejected because it weakens the fail-closed schema boundary and silently turns project compatibility into an untyped bag.
- **Keep shared closed domains as `String`:** rejected because malformed or future tokens could be persisted as if they were current domain values, creating renderer/native disagreement on reopen.
- **Use general provenance for manual overrides:** rejected because the shared `ManualOverride` contract requires both the override and its harmony value to be explicitly user-owned; allowing `model` there would change the authority meaning of persisted edits.
- **Clamp out-of-range practice progress:** rejected because changing user/project data on load hides corruption or contract drift; malformed input must fail closed.
- **Treat explicit `null` as omission:** rejected because the renderer parser does not do so, and normalizing malformed project input during load would conceal schema drift.

## Effects and remaining risks

A current shared rehearsal song can now cross the native Project Persistence boundary without dropping the newly covered fields. Collaboration/progress states, omission-versus-null semantics, and the renderer's closed section/role/confidence/provenance/cue/export/manual-override domains are represented by native typed values rather than arbitrary strings. This does not complete #962. Transcription-number semantics and other legacy invariants still need evidence-driven cross-language comparison; the shared validator currently type-checks `onset`, `offset`, and `velocity` as JavaScript numbers rather than defining rehearsal-specific numeric bounds, so persistence must not invent such bounds without a product/scientific contract. Autosave, backup rotation, global startup recovery, deterministic migrations beyond v1, fault injection, and selected-playback-source persistence/reload remain open.

Selected playback source persistence must use a stable semantic (`full_mix | vocals | bass | drums | other`) and resolve a fresh native playback authority on reopen; a missing source must fail closed to Full mix.

## Security Notes

### Attack surface

`.bscope` content is untrusted local file input, and save targets, recovery journals, staged files, backup/displaced files, file metadata, collaboration payloads, role-level rehearsal data, and renderer-provided project JSON all cross trust boundaries. Project files can therefore exercise parser, filesystem, recovery, and local-privacy failure modes even though BandScope remains local-first and this slice adds no network authority.

### Trust boundary

The renderer may submit only the shared `RehearsalSong` contract. Native Project Persistence is the storage authority: it admits the versioned envelope, applies `deny_unknown_fields`, validates finite-positive tempo and closed-domain enums, rejects explicit `null` where omission is the only absent form, and keeps volatile `bandscope-playback` authorities out of durable project state. Filesystem authority remains confined to the user-selected target plus BandScope-owned same-parent staging/recovery names after parent-chain, final-component, regular-file, native-identity, size, and platform checks.

### Mitigations

Validation uses explicit allowlists for the project envelope and current shared domains instead of `serde_json::Value` bags or permissive strings. Reads are bounded to the 5 MiB project limit and use no-follow/native-identity checks. Saves stage and sync complete bytes before publication, preserve data-file permissions without executable/special bits, and use target-scoped prepared recovery journals plus parent-directory synchronization around replacement and cleanup. Recovery acts only on the exact target and BandScope-owned candidate/displaced identities; mismatched or ambiguous state fails closed rather than deleting or following arbitrary paths.

### Safe failure and logging/privacy

Malformed envelopes, unsupported versions, invalid shared-domain tokens, explicit-null drift, unsafe paths, identity mismatches, oversized files, and unrecoverable journal states return bounded product errors without echoing project contents, local paths, collaboration text, credentials, or secret-shaped values into logs. Failure must retain known-good project data or retryable recovery state whenever mutation has begun; it must not silently coerce corrupt values, fabricate a source selection, or fall back to direct non-atomic overwrite.

### Test points

Executable coverage includes shared-song parse/serialize parity, closed-domain positive and negative cases, omission-versus-null behavior, progress bounds, v1 fixture compatibility, bounded read/write size, symlink/reparse and ancestor checks, native file identity, first-save/no-clobber behavior, existing-target replacement, stage cleanup, permission normalization, Windows replacement/recovery, macOS/Windows case-alias recovery, completed rollback, and stale-journal cleanup. `scripts/checks/verify_security_notes.py` now also treats traceability records as governed Security Notes documents so later edits cannot silently drop this boundary.

### Realistic threats

The realistic threats are malformed or future project payloads being accepted as current truth; a local directory participant racing or pre-creating recovery names; link/reparse redirection; file replacement between preflight and publication; interruption during replacement/rollback; permissive file modes exposing rehearsal data to another local account; and stale runtime playback authorities being mistaken for durable project truth. The controls are scoped to local project persistence and do not claim protection against a fully compromised operating system or an attacker with equivalent account authority.

### Remaining risk

Parent authority is still path-based after lexical validation, so concurrent ancestor replacement is not yet descriptor-bound. Recovery is target-scoped and normally runs when that project path is selected rather than through a global startup scan. Autosave, backup rotation, deterministic migrations beyond v1, exhaustive power-loss/fault injection, and selected-playback-source persistence/reload remain #962 work. Those gaps must stay explicit and must not be described as crash-safe or shipped until current-head cross-platform evidence proves the corresponding implementation.
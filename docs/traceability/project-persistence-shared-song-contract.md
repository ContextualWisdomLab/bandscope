# Project Persistence Shared-Song Contract Traceability

## Problem

The desktop shared contract already permits collaboration data and role-level rehearsal fields, but the native Project Persistence DTO on #970 did not preserve them. Because the native DTO uses `deny_unknown_fields`, a renderer-valid `RehearsalSong` containing collaboration, `harmonicExplanation`, `transpositionPlan`, `transcription`, or `practiceProgress` could be rejected at save/load. Follow-up review found inverse drift modes as well: unrestricted Rust strings / unconstrained progress could accept invalid domain values, Rust `Option<T>` would silently accept explicit JSON `null` where the TypeScript validator accepts only omission or a value of the declared type, and several older native fields still admitted arbitrary strings where the shared contract defines closed domains.

A later buyer-path review found a second persistence boundary problem. Rehearsal mutations, including score attachment metadata, were accepted into React state through `handleSongUpdate` before any app-owned Project Persistence commit. For a local project this made renderer memory the effective source of truth between edits and manual Save. A process exit after a durable score PDF publication but before a manual project save could therefore leave valid buyer bytes without durable attachment metadata.

## Constraints

- #970/#962 remains the canonical Project Persistence owner; #1160 is evidence/consumer work, not a second durable storage authority.
- Preserve finite-positive tempo validation, strict unknown-field rejection, legacy/v1/v2 compatibility fixtures, the current versioned migration boundary, and atomic publication/recovery behavior.
- Do not serialize volatile `bandscope-playback` authorities or user filesystem paths into `.bscope` files.
- Do not replace the current file wholesale with an older #1160 snapshot because it predates later #970 persistence hardening.
- Closed-domain validation must mirror the current shared renderer contract rather than inventing persistence-only values.
- Renderer code may select an already-minted project id but must not choose or submit the app-owned snapshot path.
- Manual Save remains a user-selected export surface; the local crash-safe snapshot is a distinct app-owned persistence target.

## RED → fix evidence

- Structural RED `93e9e80fa13d93692fdbd8d7d9acd10714ee8e8d` requires parse/serialize preservation of current collaboration and role fields. `819d8af80e425dc5627d86659a5fc97ec90c2767` adds typed native DTOs while retaining tempo/unknown-field invariants.
- `6bcdf160a7e95cc540d96e49e25868c19a438106` proves invalid collaboration sync/status tokens and `practiceProgress = 101` fail closed; `a1cf37ea98db2f8024ca710d563d879c04204961` closes those domains with enums and a 0–100 integer bound.
- `ed61d1c5f10e2baa4290fb40d692b82fb7dde500` proves explicit `null` is not omission for collaboration, collaboration `roleId`, and role explanation/transposition/transcription fields. `8b4ae848ec360a5af42b50076af15b643ae5275e` implements present-value deserialization; `ed9abedf0e5069fa93780fa3440ca91500cbdd93` extends it to optional `scoreAttachments`.
- `2b0a47e6305b7b7a3c0b5986af5802427e98d2a` is unrelated Score Storage lineage and is not Project Persistence acceptance. Project Persistence keeps score-byte lifecycle policy in its owning bounded context and consumes only durable song metadata.
- `2b0a47e6305b7b7a3e87857335d0f36dfabc9712` adds negative closed-domain cases; `96d66ed6f5fad918b0ddef8a1e6494b76f8bafd0` replaces unrestricted strings with exact serde enums. Manual overrides use a user-only harmony payload so outer `source: "user"` cannot mask model-owned nested provenance. `f8c30150375b39d54e1775d941f6515d2686410c` exercises every valid section-form, confidence, provenance, role-type, cue-kind, rehearsal-priority, and export-format token.
- `d7886876b285f16ceda83ff5e0dd848e31cf7f97` extends the repository Security Notes verifier from plans to traceability records; `0185267ab819dd4b9ac1352f5fce1df8e2a7a782` adds the required Project Persistence security boundary.
- Governance RED `45037f9fe5aa7c265d28c0da33fdedcf26f3ac49` proves a later peer section cannot supply missing Security Notes evidence and requires the project-format document to use the canonical heading. `907f3a7f70db0ac9fce11839ee215600cec15abe` bounds extraction at the next same-level heading; `65e422cd4d39014f2586ca86616f25b4b17e5e82` adds the nested-heading case and `d1ba145d9cdd7126df240a02d0c07f253a80d3c3` closes the remaining parent-heading escape without excluding legitimate nested subsections. `3883f342ac427fbed35fe2a88c4c6e7dd2f6a499` keeps the verifier Ruff import ordering canonical.
- `a7c86be8e20895e3baebee44d33ef765e0837b5f` requires the buyer-visible limit to name the exact `5 * 1024 * 1024` ceiling as 5 MiB. `04e19ef6d19aced87e22015e4ec165cbce89f1d0` fixes the native diagnostic and `73d6a80183c19166b75be05f9286bee3769069e0` aligns the engineering format documentation without changing the byte threshold.
- Later project-format work preserves these shared-song rules while advancing current writes to version 3. `ace91a29e540919d02716dd492e290f9743422a8` repairs stale v2-output assertions so legacy/v1/v2 remain predecessor compatibility inputs rather than being mistaken for current output.
- Mutation-order RED `33e2aea4e92fea8263974676269f7cd5770100b3` requires a local-project edit to remain unacknowledged in renderer state while durable persistence is pending. It was superseded before a hosted RED completed, so it is source-level RED evidence only. `05f003be20e03975b90d4de7703c40e2e287f34d` adds the explicit workspace-save selector to the renderer bridge. `10e06a095b5532f72fecdcffadf6817f77e809b4` makes native `save_project` resolve the existing app-owned project root and fixed `project.bscope` child without accepting a renderer path, then reuse the established recovery/publication state machine. `8a0ede2e9d222167ba3f5d632163bd44ebf0e209` changes `handleSongUpdate` so React acknowledges a local-project mutation only after that native save resolves. `2c083b2d916883fd3708c853201ced88e4af6753` binds the RED to the actual `saveProject(..., projectId, true)` contract. `633b50647b8d53045c97c4eba2cea9f456a2faa8` guards the native fixed-target wiring; `6d4682f5650bfd50c434a20bee6f2e52ef2bad3d` proves the bridge sends only project id plus the workspace selector and never a snapshot path.

The shared renderer authority is `packages/shared-types/src/index.ts` on protected `develop`. Relevant domains are section form `intro | verse | pre-chorus | chorus | bridge | outro | tag | pickup | stop | handoff`; confidence `low | medium | high`; provenance `model | user`; cue kind `lyric | count | transition`; role type `instrument | vocal | hand`; rehearsal priority `low | medium | high`; export format `cue-sheet | chart-summary`; manual override field `harmony` with outer and value provenance fixed to `user`; collaboration sync `local_only | planned_cloud`; assignment status `todo | in_progress | ready | blocked`; comment status `open | resolved`; approval status `pending | approved | changes_requested`; and optional integer `practiceProgress` from 0 through 100. Optional fields use omission, not explicit `null`, as the absent representation.

## Alternatives rejected

- **Copy the #1160 Rust snapshot:** it would overwrite later #970 persistence invariants and violate owner/consolidation boundaries.
- **Store new fields as `serde_json::Value`:** it weakens the fail-closed schema and turns compatibility into an untyped bag.
- **Keep shared closed domains as `String`:** malformed or future tokens could be persisted as current domain values.
- **Use general provenance for manual overrides:** the shared contract requires the override and its harmony value to be explicitly user-owned.
- **Clamp invalid practice progress:** silent coercion hides corruption or contract drift.
- **Treat explicit `null` as omission:** the renderer does not, so doing so natively creates cross-language disagreement.
- **Keep `5MB` for a binary ceiling:** 5 × 1024 × 1024 bytes is 5 MiB; buyer-visible diagnostics must name the actual unit.
- **Search for Security Notes keywords until end-of-file:** unrelated later sections could make an incomplete security record pass the verifier. Extraction must respect Markdown section hierarchy.
- **Autosave through the manual Save As path:** every rehearsal edit would transfer storage authority back to the user-facing file picker and make correctness depend on interaction rather than project state.
- **Let the WebView supply an app-local snapshot path:** that would collapse the native path-authority boundary. The renderer supplies only a minted project id and a boolean workspace intent; native code derives `project.bscope`.
- **Optimistically mutate React state and persist afterward:** a process exit between those steps recreates the exact metadata-loss window being removed. Local-project renderer state is acknowledgement after durable publication, not the durable authority itself.

## Current effect

A current shared rehearsal song crosses Project Persistence without dropping the covered fields. Collaboration/progress state, omission-versus-null semantics, and closed section/role/confidence/provenance/cue/export/manual-override domains are typed rather than arbitrary strings. The project ceiling remains exactly 5,242,880 bytes.

Current `.bscope` writes are now `projectFormatVersion: 3`, not v1. V3 retains the closed stable playback preference and adds an optional path-free app-owned `sourceReference`; legacy raw-song, v1, and v2 inputs migrate deterministically without inventing source evidence. The source-reference schema is separate from shared-song MIR/rehearsal truth.

For a local project with native publication authority, `handleSongUpdate` now serializes the proposed current song through the native `save_project` command in workspace mode before replacing accepted React state. Native code resolves the existing app-owned project root from the minted project id and persists the fixed `project.bscope` child with the same target-scoped recovery and atomic publication primitives used by manual project saves. Manual Save remains a separate user-selected export and does not become the app-local source of truth.

This narrows, but does not eliminate, the score attachment crash window. Once Score Storage has published `<score_id>.pdf`, Project Persistence can durably commit the updated song metadata before renderer acknowledgement. A kill before that metadata commit can still leave published score bytes that require an explicit recovery-candidate/lifecycle contract; Project Persistence must not silently invent metadata, and Score Storage must not silently delete the bytes.

The Security Notes verifier now treats the requested heading as a real Markdown section: nested subsections remain inside it, while the next peer or parent heading terminates the evidence window. A later Operations/Decision section therefore cannot satisfy missing mitigation/test/risk requirements by keyword coincidence.

Transcription-number semantics still require an evidence-driven cross-language contract: the shared validator currently type-checks `onset`, `offset`, and `velocity` as JavaScript numbers rather than defining rehearsal-specific numeric bounds, so persistence must not invent such bounds without product/scientific evidence.

## Security Notes

### Attack surface

`.bscope` content is untrusted local file input. Save targets, recovery journals, staged/backup/displaced files, file metadata, collaboration payloads, role-level rehearsal data, renderer project JSON, and the optional app-owned source reference cross trust boundaries. App-owned `project.bscope` is also a durable authority boundary: renderer mutation payloads cross IPC, but renderer paths do not. Documentation evidence itself is also a governance input: a permissive parser could misclassify incomplete Security Notes as compliant. This remains local-first and adds no network authority.

### Trust boundary

Native Project Persistence is the durable storage authority. It admits the versioned envelope, applies `deny_unknown_fields`, validates finite-positive tempo and closed domains, rejects explicit `null` where omission is required, and keeps volatile playback capabilities and user paths out of durable truth. The renderer may select workspace persistence using a native project id already minted by BandScope; native code alone resolves the existing project root and fixed snapshot child. Resource Admission—not Project Persistence—owns derivation/re-admission of an app-owned audio artifact from a validated v3 source reference. Score Storage owns score-byte publication; Project Persistence owns durable attachment metadata and reconciliation state, not the PDF copy primitive. The repository verifier owns only documentation-policy evidence and must not infer required content from outside the actual Security Notes section.

### Mitigations

Typed allowlists are used instead of arbitrary JSON/string bags. Reads are bounded to 5 MiB and use no-follow/native-identity checks. Saves stage and sync complete bytes before publication, preserve data-file permissions without executable/special bits, and use target-scoped recovery journals plus parent-directory synchronization. Current source references are path-free and limited to a BandScope project id, fixed `source.<extension>` artifact name, admitted extension, and positive byte evidence; malformed references fail before publication. Local mutation acknowledgement uses a fixed native `project.bscope` target under the validated existing project root; the WebView cannot provide that path. React accepts local-project mutation state only after the native Project Persistence promise resolves. Security Notes extraction stops at the next heading whose level is the same as or higher than the Security Notes heading, preserving legitimate nested subsections while excluding unrelated later evidence.

### Safe failure and logging/privacy

Malformed/unsupported envelopes, invalid shared-domain tokens, explicit-null drift, unsafe paths, source-reference mismatch, identity mismatch, oversized files, ambiguous recovery state, and local snapshot publication failure return bounded product errors without echoing project content, local paths, collaboration text, credentials, or secret-shaped values. Failure must retain known-good data or retryable recovery state once mutation begins; it must not coerce corrupt values, fabricate source evidence, or fall back to direct overwrite. A failed workspace persistence does not replace the previously accepted renderer song. A malformed or incomplete documentation section fails verification instead of borrowing keywords from later content.

### Test points

Executable coverage includes shared-song parse/serialize parity, closed-domain positive/negative cases, omission-versus-null behavior, progress bounds, legacy/v1/v2 migration, v3 source-reference round trip/rejection, exact 5 MiB diagnostics, symlink/reparse and ancestor checks, native file identity, first-save/no-clobber behavior, existing-target replacement, stage cleanup, permission normalization, Windows replacement/recovery, macOS/Windows case-alias recovery, completed rollback, stale-journal cleanup, passive renderer object admission, workspace bridge argument authority, fixed native workspace-target wiring, and renderer mutation acknowledgement ordering. `scripts/checks/verify_security_notes.py` treats traceability records as governed Security Notes documents; regression coverage proves both peer-heading and parent-heading boundaries and the canonical `## Security Notes` heading in the project-format document.

### Realistic threats

Relevant threats are malformed/future project payloads being treated as current truth; a local directory participant racing or pre-creating recovery names; link/reparse redirection; file replacement between preflight and publication; interruption during replacement/rollback; permissive modes exposing rehearsal data to another local account; executable renderer object shapes crossing the adapter; stale playback/user-path authority being persisted as project truth; React acknowledging a mutation that has not reached durable storage; concurrent or stale UI mutations competing for one app-owned snapshot; a process terminating after a score PDF becomes durable but before attachment metadata commits; and incomplete security documentation being accepted because required words appear later in an unrelated section. These controls do not claim protection against a fully compromised OS or attacker with equivalent account authority.

### Remaining risk

The fixed app-owned `project.bscope` snapshot now gives local-project mutations a native durable target before renderer acknowledgement, but startup discovery/reopen does not yet automatically consume that snapshot as the app-local source of truth. The post-score-publication/pre-metadata-commit window therefore still needs an explicit recovery-candidate contract across Project Persistence and Score Storage; no side may infer delete/adopt solely from filesystem presence. Concurrent renderer mutations are not yet a versioned compare-and-swap queue, so overlapping edits require a future sequencing/revision contract before the persistence slice can claim full multi-action transaction semantics.

Parent authority is still path-based after lexical validation rather than descriptor-bound. Known-good backup rotation, global startup recovery, deterministic migration receipts/hashes, downgrade behavior, exhaustive interruption/power-loss injection, mounted Save/Reopen UX, and packaged Windows/macOS real-audio acceptance remain #962/release work and must not be described as shipped or fully crash-safe without exact-head evidence.
# Score bridge resource-admission boundary

Status: Proposed

## Problem

BandScope sends Score/PDF identities to Tauri commands and accepts bytes/attachment metadata back across IPC before buyer-visible use. Native Score Storage already caps admitted PDFs at 25 MiB and admits score ids only in its lowercase hyphenated UUID-shaped syntax, but the renderer historically treated several IPC values as trustworthy.

The renderer formerly allocated a destination `Uint8Array` from an untrusted `number[]` length before validating the byte domain, accepted oversized typed containers, and admitted zero-byte content. The attach response also originally accepted impossible `fileSizeBytes` values and arbitrary string identity/presentation metadata.

One identity gap remained after attachment-response admission was tightened. `attachScorePdf()` rejected a noncanonical returned `scoreId`, while `readScorePdf()` and `removeScorePdf()` still sent any string to the native command. This contradicted the source contract that only allowlisted ids cross IPC. The current shared `ScoreAttachment` parser on this stack requires only a non-empty attachment `id`, so malformed persisted/live state can reach that caller boundary even though the native read/remove implementation independently rejects the id.

The renderer also rejects whitespace-only returned filenames. That rule is intentionally stricter than the current shared durable schema, which rejects only the empty string. It is renderer defense in depth, not shared-schema authority.

## Constraints and ownership

- Native Score Storage owns picker/path authority, native score-id admission, PDF magic, symlink handling, publication, content receipts, durability, recovery and destructive mutation.
- Canonical #865 owns descriptor-bounded read-time size/content validation. TypeScript must not duplicate its filesystem/PDF policy.
- Renderer byte containers must be non-empty and no larger than 25 MiB before downstream parsing or a second allocation.
- Oversized `number[]` input must fail before destination allocation or element access.
- Attachment size metadata must be a positive safe integer no larger than 25 MiB.
- Native-returned and renderer-supplied score ids must satisfy the native lowercase hyphenated `8-4-4-4-12` hexadecimal syntax at the Score IPC boundary.
- Invalid bridge data is not reflected into diagnostics; callers receive `Invalid score bridge response`.
- Tightening/migrating the durable shared attachment schema remains shared-types/Project Persistence ownership.

## Decision

`MAX_SCORE_PDF_BRIDGE_BYTES` remains `25 * 1024 * 1024`.

`readScorePdf()` now rejects a noncanonical `scoreId` before Tauri invoke, rejects empty/oversized `Uint8Array`, `ArrayBuffer` and `number[]` values, bounds arrays before allocation/element access, and admits only integer array bytes from `0..255`.

`attachScorePdf()` requires a positive safe-integer size at or below the ceiling, a native-compatible returned score id, and a nonblank returned filename while preserving accepted filename text verbatim.

`removeScorePdf()` rejects a noncanonical `scoreId` before Tauri invoke and otherwise preserves the native boolean/idempotent deletion contract.

These renderer checks do not authorize filesystem operations. Native command validation remains authoritative.

## Alternatives rejected

- **Trust native exclusively:** native remains authoritative, but renderer admission should not allocate from unbounded responses or invoke a privileged score command with syntax it already knows native will reject.
- **Validate after allocation:** too late for the resource-admission objective.
- **Copy `%PDF-`, path or descriptor policy to TypeScript:** violates the native/#865 single-writer boundary.
- **Validate only attachment responses:** leaves malformed persisted/live ids able to cross read/remove IPC.
- **Tighten shared project schema here:** broader compatibility/migration decision owned elsewhere.
- **Normalize filenames:** would silently rewrite presentation metadata and import platform policy into the renderer.

## RED → repair evidence

Retained earlier lineage:

- `0067f8de5766adeccbe62466b56d496257b9b700` → `698d0dc253c005d5baab0b5c68a10701ed449fc0`: bound byte-container admission before allocation/read.
- `7c53c5414ef79f403ea051c3256b38eca4f034c0` → `bf97eda4f4cf599afb8aee96aa9d5b54ba01d3d9`: reject impossible attachment-size metadata.
- `333008b92b7db9844fe677e6b1d79a4172655599` → `335aba67edf6cd50f11cec172449f059c11a5e4e`: validate attachment-response identity/presentation metadata.
- `3b4bbe2607988e79f91000bdd742fe15b3373ce6` → `e454d52e75e6890781ed111337c99e038edaad2e`: reject zero-byte bridge content.
- `82e71a69f4da4bd540d0dd27417944744ef304fc` → `ebee7c1bbea5e91403d4608729c0ad4e06ba7d1e`: reject whitespace-only returned filenames. This is renderer defense in depth; the live shared schema itself only requires a non-empty filename.

Current caller-admission repair:

- RED `745561478c6b89347f5514c1294101ef7ade6960`: malformed and uppercase score ids must fail before the read/remove Tauri invoke shim is called. Existing response tests use a canonical id so this guard cannot make them vacuous.
- Repair `36a9a4859af760301d37ffa565e04837afc09052`: centralize the score-id predicate and apply it to attachment responses plus read/remove call admission.
- Test-shape cleanup `700fba20d50c54f64189b3d7f88e9a6a0932fd32`: retain the RED semantics with homogeneous typed parameter tables.

The RED was immediately followed by repair; no hosted terminal RED is claimed.

## Security Notes

Tauri commands expose a frontend-to-Rust IPC call surface. Runtime authority/capability handling and Rust validation remain authoritative. The renderer adds accept-known-good input validation before score read/remove invokes and postcondition validation on score responses.

A malformed project document or stale in-memory object with a non-empty but noncanonical attachment id can pass the current shared durable parser. Before this repair it could reach native score read/remove IPC. Native validation still prevented path escape, so this is not evidence of a native traversal bypass; it is a bridge-contract consistency and unnecessary privileged-call finding.

MITRE CWE-770 maps to the former unbounded renderer allocation surface. CWE-1286 maps to the defined score-id syntax that the renderer previously failed to enforce consistently at the IPC boundary.

References:

- MITRE. (2026). *CWE-770: Allocation of Resources Without Limits or Throttling* (CWE 4.20). https://cwe.mitre.org/data/definitions/770.html
- MITRE. (2026). *CWE-1286: Improper Validation of Syntactic Correctness of Input* (CWE 4.20). https://cwe.mitre.org/data/definitions/1286.html
- Tauri. (2026). *Inter-process communication*. https://v2.tauri.app/concept/inter-process-communication/
- Tauri. (2025). *Runtime authority*. https://v2.tauri.app/security/runtime-authority/

## Residual risk / follow-up

The 25 MiB ceiling and score-id syntax are mirrored across Rust and TypeScript and can drift if native policy changes. Such changes require paired contract review and tests.

The durable shared attachment parser remains less strict than this renderer boundary: it admits any non-empty attachment id and filename. This repair prevents malformed ids from reaching score read/remove IPC but does not migrate malformed persisted metadata. Shared-schema normalization/migration must be handled by its canonical owner.

Renderer zero-byte rejection is not a substitute for #865 native read-time validation, and no latency/heap/GC improvement is claimed without packaged-path measurement.

Normal order remains #1176 protected integration → #865 reconciliation/protected integration → this lane ordinary/non-force reconciliation to protected `develop` → fresh focused/repository/security evidence → independent approval. Representative rights-cleared PDFs near the admission limit still need packaged Score/PDF heap/GC acceptance.

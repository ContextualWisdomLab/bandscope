# Score bridge resource-admission boundary

Status: Proposed

## Problem

BandScope sends project/score identities to Tauri commands and accepts bytes/attachment metadata back across IPC before buyer-visible use. Native Score Storage already caps admitted PDFs at 25 MiB, admits project ids only as `project-<nanos>-<counter>`, and admits score ids only in its lowercase hyphenated UUID-shaped syntax, but the renderer historically treated several IPC values as trustworthy.

The renderer formerly allocated a destination `Uint8Array` from an untrusted `number[]` length before validating the byte domain, accepted oversized typed containers, and admitted zero-byte content. The attach response also originally accepted impossible `fileSizeBytes` values and arbitrary string identity/presentation metadata.

Score-id admission was then made two-sided, but project context remained asymmetric. `attachScorePdf()`, `readScorePdf()`, and `removeScorePdf()` still sent arbitrary project strings to native score commands even though native `is_valid_project_id()` rejects anything except the exact minted `project-<digits>-<digits>` shape before project identity can influence a filesystem path. The focused bridge tests reinforced this mismatch by using `project-1`, a value that cannot be minted or admitted by the native project boundary. `attachScorePdf()` also sent blank/whitespace-only song ids even though the native command rejects them before publication.

The current shared `ScoreAttachment` parser on this stack requires only a non-empty attachment `id`; it does not own native project-id or score-id syntax. Renderer project/score admission is therefore defense in depth at a privileged IPC boundary, not shared-schema authority.

The renderer also rejects whitespace-only returned filenames. That rule is intentionally stricter than the current shared durable schema, which rejects only the empty string. It is renderer defense in depth, not shared-schema authority.

## Constraints and ownership

- Native Score Storage owns picker/path authority, native project/score-id admission, PDF magic, symlink handling, publication, content receipts, durability, recovery and destructive mutation.
- Canonical #865 owns descriptor-bounded read-time size/content validation. TypeScript must not duplicate its filesystem/PDF policy.
- Renderer byte containers must be non-empty and no larger than 25 MiB before downstream parsing or a second allocation.
- Oversized `number[]` input must fail before destination allocation or element access.
- Attachment size metadata must be a positive safe integer no larger than 25 MiB.
- Renderer-supplied project ids must satisfy the native `project-<digits>-<digits>` syntax before score IPC; native validation remains authoritative.
- `attachScorePdf()` must reject a blank/whitespace-only song id before IPC, matching the native publication precondition without importing song semantics beyond nonblank identity.
- Native-returned and renderer-supplied score ids must satisfy the native lowercase hyphenated `8-4-4-4-12` hexadecimal syntax at the Score IPC boundary.
- Invalid bridge data/context is not reflected into diagnostics; callers receive `Invalid score bridge response`.
- Tightening/migrating durable shared project/attachment schemas remains shared-types/Project Persistence ownership.

## Decision

`MAX_SCORE_PDF_BRIDGE_BYTES` remains `25 * 1024 * 1024`.

`PROJECT_ID_PATTERN` mirrors the native minted/admitted syntax as `^project-[0-9]+-[0-9]+$`. `attachScorePdf()`, `readScorePdf()`, and `removeScorePdf()` reject malformed project ids before Tauri invoke. `attachScorePdf()` also rejects a blank/whitespace-only song id before invoke. Accepted project/song strings are passed through unchanged.

`readScorePdf()` rejects a noncanonical `scoreId` before Tauri invoke, rejects empty/oversized `Uint8Array`, `ArrayBuffer` and `number[]` values, bounds arrays before allocation/element access, and admits only integer array bytes from `0..255`.

`attachScorePdf()` requires a positive safe-integer size at or below the ceiling, a native-compatible returned score id, and a nonblank returned filename while preserving accepted filename text verbatim.

`removeScorePdf()` rejects a noncanonical `scoreId` before Tauri invoke and otherwise preserves the native boolean/idempotent deletion contract.

These renderer checks do not authorize filesystem operations. Native command validation remains authoritative.

## Alternatives rejected

- **Trust native exclusively:** native remains authoritative, but renderer admission should not allocate from unbounded responses or invoke a privileged score command with syntax it already knows native will reject.
- **Validate only score ids:** leaves impossible project identity crossing every score-storage IPC call and keeps tests green with project ids native code can never admit.
- **Validate song ids with a product-specific syntax:** rejected. Native publication only requires nonblank song identity here; inventing a tighter renderer format would create a second song-identity owner.
- **Validate after allocation:** too late for the resource-admission objective.
- **Copy `%PDF-`, path or descriptor policy to TypeScript:** violates the native/#865 single-writer boundary.
- **Tighten shared project schema here:** broader compatibility/migration decision owned elsewhere.
- **Normalize filenames or ids:** would silently rewrite identity/presentation metadata rather than fail closed.

## RED → repair evidence

Retained earlier lineage:

- `0067f8de5766adeccbe62466b56d496257b9b700` → `698d0dc253c005d5baab0b5c68a10701ed449fc0`: bound byte-container admission before allocation/read.
- `7c53c5414ef79f403ea051c3256b38eca4f034c0` → `bf97eda4f4cf599afb8aee96aa9d5b54ba01d3d9`: reject impossible attachment-size metadata.
- `333008b92b7db9844fe677e6b1d79a4172655599` → `335aba67edf6cd50f11cec172449f059c11a5e4e`: validate attachment-response identity/presentation metadata.
- `3b4bbe2607988e79f91000bdd742fe15b3373ce6` → `e454d52e75e6890781ed111337c99e038edaad2e`: reject zero-byte bridge content.
- `82e71a69f4da4bd540d0dd27417944744ef304fc` → `ebee7c1bbea5e91403d4608729c0ad4e06ba7d1e`: reject whitespace-only returned filenames. This is renderer defense in depth; the live shared schema itself only requires a non-empty filename.
- `745561478c6b89347f5514c1294101ef7ade6960` → `36a9a4859af760301d37ffa565e04837afc09052`: reject malformed/uppercase score ids before read/remove IPC and share one score-id predicate across both directions.

Current project-context repair:

- RED `b12fc68ed129067da781dcbb14f2986ce3b381c9`: replace impossible `project-1` happy-path fixtures with native-admissible `project-1-2`; require malformed/path-shaped/extra-segment project ids to fail before **all** score IPC calls; require blank/whitespace-only song ids to fail before attach IPC; assert the invoke shim is untouched.
- Repair `8989c969cd6fbd6ec6e2fec94231046382b9baf7`: add one renderer `PROJECT_ID_PATTERN`, apply it to attach/read/remove call admission, and mirror only the native nonblank song precondition for attach.

The RED was immediately followed by repair; no hosted terminal RED is claimed.

## Security Notes

Tauri commands expose a frontend-to-Rust IPC call surface. Runtime authority/capability handling and Rust validation remain authoritative. The renderer adds accept-known-good input validation before score-storage invokes and postcondition validation on score responses.

Native `is_valid_project_id()` documents that project ids are minted as `project-<nanos>-<counter>` and rejects any other shape before the id can influence an app-owned filesystem path. Before this repair the renderer could still send impossible or path-shaped project context to each score command. Native validation prevented path escape, so this is not evidence of a native traversal bypass; it is a bridge-contract consistency and unnecessary privileged-call finding. The same claim boundary applies to malformed score ids.

MITRE CWE-770 maps to the former unbounded renderer allocation surface. CWE-1286 maps to the defined project/score-id syntax that the renderer previously failed to enforce consistently at the IPC boundary.

References:

- MITRE. (2026). *CWE-770: Allocation of Resources Without Limits or Throttling* (CWE 4.20). https://cwe.mitre.org/data/definitions/770.html
- MITRE. (2026). *CWE-1286: Improper Validation of Syntactic Correctness of Input* (CWE 4.20). https://cwe.mitre.org/data/definitions/1286.html
- Tauri. (2026). *Inter-process communication*. https://v2.tauri.app/concept/inter-process-communication/
- Tauri. (2025). *Runtime authority*. https://v2.tauri.app/security/runtime-authority/

## Residual risk / follow-up

The 25 MiB ceiling plus project/score-id syntax are mirrored across Rust and TypeScript and can drift if native policy changes. Such changes require paired contract review and tests. A future shared versioned identity contract may remove this duplication; this PR does not create one.

The durable shared attachment parser remains less strict than this renderer boundary: it admits any non-empty attachment id and filename. This repair prevents malformed ids/context from reaching score IPC but does not migrate malformed persisted metadata. Shared-schema normalization/migration must be handled by its canonical owner.

Renderer zero-byte rejection is not a substitute for #865 native read-time validation, and no latency/heap/GC improvement is claimed without packaged-path measurement.

Normal order remains #1176 protected integration → #865 reconciliation/protected integration → this lane ordinary/non-force reconciliation to protected `develop` → fresh focused/repository/security evidence → independent approval. Representative rights-cleared PDFs near the admission limit still need packaged Score/PDF heap/GC acceptance.
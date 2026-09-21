# Score bridge resource-admission boundary

Status: Proposed

## Problem

BandScope accepts Score/PDF bytes and attachment metadata across the Tauri IPC boundary before the renderer hands them to buyer-visible UI or sends stored-score operations back to the native command layer. The native Score Storage boundary already caps admitted PDFs at 25 MiB and admits score identities only in its lowercase hyphenated UUID-shaped syntax, but the renderer historically treated several bridge values as trustworthy.

For `number[]` read responses, the renderer allocated `new Uint8Array(response.length)` before applying byte-domain validation. A malformed or compromised bridge response could therefore request a second oversized renderer allocation before any byte was inspected. `Uint8Array` and `ArrayBuffer` responses likewise crossed the renderer boundary without an independent size check. All three forms also admitted zero-length content even though zero bytes cannot be a usable PDF.

The attach path separately accepted impossible metadata. `fileSizeBytes` originally required only the JavaScript `number` type, and `scoreId` / `fileName` originally required only strings. That allowed non-finite, fractional, non-positive, oversized size metadata, noncanonical score identities, and blank presentation metadata to enter renderer state.

A final one-sided identity gap remained after attachment-response validation was tightened: `attachScorePdf()` rejected a noncanonical returned `scoreId`, but `readScorePdf()` and `removeScorePdf()` still accepted an arbitrary string and sent it to the privileged native command. This contradicted the source comment that only allowlisted score identities cross IPC. It was reachable from malformed/inconsistent renderer or persisted project state because the current shared `ScoreAttachment` parser on this stack requires only a non-empty attachment `id`; it does not enforce the native UUID-shaped syntax. Native `read/remove` still fail closed, but renderer admission was inconsistent across the two IPC directions.

The renderer also rejects whitespace-only returned filenames. This is deliberately stricter than the current shared durable schema, which rejects only the empty string. The stricter renderer predicate prevents presentation-only whitespace from entering live Score UI state; it is defense in depth, not a claim that the shared schema already owns the same predicate.

The current #1176-base native `read_score_pdf` still performs an ordinary file read after path validation. A previously admitted app-owned PDF that is later truncated can therefore yield unusable content to the renderer. Canonical #865 owns descriptor-bounded read-time size/content revalidation; this renderer lane must not duplicate that Rust filesystem/PDF policy.

## Constraints

- Native Score Storage remains the authoritative owner of picker/path authority, score-id filesystem admission, PDF magic validation, symlink handling, publication, content receipts, durability, recovery and destructive mutation.
- Renderer admission must not become a second filesystem or PDF-validity implementation.
- All accepted byte-container forms must be non-empty and no larger than 25 MiB before downstream parsing or a second allocation.
- Oversized `number[]` values must be rejected before destination allocation or attacker-shaped element access.
- Attachment size metadata must be a positive safe integer no larger than the same 25 MiB ceiling.
- Native-returned and renderer-supplied score identities must satisfy the native lowercase hyphenated UUID-shaped syntax before crossing the renderer/native Score IPC boundary.
- The renderer may reject presentation metadata more strictly than the shared durable schema, but it must not describe that stricter predicate as shared-schema authority.
- Invalid bridge/identity data is not reflected into logs or buyer-visible diagnostics; callers receive the stable `Invalid score bridge response` boundary.
- Changes to native size or identity contracts require an explicit two-sided review; durable shared-schema tightening remains its canonical owner rather than being silently imposed here.

## Alternatives considered

### Trust the native command exclusively

Rejected. Native validation is still authoritative, but the renderer is a separate IPC consumer/caller and should not allocate from unbounded bridge responses or invoke a privileged score command with an identity it already knows cannot satisfy the native contract. Tauri command arguments and return values cross an IPC serialization boundary; consumer-side admission is a defense-in-depth contract, not a replacement for Rust validation.

### Validate bytes after allocating the destination buffer

Rejected. That detects malformed byte values but does not bound the allocation performed before validation.

### Accept typed arrays and `ArrayBuffer` without a renderer cap

Rejected. Their byte domain is already valid, but their size is still a resource-admission input.

### Reimplement `%PDF-`, path, or descriptor policy in TypeScript

Rejected. Exact PDF content/provenance and filesystem semantics remain native Score Storage / #865 authority. The renderer only rejects values that cannot be usable bridge content and bounds its own allocation surface.

### Validate only attachment-response score ids

Rejected. The same identity is subsequently supplied by renderer/project state to `read_score_pdf` and `remove_score_pdf`. One-sided postcondition checking still lets malformed persisted/live state cross the privileged IPC call boundary. The same syntax predicate is therefore applied immediately before both read and remove invokes while native validation remains authoritative.

### Tighten the shared project schema from this lane

Rejected. The live shared `ScoreAttachment` parser on this stack requires non-empty `id` and `fileName`; it does not require native UUID syntax or non-whitespace filename content. Changing that durable project contract is broader Project Persistence/shared-types ownership. This lane instead fails closed at the Score bridge boundary and records the cross-layer drift explicitly.

### Normalize filenames in the renderer

Rejected. Native filename/path legality remains Score Storage authority and buyer-visible presentation text should not be silently rewritten. The renderer only rejects empty/whitespace-only presentation values and preserves accepted filenames verbatim.

## Decision

`MAX_SCORE_PDF_BRIDGE_BYTES` remains `25 * 1024 * 1024`, matching the current native Score Storage maximum.

`readScorePdf()` now:

- rejects a noncanonical `scoreId` before native IPC;
- rejects zero-length `Uint8Array`, `ArrayBuffer`, and `number[]` responses;
- rejects typed containers above the ceiling before returning or constructing a view;
- rejects an oversized `number[]` before destination allocation/element access; and
- performs one-pass validation/copy for bounded arrays, admitting only integer values `0..255`.

`attachScorePdf()` now:

- accepts `fileSizeBytes` only when it is a positive safe integer at or below the ceiling;
- accepts returned `scoreId` only when it matches native lowercase hyphenated `8-4-4-4-12` hexadecimal syntax; and
- rejects empty or whitespace-only returned `fileName` while preserving accepted filenames verbatim.

`removeScorePdf()` now rejects a noncanonical `scoreId` before native IPC. It otherwise preserves the native command's boolean/idempotent deletion contract.

The renderer check does not authorize an operation. It only rejects obviously invalid syntax earlier; the native command still independently checks identity, path and filesystem authority.

## RED → repair evidence

Earlier retained lineage:

- `0067f8de5766adeccbe62466b56d496257b9b700` → `698d0dc253c005d5baab0b5c68a10701ed449fc0`: bound array admission before allocation/read and apply the cap to typed containers.
- `7c53c5414ef79f403ea051c3256b38eca4f034c0` → `bf97eda4f4cf599afb8aee96aa9d5b54ba01d3d9`: require possible attachment-size metadata.
- `333008b92b7db9844fe677e6b1d79a4172655599` → `335aba67edf6cd50f11cec172449f059c11a5e4e69771c14f8`: attachment identity/presentation response admission. The filename reasoning is corrected here: whitespace rejection is renderer defense in depth, not an existing shared-schema `trim()` rule.
- `3b4bbe2607988e79f91000bdd742fe15b3373ce6` → `e454d52e75e6890781ed111337c99e038edaad2e`: reject zero-byte bridge containers.
- `82e71a69f4da4bd540d0dd27417944744ef304fc` → `ebee7c1bbea5e91403d4608729c0ad4e06ba7d1e`: reject whitespace-only returned filenames without normalization.

Current identity-call repair:

- RED `745561478c6b89347f5514c1294101ef7ade6960`: adds read/remove regressions requiring malformed and uppercase score ids to fail before the Tauri invoke shim is called. Existing response-admission tests are switched to a canonical id so the new caller guard cannot accidentally make those tests vacuous.
- Production repair `36a9a4859af760301d37ffa565e04837afc09052`: centralizes the score-id predicate and applies it to attachment responses plus read/remove call admission.
- Test-shape cleanup `700fba20d50c54f64189b3d7f88e9a6a0932fd32`: preserves the RED semantics while keeping each `it.each` table homogeneously typed.

The test-only RED was immediately followed by the repair, so no hosted terminal RED is claimed. This PR is stacked on an unprotected feature prerequisite; fresh hosted exact-head evidence must be reacquired only after normal prerequisite integration/reconciliation.

## Security Notes

### Trust and authority boundary

Tauri v2 commands expose a frontend-to-Rust IPC call surface. Runtime authority/capability checks and Rust command validation remain authoritative. This renderer rule is an additional accept-known-good input check before invoking the score read/remove commands and a postcondition check on score command responses.

A malformed project document or stale in-memory object with a non-empty but noncanonical attachment id can currently pass the shared durable attachment parser. Before this repair it could therefore reach native read/remove IPC. Native validation prevented path escape, so this is not evidence of a native traversal bypass; it is a bridge-contract consistency and unnecessary privileged-call finding.

### CWE mapping

MITRE CWE-770, *Allocation of Resources Without Limits or Throttling*, maps to the pre-repair array/typed-container allocation surface. The repair moves an explicit size limit ahead of renderer allocation and downstream PDF parsing.

MITRE CWE-1286, *Improper Validation of Syntactic Correctness of Input*, maps directly to the score-id issue: native Score Storage defines a concrete accepted syntax, while the renderer previously sent arbitrary strings to read/remove IPC and initially accepted arbitrary string identities from attachment responses. The repair uses an accept-known-good syntax check at the bridge boundary. This is intentionally narrower than claiming the project schema itself is now canonicalized.

References:

- MITRE. (2026). *CWE-770: Allocation of Resources Without Limits or Throttling* (CWE 4.20). https://cwe.mitre.org/data/definitions/770.html
- MITRE. (2026). *CWE-1286: Improper Validation of Syntactic Correctness of Input* (CWE 4.20). https://cwe.mitre.org/data/definitions/1286.html
- Tauri. (2026). *Inter-process communication*. https://v2.tauri.app/concept/inter-process-communication/
- Tauri. (2025). *Runtime authority*. https://v2.tauri.app/security/runtime-authority/

### Residual risk

The 25 MiB value and score-id syntax are intentionally mirrored from the native owner rather than imported from one shared executable implementation. They can drift if native policy changes, so such changes require paired contract review and tests.

The durable shared attachment parser remains less strict than this renderer boundary: it accepts any non-empty attachment id and any non-empty filename. This repair prevents malformed score ids from reaching score read/remove IPC, but it does not make malformed persisted metadata valid or automatically migrate it. Durable-schema normalization/migration belongs to the shared-types/Project Persistence owner.

Renderer zero-byte rejection is not a substitute for #865's native read-time validation. Nonempty corrupted/truncated content can still be invalid PDF data. No latency, heap or GC improvement is claimed without packaged-path measurement.

## Follow-up

1. #1176 must reach protected ancestry through normal gates; then reconcile this owner ordinary/non-force onto current `develop`.
2. Keep #865 as native read-time allocation/content-validation owner and consume its protected contract without copying Rust source.
3. Reacquire focused Score bridge tests plus repository/security/SAST/SBOM evidence on one unchanged protected-target head.
4. Evaluate durable `ScoreAttachment.id` syntax tightening/migration only in the canonical shared-types/Project Persistence owner, because existing persisted documents may require compatibility handling.
5. Verify representative rights-cleared PDFs near the admission limit in the packaged Score/PDF path and record heap/GC behavior separately from correctness/security claims.
6. Keep Score bridge admission distinct from Score Storage publication/recovery and ScoreViewer rendering-performance owners.

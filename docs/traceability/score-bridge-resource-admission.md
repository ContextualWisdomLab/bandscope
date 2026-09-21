# Score bridge resource-admission boundary

Status: Proposed

## Problem

BandScope accepts score-PDF bytes and attachment metadata from the Tauri IPC bridge before the renderer hands those bytes to buyer-visible Score/PDF UI. The native Score Storage boundary already caps admitted PDFs at 25 MiB, but the renderer previously trusted the returned container size.

For `number[]` responses, the renderer allocated `new Uint8Array(response.length)` before applying byte-domain validation. A malformed or compromised bridge response could therefore request a second oversized renderer allocation before any byte was inspected. `Uint8Array` and `ArrayBuffer` responses likewise crossed the renderer boundary without an independent size check.

A smaller validity gap remained after the size repair: all three accepted bridge container forms also admitted a zero-length payload. At attachment time, native score admission reads the complete `%PDF-` magic header, so zero bytes are never valid admitted PDF content. The current #1176-base `read_score_pdf` command, however, still performs `std::fs::read` after path validation; an app-owned score object truncated after attachment can therefore surface as a successful empty `Vec<u8>`. A test/dev shim or serialization defect can produce the same renderer input. The renderer previously forwarded all of those zero-byte results to the Score/PDF UI. Native descriptor-bounded read-time size/content revalidation remains canonical #865 ownership rather than being duplicated here.

The attach path had a related metadata-integrity gap: `fileSizeBytes` was accepted whenever its JavaScript type was `number`. `NaN`, infinity, negative/fractional values, zero, or a value above the native 25 MiB admission ceiling could therefore become renderer-visible attachment metadata even though none can describe a successfully admitted stored score.

A second attach-path gap remained after the size repair. `scoreId` and `fileName` were accepted on JavaScript type alone. Native Score Storage mints score identities as lowercase hyphenated UUIDs and later read/remove commands reject any other score-id syntax; the durable shared project schema also requires a non-blank attachment filename. A malformed IPC response could therefore be accepted into renderer/project state even though the native owner would deterministically reject the identity on the next operation, or the shared project parser would reject an empty or whitespace-only filename on persistence/reload.

The first attachment-metadata repair rejected only `fileName.length === 0`, which still admitted values such as `" \t "`. That remained inconsistent with the shared `ScoreAttachment` parser, whose filename invariant is `fileName.trim().length > 0`. A whitespace-only bridge filename could therefore be accepted into live renderer state and only fail later when the same attachment crossed the durable project-schema boundary.

These repairs treat the IPC response as a trust boundary, so renderer admission remains fail-closed when native storage state, the bridge, a test/dev shim, or future serialization code returns data that cannot be valid buyer-visible score content. Tauri v2 commands serialize values across the WebView/core IPC message boundary; frontend tests can also deliberately mock command results, so producer postconditions are explicit contracts rather than TypeScript compile-time guarantees.

## Constraints

- Native Score Storage remains the owner of picker/path authority, PDF magic validation, filesystem publication, symlink handling, content receipts, durability, recovery, and destructive mutation.
- Renderer validation must not create a second filesystem or PDF-validity implementation.
- The renderer must reject zero-length and oversized byte containers before downstream PDF parsing. Zero bytes can never be valid PDF content; exact PDF magic/content revalidation remains native #865 authority.
- The renderer must reject oversized array containers before creating a second buffer or iterating attacker-shaped array elements.
- All accepted byte-container forms must obey the same renderer ceiling.
- Attachment-size metadata must describe a possible successfully admitted score: a positive safe integer no greater than the renderer/native 25 MiB ceiling.
- Returned score identities must satisfy the native owner's lowercase hyphenated UUID syntax before they can enter renderer/project state.
- Returned attachment filenames must contain at least one non-whitespace character, matching the durable shared `ScoreAttachment` schema without inventing stricter cross-platform filename rules in the renderer.
- Invalid IPC data is not reflected into logs or error text; callers receive the stable `Invalid score bridge response` boundary.
- A future native size-limit, score-identity, or shared attachment-filename contract change requires an explicit two-sided contract update and fresh tests rather than silently widening one side of the boundary.

## Alternatives considered

### Trust the native command exclusively

Rejected. Native attachment validation protects initial ingestion, but the current base read command can still observe a later-truncated app-owned file, and the renderer also consumes IPC data from test/dev shims and serialization code. The renderer should not allocate an unbounded second buffer, forward zero-byte content as a usable score, or persist impossible attachment metadata merely because the normal producer is expected to be correct.

### Validate bytes after allocating the destination buffer

Rejected. This detects malformed byte values but does not bound the allocation that occurs before validation. Resource admission must precede allocation and element access.

### Accept typed arrays and `ArrayBuffer` without a renderer cap

Rejected. Their byte domain is already valid, but their size is still a resource-admission input and can feed the PDF path directly.

### Reimplement native PDF-magic validation in the renderer

Rejected. The minimum renderer guard is narrower: zero-byte content is always invalid, while exact `%PDF-` validation, descriptor semantics, file selection and filesystem provenance stay with native Score Storage and canonical native read owner #865. This consumer repair must not become a second PDF validator.

### Validate only that `scoreId` and `fileName` are strings

Rejected. Type-valid strings can still violate the contracts consumed immediately downstream. An arbitrary non-empty `scoreId` can be persisted but rejected by native read/remove, while an empty or whitespace-only `fileName` is invalid under the shared durable project schema. Admission therefore checks the score-id syntax actually minted/admitted by Score Storage and the shared schema's non-blank filename invariant.

### Normalize or copy native filename/path policy into TypeScript

Rejected. Native file selection and filesystem semantics remain Score Storage authority. The renderer does not trim or rewrite the buyer-visible filename and does not second-guess platform-specific filename legality or path resolution. It only rejects a value that the shared durable schema would reject later anyway.

### Duplicate native PDF and filesystem validation in TypeScript

Rejected. That would violate the Score Storage ownership boundary and create divergent security implementations. The renderer owns only the IPC container/metadata admission needed before local allocation and downstream parsing/persistence.

## Decision

The renderer defines `MAX_SCORE_PDF_BRIDGE_BYTES = 25 * 1024 * 1024`, matching the native Score Storage maximum.

`readScorePdf` now:

- rejects zero-length `Uint8Array`, `ArrayBuffer`, and `number[]` responses as invalid score content;
- rejects `Uint8Array.byteLength` above the ceiling before returning the object;
- rejects `ArrayBuffer.byteLength` above the ceiling before constructing a `Uint8Array` view;
- rejects `number[]` length above the ceiling before destination allocation or element access;
- performs the existing one-pass byte validation/copy for bounded arrays, admitting only integer values from 0 through 255.

`attachScorePdf` now:

- accepts `fileSizeBytes` only when it is a positive safe integer at or below the same ceiling;
- accepts `scoreId` only when it matches the native lowercase hyphenated UUID syntax (`8-4-4-4-12`, hexadecimal); and
- accepts `fileName` only when `fileName.trim().length > 0`, matching the durable shared `ScoreAttachment` parser while preserving the original filename verbatim.

This is defense in depth at the renderer IPC boundary. It does not expand renderer authority over native storage.

## RED → repair evidence

- `0067f8de5766adeccbe62466b56d496257b9b700`: RED using an oversized sparse-array Proxy whose byte access traps. The pre-repair implementation allocates from the untrusted length and then touches an element instead of rejecting at resource admission.
- `698d0dc253c005d5baab0b5c68a10701ed449fc0`: causal repair applying the 25 MiB renderer cap before array allocation/read and to typed byte containers.
- `cf034b69cef18411e9c354bcf127a47eddd76677`: regression coverage for oversized `Uint8Array` and `ArrayBuffer` responses.
- `a97bae9efdf1fcfd72dbfa60a66366e433356502`: replaces large typed test allocations with lightweight Proxy fixtures while preserving oversized-container semantics.
- `7c53c5414ef79f403ea051c3256b38eca4f034c0`: RED proving attachment `fileSizeBytes` accepted impossible numeric values under the previous `typeof number` check.
- `bf97eda4f4cf599afb8aee96aa9d5b54ba01d3d9`: repair requiring positive safe-integer attachment size metadata bounded by the same 25 MiB contract.
- `333008b92b7db9844fe677e6b1d79a4172655599`: RED proving the renderer accepted empty, non-canonical, and uppercase score identities plus an empty filename as successful attachment metadata.
- `335aba67edf6cd50f11cec172449f059c11a5e4e`: causal repair requiring the native score-id syntax and an initially non-empty filename before attachment metadata is returned.
- `3b4bbe2607988e79f91000bdd742fe15b3373ce6`: RED replacing the old empty-array-success expectation with fail-closed regressions for empty `number[]`, `Uint8Array`, and `ArrayBuffer` bridge responses. The predecessor implementation accepted all three.
- `e454d52e75e6890781ed111337c99e038edaad2e`: minimal repair rejecting zero-byte containers before they can be returned to the Score/PDF renderer, without duplicating `%PDF-` magic validation in TypeScript.
- `82e71a69f4da4bd540d0dd27417944744ef304fc`: RED proving the first metadata repair still admitted a whitespace-only bridge filename that the shared durable attachment parser rejects.
- `ebee7c1bbea5e91403d4608729c0ad4e06ba7d1e`: minimal repair aligning renderer admission with the shared non-blank filename invariant via `trim().length > 0`, without normalizing the filename or importing filesystem policy.

These commits establish source/test evidence only. The PR is stacked on the formatter prerequisite rather than a protected target, so current hosted PR workflow generation is not treated as GREEN. Fresh protected-target verification remains required after normal prerequisite integration and ordinary/non-force reconciliation.

## Security Notes

### Trust boundary

Tauri IPC return values are untrusted at the renderer boundary even when the normal native producer is expected to satisfy stronger invariants. The security objective here is bounded renderer memory admission and syntactically/semantically consistent bridge postconditions, not protection against arbitrary code execution in a fully compromised desktop process.

Native attachment admission reads the full `PDF_MAGIC` header before accepting a selected score, so an empty file is never valid score content. The current #1176-base `read_score_pdf` nevertheless uses `std::fs::read` after path validation, which means post-attachment storage truncation can produce an empty successful bridge value. The renderer now rejects that value, while #865 remains the canonical native owner for descriptor-bounded read-time size/magic validation and its own race handling. Tauri documents commands as an IPC abstraction that serializes command arguments and return data across the WebView/core boundary, and its frontend testing guidance explicitly supports mocked IPC results. Those mechanics make runtime response validation appropriate at the consumer boundary without importing native filesystem authority.

### CWE mapping

MITRE CWE-770, *Allocation of Resources Without Limits or Throttling*, describes resource allocation without intended size/count restrictions and recommends explicit limits plus input validation. The pre-repair array path allocated a destination buffer from an untrusted response length before enforcing a resource ceiling; the selected repair moves that bound ahead of allocation and applies it consistently to all accepted byte-container forms.

MITRE CWE-1286, *Improper Validation of Syntactic Correctness of Input*, covers data expected to conform to a defined syntax but admitted without checking that syntax. The attachment identity repair uses an accept-known-good pattern for the native score-id format instead of treating every JavaScript string as a valid durable/native identity. The whitespace-only filename repair is the semantic companion to that check: it prevents the bridge from admitting a presentation value that the shared durable parser already defines as blank. CWE-1286 is used here rather than the more abstract CWE-20 because the concrete identifier defect is syntactic admission of a defined contract; the filename condition is documented primarily as cross-layer contract consistency rather than a separate vulnerability claim.

References:

- MITRE. (2026). *CWE-770: Allocation of Resources Without Limits or Throttling* (CWE 4.20). https://cwe.mitre.org/data/definitions/770.html
- MITRE. (2026). *CWE-1286: Improper Validation of Syntactic Correctness of Input* (CWE 4.20). https://cwe.mitre.org/data/definitions/1286.html
- Tauri. (2026). *Inter-process communication*. https://v2.tauri.app/concept/inter-process-communication/
- Tauri. (2026). *Mock Tauri APIs*. https://v2.tauri.app/develop/tests/mocking/

### Residual risk

The 25 MiB value and score-id syntax intentionally mirror native owner contracts rather than importing one shared runtime implementation across the Rust/TypeScript boundary. Either can drift if the native admission policy changes. The filename invariant is shared-schema-owned and now mirrored exactly as a non-blank predicate; if that durable contract changes, renderer admission must be reviewed in the same change. Such changes must keep the renderer no more permissive than the downstream contract it feeds. The renderer deliberately does not reproduce native file/path or PDF-magic validation; those semantics remain native authority.

Rejecting only zero bytes is not a substitute for #865's native read-time validation: nonempty corrupted/truncated content can still be invalid PDF data. Hosted memory/GC and packaged buyer-path measurements remain separate performance evidence; these source repairs do not claim a measured latency or memory improvement. A fully compromised desktop process can bypass renderer checks and is outside this boundary's claim.

## Follow-up

1. After #1176 reaches protected ancestry, reconcile this owner ordinary/non-force onto current `develop`.
2. Keep #865 as the native read-time allocation/content-validation owner; once it reaches protected truth, reconcile this consumer lane without copying its Rust implementation.
3. Run the focused bridge regressions and normal desktop/repository/security gates on one unchanged exact head.
4. Verify the packaged Score/PDF path with representative rights-cleared PDFs near the admission limit and record renderer heap/GC behavior without weakening the 25 MiB ceiling.
5. Keep byte/metadata admission here separate from Score Storage filesystem/recovery ownership and from ScoreViewer/PDF rendering-performance owners.
6. Do not close weaker preservation PRs until a protected successor has verifiably absorbed their still-valid semantic/test evidence.

# Score bridge resource-admission boundary

Status: Proposed

## Problem

BandScope accepts score-PDF bytes and attachment metadata from the Tauri IPC bridge before the renderer hands those bytes to buyer-visible Score/PDF UI. The native Score Storage boundary already caps admitted PDFs at 25 MiB, but the renderer previously trusted the returned container size.

For `number[]` responses, the renderer allocated `new Uint8Array(response.length)` before applying byte-domain validation. A malformed or compromised bridge response could therefore request a second oversized renderer allocation before any byte was inspected. `Uint8Array` and `ArrayBuffer` responses likewise crossed the renderer boundary without an independent size check.

The attach path had a related metadata-integrity gap: `fileSizeBytes` was accepted whenever its JavaScript type was `number`. `NaN`, infinity, negative/fractional values, zero, or a value above the native 25 MiB admission ceiling could therefore become renderer-visible attachment metadata even though none can describe a successfully admitted stored score.

The normal native path is expected to honor its own validation. This repair treats the IPC response as a trust boundary anyway, so renderer resource admission remains fail-closed when the bridge, a test/dev shim, or future serialization code returns impossible data.

## Constraints

- Native Score Storage remains the owner of picker/path authority, PDF magic validation, filesystem publication, symlink handling, content receipts, durability, recovery, and destructive mutation.
- Renderer validation must not create a second filesystem or PDF-validity implementation.
- The renderer must reject oversized byte containers before creating a second buffer or iterating attacker-shaped array elements.
- All accepted byte-container forms must obey the same renderer ceiling.
- Attachment-size metadata must describe a possible successfully admitted score: a positive safe integer no greater than the renderer/native 25 MiB ceiling.
- Invalid IPC data is not reflected into logs or error text; callers receive the stable `Invalid score bridge response` boundary.
- A future native size-limit change requires an explicit contract update and fresh tests rather than silently widening one side of the boundary.

## Alternatives considered

### Trust the native command exclusively

Rejected. Native validation protects the expected command implementation, but the renderer still consumes IPC data from an external boundary. Test/dev shims, serialization changes, or a compromised bridge can violate the native postcondition. The renderer should not allocate an unbounded second buffer merely because the producer is expected to be correct.

### Validate bytes after allocating the destination buffer

Rejected. This detects malformed byte values but does not bound the allocation that occurs before validation. Resource admission must precede allocation and element access.

### Accept typed arrays and `ArrayBuffer` without a renderer cap

Rejected. Their byte domain is already valid, but their size is still a resource-admission input and can feed the PDF path directly.

### Duplicate native PDF and filesystem validation in TypeScript

Rejected. That would violate the Score Storage ownership boundary and create divergent security implementations. The renderer owns only the IPC container/metadata admission needed before local allocation and downstream parsing.

## Decision

The renderer defines `MAX_SCORE_PDF_BRIDGE_BYTES = 25 * 1024 * 1024`, matching the native Score Storage maximum.

`readScorePdf` now:

- rejects `Uint8Array.byteLength` above the ceiling before returning the object;
- rejects `ArrayBuffer.byteLength` above the ceiling before constructing a `Uint8Array` view;
- rejects `number[]` length above the ceiling before destination allocation or element access;
- performs the existing one-pass byte validation/copy for bounded arrays, admitting only integer values from 0 through 255.

`attachScorePdf` now accepts `fileSizeBytes` only when it is a positive safe integer at or below the same ceiling.

This is defense in depth at the renderer IPC boundary. It does not expand renderer authority over native storage.

## RED → repair evidence

- `0067f8de5766adeccbe62466b56d496257b9b700`: RED using an oversized sparse-array Proxy whose byte access traps. The pre-repair implementation allocates from the untrusted length and then touches an element instead of rejecting at resource admission.
- `698d0dc253c005d5baab0b5c68a10701ed449fc0`: causal repair applying the 25 MiB renderer cap before array allocation/read and to typed byte containers.
- `cf034b69cef18411e9c354bcf127a47eddd76677`: regression coverage for oversized `Uint8Array` and `ArrayBuffer` responses.
- `a97bae9efdf1fcfd72dbfa60a66366e433356502`: replaces large typed test allocations with lightweight Proxy fixtures while preserving oversized-container semantics.
- `7c53c5414ef79f403ea051c3256b38eca4f034c0`: RED proving attachment `fileSizeBytes` accepted impossible numeric values under the previous `typeof number` check.
- `bf97eda4f4cf599afb8aee96aa9d5b54ba01d3d9`: repair requiring positive safe-integer attachment size metadata bounded by the same 25 MiB contract.

These commits establish source/test evidence only. The PR is stacked on the formatter prerequisite rather than a protected target, so current hosted PR workflow generation is not treated as GREEN. Fresh protected-target verification remains required after normal prerequisite integration and ordinary/non-force reconciliation.

## Security Notes

### Trust boundary

Tauri IPC return values are untrusted at the renderer boundary even when the normal native producer is expected to satisfy stronger invariants. The security objective here is bounded renderer memory admission and internally consistent attachment metadata, not protection against arbitrary code execution in a fully compromised desktop process.

### CWE mapping

MITRE CWE-770, *Allocation of Resources Without Limits or Throttling*, describes resource allocation without intended size/count restrictions and recommends explicit limits plus input validation. The pre-repair array path allocated a destination buffer from an untrusted response length before enforcing a resource ceiling; the selected repair moves that bound ahead of allocation and applies it consistently to all accepted byte-container forms.

Reference: MITRE. (2026). *CWE-770: Allocation of Resources Without Limits or Throttling* (CWE 4.20). https://cwe.mitre.org/data/definitions/770.html

### Residual risk

The 25 MiB value intentionally mirrors a native owner constant rather than importing a shared runtime constant across the Rust/TypeScript boundary. This can drift if the native admission policy changes. Such a change must update both contracts deliberately and keep the renderer no more permissive than the native owner. Hosted memory/GC and packaged buyer-path measurements remain separate performance evidence; this source repair does not claim a measured latency or memory improvement.

## Follow-up

1. After #1176 reaches protected ancestry, reconcile this owner ordinary/non-force onto current `develop`.
2. Run the focused bridge regressions and normal desktop/repository/security gates on one unchanged exact head.
3. Verify the packaged Score/PDF path with representative rights-cleared PDFs near the admission limit and record renderer heap/GC behavior without weakening the 25 MiB ceiling.
4. Keep byte-resource admission here separate from Score Storage filesystem/recovery ownership and from ScoreViewer/PDF rendering-performance owners.
5. Do not close weaker preservation PRs until a protected successor has verifiably absorbed their still-valid semantic/test evidence.

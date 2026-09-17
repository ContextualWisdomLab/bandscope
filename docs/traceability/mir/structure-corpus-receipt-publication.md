# Structure corpus receipt publication

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228  
Parent: `docs/traceability/mir/structure-corpus-admission.md`

## Problem

Corpus admission produces a durable JSON receipt that binds the preregistration, runtime identity, registered audio/annotation content and the exact admitted mono-float32 PCM. Before this change, the CLI published that evidence with `Path.write_text(...)` directly to the caller-supplied `--output` path.

That write path had two independent failure modes. An interruption or write failure after opening an existing receipt could truncate the last complete evidence document. A caller-supplied output path that was a symbolic link could also redirect the write into the symlink target. Both behaviors conflict with BandScope's storage-boundary rule that local paths are untrusted and with the scientific requirement that a receipt be either the previous complete document or the new complete document, never a partially replaced evidence artifact.

## Decision

Receipt publication now serializes the complete canonical JSON payload in memory, creates a restrictive process-owned temporary file in the destination directory with `mkstemp`, writes the whole payload, flushes it, calls `fsync` on that file, closes it, and only then uses `os.replace` to publish it at the requested path.

Using a temporary file in the same directory keeps the final rename on the same filesystem and gives the operation replacement semantics instead of in-place truncation. Replacing a destination symlink replaces the directory entry itself rather than following the link and writing through to its target. If writing, flushing, syncing, or replacing fails, the temporary file is removed and any previously complete destination remains untouched.

This is an atomic-publication boundary, not a claim that every supported filesystem persists directory metadata across sudden power loss. The file contents are synced before replacement, but directory-fsync semantics are platform-specific and are not represented as stronger durability evidence here. Project-level crash/power-loss durability remains owned by Project Persistence rather than this research receipt helper.

## RED → GREEN lineage

- RED `394e161b601e61eab11acd319b6196499e251f24`: a failed final replacement must preserve the existing complete receipt, remove the abandoned temporary file, and an output symlink must not allow receipt bytes to overwrite its target.
- GREEN `7941fd6e1d0f40e3fa8d119e1a9c37b6c4a54811`: `_write_receipt_atomic` writes and syncs a same-directory temporary file, then publishes with `os.replace`; `main()` no longer writes directly through `Path.write_text`.

## Security Notes

- **Untrusted input:** `--output` is caller-controlled filesystem input. The implementation does not dereference a destination symlink for the final write.
- **Trust boundary:** receipt bytes cross from the scientific admission process into the local storage boundary only after complete serialization and file sync.
- **Scope restriction:** the helper writes exactly one explicitly requested receipt path and one same-directory temporary file. It does not add directory scanning or a generic filesystem API.
- **Safe failure:** pre-publication failures leave the previous destination intact and clean up the temporary file. No retry loop or alternate output location widens the write scope.
- **Privacy:** durable receipt contents remain path-free; this change does not add workstation paths, usernames, raw audio or annotation content to the receipt.
- **Test points:** simulated `os.replace` failure preserves the existing receipt; a symlinked output is replaced without modifying its target; normal publication remains valid JSON.

## Constraints and rejected alternatives

Writing directly to a temporary file in the system-wide temp directory and then moving it was rejected because cross-filesystem moves can lose atomic replacement semantics. Writing directly to the target and relying on JSON parsing to detect truncation was rejected because detection does not preserve the last complete scientific receipt. Refusing every pre-existing symlink before publication was not used as the sole defense because a path check followed by a later write would reintroduce a check/use race; final `os.replace` semantics remove the write-through capability instead.

## Remaining scientific boundary

A crash-safe admission receipt is necessary provenance, not MIR acceptance. #1225 still requires a reviewed rights-cleared real-music corpus and independent annotations, pre-data margins/aggregation/paired uncertainty/dependence/claim boundaries, a recognized MIREX/mir_eval runner that consumes the admitted immutable PCM/annotation handoff, and a paired CQT/STFT execution on the same admitted inputs and runtime identity.

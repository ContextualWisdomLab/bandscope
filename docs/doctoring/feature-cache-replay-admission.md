# Persisted feature-cache replay admission

## Problem and authority boundary

BandScope persists separated stem arrays so a local rehearsal project can resume without repeating expensive separation work. That cache is app-owned persistence, not trusted in-memory state. Crash recovery, restore, local tampering, partial publication, or version drift can change metadata and array bytes independently of the original separator execution.

Resource Admission & Decode therefore owns replay admission. Signal/MIR consumes only the admitted result; it does not accept new stem identities or role semantics from persisted cache metadata.

The production separator contract currently exposes four stem identities: `vocals`, `bass`, `drums`, and `other`. Their canonical rehearsal role binding is `vocals -> vocal` and `bass|drums|other -> instrument`. Persisted metadata may omit `stemRoleTypes` for legacy compatibility, in which case the canonical mapping is reconstructed. The metadata sidecar itself is still required at replay because `api.py` has already admitted its schema, sample rate, stem set, and separation metadata; disappearance before archive admission is a concurrent persistence change, not a legacy-cache representation. When `stemRoleTypes` is present, a contradictory binding is a cache miss rather than rehearsal evidence.

## Decision

The replay boundary applies these checks before an archived stem can return to MIR:

- `stemKeys` is a unique, non-empty subset of the canonical separator identities.
- The NPZ central directory contains exactly one deflated NPY member for every admitted stem and no hidden or duplicate member.
- NPY v1 headers, one-dimensional floating shape, declared sample count, visible bytes, sample rate, canonical owned `float32` conversion, and finiteness stay within the live `AudioResourcePolicy`.
- The sibling persisted metadata sidecar must remain readable at archive admission. Missing, malformed, or non-object replacement is a cache miss; only absence of the `stemRoleTypes` field inside an otherwise admitted legacy sidecar remains compatible.
- Persisted role metadata, when present, preserves the canonical identity-to-role binding. A valid `bass` signal cannot be relabelled `vocal` by cache metadata.
- Legacy metadata without `stemRoleTypes` remains readable by reconstructing the canonical mapping; malformed JSON, non-object metadata, non-map role metadata, invented stem identities, contradictory roles, and sidecar disappearance fail closed.

The role check is deliberately an admission rule, not ontology expansion. BandScope's rehearsal semantics remain authoritative in BandScope; the cache does not mint a new domain vocabulary.

## RED and repair evidence

Regression `test_feature_cache_rejects_role_type_that_contradicts_canonical_stem_semantics` writes a real compressed NumPy `float32` bass stem. The same persisted array must be rejected with `{"bass":"vocal"}` and accepted with `{"bass":"instrument"}`. Companion coverage exercises malformed JSON, non-object metadata, omitted role metadata, non-map role metadata, and canonical binding.

The initial semantic RED commit is `fd8ad6f51ebdbd39b6d736d4f105ef65621919d1`. Production role admission begins at `4d6441c898e358eda51898cf92f6640726710ebd`; subsequent ordinary descendants repair source-owned formatter findings without importing the independently owned protected-base Ruff change from PR #1176. Hosted failure for that RED commit is not claimed because its run was cancelled after the ordinary production descendant.

A later concurrency-focused review found that the role helper treated a now-missing sidecar as legacy-compatible even though the production caller had necessarily parsed that sidecar moments earlier. RED `2eb807307bc76da007e4e6165d500fcfa3795bdd` changes the regression to require a missing sidecar to fail closed. Production `c7e8dfa96303ed46be2a07577b45cc50f4509233` removes the existence-as-legacy shortcut: the archive-admission read itself must succeed, while an existing legacy sidecar may still omit `stemRoleTypes`. This narrows the replacement race without claiming a transaction that does not yet exist.

## Residual risk and follow-up

The current repair still reads the sibling metadata sidecar twice overall: once in `api.py` for the authoritative cache payload and again in the archive-admission helper for role semantics. Missing, malformed, and contradictory second snapshots now fail closed, but two independently opened pathnames are not a race-free metadata/archive transaction. A privileged local actor can still replace one valid generation with another valid generation between reads. The next persistence hardening step remains one authoritative metadata snapshot bound to the already-open archive generation, or an equivalent immutable generation/digest contract, with a deterministic replacement-race regression before any crash/race-safe claim.

This boundary also does not prove a whole-process RSS, CPU, decompression-time, or accelerator budget. NumPy/ZIP internals, decoder/resampler intermediates, PyTorch model memory, GPU/VRAM, and downstream MIR temporaries remain separate resource-acceptance work. Production scientific acceptance still requires rights-cleared decoded rehearsal audio and reproducible MIR evidence; synthetic arrays are used only as focused unit regressions for this persistence invariant.

## Traceability

- CWE-345 (Insufficient Verification of Data Authenticity) supports treating restored or mutable persisted evidence as untrusted until its expected semantics are re-established. BandScope does not claim cryptographic authenticity from this check; immutable project publication identity is a separate control.
- CWE-367 (Time-of-check Time-of-use Race Condition) maps to the remaining two-open metadata/archive generation race. The missing-sidecar repair closes one permissive outcome but does not claim the broader race resolved.
- CWE-770 (Allocation of Resources Without Limits or Throttling) maps to the bounded archive/member/sample/byte admission applied before NumPy materialization.
- NumPy's NPY/NPZ format and `ndarray` dtype/shape semantics define the representation inspected at this persistence boundary. BandScope additionally imposes its own canonical stem vocabulary and rehearsal-role invariant.

## References

MITRE Corporation. (2026). *CWE-345: Insufficient verification of data authenticity.* Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/345.html

MITRE Corporation. (2026). *CWE-367: Time-of-check time-of-use (TOCTOU) race condition.* Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/367.html

MITRE Corporation. (2026). *CWE-770: Allocation of resources without limits or throttling.* Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/770.html

NumPy Developers. (2026). *NumPy binary format (`.npy`) and `numpy.savez_compressed` documentation.* https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html ; https://numpy.org/doc/stable/reference/generated/numpy.savez_compressed.html

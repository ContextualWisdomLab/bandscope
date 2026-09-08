# Persisted feature-cache replay admission

## Problem and authority boundary

BandScope persists separated stem arrays so a local rehearsal project can resume without repeating expensive separation work. That cache is app-owned persistence, not trusted in-memory state. Crash recovery, restore, local tampering, partial publication, or version drift can change metadata and array bytes independently of the original separator execution.

Resource Admission & Decode therefore owns replay admission. Signal/MIR consumes only the admitted result; it does not accept new stem identities or role semantics from persisted cache metadata.

The production separator contract currently exposes four stem identities: `vocals`, `bass`, `drums`, and `other`. Their canonical rehearsal role binding is `vocals -> vocal` and `bass|drums|other -> instrument`. Persisted metadata may omit `stemRoleTypes` for legacy compatibility, in which case the canonical mapping is reconstructed. When the field is present, a contradictory binding is a cache miss rather than rehearsal evidence.

## Decision

The replay boundary applies these checks before an archived stem can return to MIR:

- `stemKeys` is a unique, non-empty subset of the canonical separator identities.
- The NPZ central directory contains exactly one deflated NPY member for every admitted stem and no hidden or duplicate member.
- NPY v1 headers, one-dimensional floating shape, declared sample count, visible bytes, sample rate, canonical owned `float32` conversion, and finiteness stay within the live `AudioResourcePolicy`.
- Persisted role metadata, when present, preserves the canonical identity-to-role binding. A valid `bass` signal cannot be relabelled `vocal` by cache metadata.
- Legacy metadata without `stemRoleTypes` remains readable by reconstructing the canonical mapping; malformed JSON, non-object metadata, non-map role metadata, invented stem identities, and contradictory roles fail closed.

The role check is deliberately an admission rule, not ontology expansion. BandScope's rehearsal semantics remain authoritative in BandScope; the cache does not mint a new domain vocabulary.

## RED and repair evidence

Regression `test_feature_cache_rejects_role_type_that_contradicts_canonical_stem_semantics` writes a real compressed NumPy `float32` bass stem. The same persisted array must be rejected with `{"bass":"vocal"}` and accepted with `{"bass":"instrument"}`. Companion coverage exercises absent legacy sidecars, malformed JSON, non-object metadata, omitted role metadata, and non-map role metadata.

The initial RED commit is `fd8ad6f51ebdbd39b6d736d4f105ef65621919d1`. Production role admission begins at `4d6441c898e358eda51898cf92f6640726710ebd`; subsequent ordinary descendants repair source-owned formatter findings without importing the independently owned protected-base Ruff change from PR #1176. Hosted failure for the RED commit is not claimed because its run was cancelled after the ordinary production descendant.

## Residual risk and follow-up

The current repair re-reads the sibling metadata sidecar from the archive-admission helper after `api.py` has already parsed that file. This fails closed if the second read is malformed or contradictory, but it is not a race-free metadata/archive transaction: a privileged local actor could replace the sidecar between the two reads. The next persistence hardening step is one authoritative metadata snapshot bound to archive admission, or an equivalent immutable cache-generation contract, with a deterministic replacement-race regression before any crash/race-safe claim.

This boundary also does not prove a whole-process RSS, CPU, decompression-time, or accelerator budget. NumPy/ZIP internals, decoder/resampler intermediates, PyTorch model memory, GPU/VRAM, and downstream MIR temporaries remain separate resource-acceptance work. Production scientific acceptance still requires rights-cleared decoded rehearsal audio and reproducible MIR evidence; synthetic arrays are used only as focused unit regressions for this persistence invariant.

## Traceability

- CWE-345 (Insufficient Verification of Data Authenticity) supports treating restored or mutable persisted evidence as untrusted until its expected semantics are re-established. BandScope does not claim cryptographic authenticity from this check; immutable project publication identity is a separate control.
- CWE-770 (Allocation of Resources Without Limits or Throttling) maps to the bounded archive/member/sample/byte admission applied before NumPy materialization.
- NumPy's NPY/NPZ format and `ndarray` dtype/shape semantics define the representation inspected at this persistence boundary. BandScope additionally imposes its own canonical stem vocabulary and rehearsal-role invariant.

## References

MITRE Corporation. (2026). *CWE-345: Insufficient verification of data authenticity.* Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/345.html

MITRE Corporation. (2026). *CWE-770: Allocation of resources without limits or throttling.* Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/770.html

NumPy Developers. (2026). *NumPy binary format (`.npy`) and `numpy.savez_compressed` documentation.* https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html ; https://numpy.org/doc/stable/reference/generated/numpy.savez_compressed.html

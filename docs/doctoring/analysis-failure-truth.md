# Analysis failure truth — canonical #770/#828 follow-up

## Behavioral contract

A local-audio job must not report success, build demo cues or publish a new
feature/result cache after separation, process startup, worker timeout, invalid
features or top-level pipeline failure. Explicit demo requests remain separate.
The local pipeline rejects empty mixes and absent sections rather than falling
back to an arrangement. Fixed error messages omit exception paths and payloads.

Consumer eligibility runs after the existing feature/result cache readers.
Historical demo-shaped results are recomputed; unusable cached features are
recomputed or produce a structured failure. Real and signed/unsigned integer
arrays remain usable; Boolean, object, complex, empty, nonfinite and malformed
siblings are rejected. This is consumer usability, not source authenticity.

## Ownership and compatibility

This follow-up preserves the original cache-owner schema, keys, reader/writer,
manifest and publication definitions. It does not copy mutable #866 or #970
source. #866 retains resource/process/archive admission. #970 retains source/MIR
reuse identity and durable cache publication. A separate #970 compatibility
candidate combines this failure policy with its current owner implementation;
it is not protected ancestry or a dependency of this commit.

## Local evidence and limits

The source was first reproduced at #828 b02ac12f890069d8e7aefe1a8bf801122b87d54d:
16 causal witnesses produced 12 failures and 4 passes. The terminal-only repair
and unsigned compatibility follow-up pass 163 selected API/failure/CLI tests;
one uninjected real-model local CLI success test is explicitly not run.
Independent static review binds the repaired source, not a hosted approval.
The publication worktree must re-run relevant checks after ordinary protected
ancestry reconciliation; scratch evidence does not substitute for that run.

Harmless macOS spawn tests check worker exit and queue cleanup. Synthetic
separator/pitch/chord seams are not actual audio/model/GPU quality or Windows
execution. Full coverage, platform builds, audits, SBOM and qualifying remote
review remain separate required gates. Internal segmentation/role heuristics
are not eliminated and a completed pipeline is not a correctness guarantee.

## Security Notes

- Untrusted inputs: media descriptors, native responses, JSON/NPZ cache data.
- Trust boundaries: process results and existing app-owned storage readers;
  validation is added at the consumer, not by widening file/exec/network access.
- Validation: range-first duration checks, finite nonempty numeric arrays,
  every stem sibling, local result eligibility and fixed error envelopes.
- Safe failure: no fabricated result or new cache writes on tested failures;
  legitimate pipeline cache-hit and explicit demo controls remain available.
- Privacy: no original audio/model bytes or raw exception paths are logged.
- Remaining risk: the inherited legacy NPZ reader can raise TypeError for a
  standalone NPY payload; the observation test documents this unresolved path.
  Shape/fingerprint eligibility is not a signature, full shared-schema check,
  source/MIR identity, malicious archive admission or model-rights evidence.
- Test points: first failure/retry, historical demo cache, invalid non-first
  stems, unsigned fresh/cache reuse, known cache-reader errors, no-section
  pipeline, I/O error handling and process construction/start/timeout cleanup.

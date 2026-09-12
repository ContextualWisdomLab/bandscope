# Source-separation model-output shape admission

Date: 2026-09-09
Owner: Resource Admission & Decode / #781 / PR #866

## Problem

The source-separation boundary already rejected empty, non-finite, non-numeric, and float32-overflowed model output, but `_as_float_array` used `np.ravel(...)`. A model/backend regression that returned an extra dimension could therefore be flattened into a one-dimensional stem and then trimmed/padded by `_fit_length`, turning malformed model output into rehearsal evidence instead of failing closed.

This matters separately from decoder admission. The canonical decoder is required to produce mono float32 PCM before MIR, while Demucs output crosses another untrusted scientific boundary after model execution. Shape must remain explicit at that boundary as well.

## Constraints and alternatives

The fix must not change the four-stem contract, invent a new source-separation owner, add a dependency, broaden filesystem/network/model authority, or silently reinterpret multi-channel/model-batch output.

Two alternatives were rejected:

- Flattening and relying on `_fit_length`: preserves the defect because dimensional meaning is discarded before validation.
- Automatically downmixing any multidimensional model output: would make an undocumented scientific decision and could conceal an upstream model/backend contract change.

## Decision

Require model/decoder values entering `_as_float_array` to become a NumPy float32 array with exactly one dimension. Empty, multidimensional, non-finite, non-numeric, or float32-overflowed values retain the existing payload-free `Stem separation produced invalid audio.` failure.

RED `2cb1e6485d68eaf360cf27432678ae7628ef489c` adds a two-channel-shaped regression that the predecessor flattened successfully. Production `2d256a68d7217098e070faa1d05aef9250a91123` removes the flattening operation and rejects `ndim != 1` before the output can reach `_fit_length` or downstream rehearsal analysis. The commits are consecutive ordinary descendants, so no hosted RED failure is claimed.

## Risk and effect

The intended Demucs path already performs its explicit channel mean before converting each source to NumPy, so valid current output remains one-dimensional. If a future model/backend changes that contract, BandScope now fails closed instead of silently changing the signal semantics. This fix does not bound total model RSS/VRAM, validate commercially admissible model rights, or establish real-audio separation accuracy.

## Follow-up acceptance

Exact-head Python/quickcheck/security checks must verify the repaired tree. Commercial scientific acceptance still requires rights-cleared real audio and recognized separation/MIR metrics, plus measured CPU/RSS/GPU/VRAM behavior. Windows descendant containment and the existing model distribution/rights owners remain separate prerequisites.

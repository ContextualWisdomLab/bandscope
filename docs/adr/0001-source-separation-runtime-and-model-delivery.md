# ADR-0001: Source Separation Runtime and Model Delivery

Status: Proposed on active branch (implementation complete; release blockers remain)
Date: 2026-08-09

## Context and drivers

The retired band-splitting profile was an FFT-era approximation and did not perform real source
separation. BandScope now uses Demucs 4.0.1 `htdemucs` to return vocals, bass, drums, and other for
local rehearsal analysis. The production boundary must remain local-first after model provisioning,
bounded on CPU, platform-honest, and traceable to an exact model artifact.

The former Demucs loader could download weights on first use and verified only the eight-hex hash
prefix embedded in `955717e8-8726e21a.th`. The exact artifact is 84,141,911 bytes with SHA-256
`8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4`. The Demucs code is MIT
licensed, but no separate commercial redistribution grant for the official weights was identified;
the upstream licensing discussion characterizes the weights as scientific-use material.

## Decision

1. `htdemucs` is the only production four-source model name until a superseding ADR.
2. The old `bandsplit-v1-profile` asset and inventory record are retired and must not reappear.
3. The exact official source URL, signature, full SHA-256, byte size, license uncertainty, cache
   location, and release usage remain in `supply-chain/supplemental-component-inventory.json`.
4. Trusted external provisioning is not equivalent to bundling. Documentation and SBOM evidence
   must preserve that distinction.
5. A release claiming source-separation readiness must verify the full SHA-256 before any torch
   deserialization, use PyTorch's `weights_only=True` restricted loader with the reviewed minimal
   global allowlist, and have a recorded legal decision for its chosen download or distribution
   path. Model construction is strict, and concurrent lazy loads are serialized.
6. Runtime model retrieval is forbidden. A trusted external provisioning step must populate the
   expected user-scoped cache or supply the exact absolute inventoried file through
   `BANDSCOPE_HTDEMUCS_MODEL_PATH`; missing, wrongly named, non-regular, symlinked, incorrectly
   sized, or full-SHA-mismatched weights fail before deserialization. Source separation remains
   unavailable on macOS Intel under the current dependency markers.

## Alternatives considered

- Keep the FFT profile: rejected because it produces structurally plausible but invalid stems.
- Bundle official htdemucs weights immediately: rejected because repository/release size and model
  redistribution rights are unresolved.
- Rely on Demucs' eight-hex prefix only: rejected because it is weaker than the repository's
  full-integrity policy and still permits deserialization before BandScope verifies exact identity.
- Replace with ONNX or another commercially licensed model: viable future work, but it requires
  parity, quality, platform, performance, and licensing evidence.

## Consequences

BandScope obtains real separation quality but inherits torch/Demucs resource cost, platform gaps,
an explicit provisioning requirement, and an upstream model-rights decision. The runtime is fully
offline and fails closed when the cache is absent; that does not authorize redistribution or make
the model bundled. The supplemental inventory check fails if the runtime model is missing,
incompletely pinned, or replaced by the retired profile.

## Security and governance implications

Model bytes are untrusted until verified. Full-hash verification must precede pickle/torch checkpoint
deserialization; a post-load hash is insufficient. The approved checkpoint still contains pickle
metadata: `weights_only=True` and the exact reviewed Demucs/NumPy/Fraction allowlist reduce but do
not turn it into a non-executable format. Therefore an artifact hash, allowlist, torch, NumPy, or
Demucs compatibility change is reviewed like executable code, never receives a `weights_only=False`
fallback, and must pass the real-artifact load smoke test. The one rule-specific Semgrep/Bandit
suppression is permitted only at this full-hash, same-byte, restricted-loader call. The approved
artifact serializes NumPy's legacy `numpy.core.multiarray.scalar` name; the locked runtime resolves
the identical callable from NumPy 2.x's private `_core` compatibility path while retaining only the
legacy serialized alias, so every NumPy lock change must repeat the exact-artifact smoke test.
Repository gates reject an unrestricted loader, an expanded allowlist, or another `torch.load` site.
Cache paths must
be user-scoped, non-symlinked, bounded, and cleaned or quarantined on mismatch. No user-supplied
checkpoint is accepted. Model downloads and errors must not expose tokens, usernames, or full paths.

## Acceptance, recovery, and rollback

- Inventory/model-name consistency check passes.
- A corrupt or substituted model fails before deserialization.
- Supported platform tests prove canonical finite stems and known-stem quality.
- Unsupported platforms return a stable fallback error.
- Rollback disables source separation or restores the previous exact approved model artifact; it
  never restores the FFT profile as a production separator.

## Supersession triggers

Supersede this ADR when BandScope adopts a differently licensed model, bundles weights, converts the
approved checkpoint to a non-pickle format such as safetensors, implements an ONNX/Rust inference
path, changes the four-source contract, or makes GPU execution part of the release baseline.

## References

- Défossez, A., Usunier, N., Bottou, L., & Bach, F. (2019). Music source separation in the
  waveform domain. *arXiv*. https://arxiv.org/abs/1911.13254
- Meta Research. (n.d.). *Demucs* [Source code]. GitHub.
  https://github.com/facebookresearch/demucs
- Rouard, S., Stoller, D., & Défossez, A. (2023). Hybrid transformers for music source
  separation. In *ICASSP 2023*. IEEE. https://arxiv.org/abs/2211.08553

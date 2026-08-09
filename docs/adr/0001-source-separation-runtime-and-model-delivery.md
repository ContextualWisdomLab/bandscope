# ADR-0001: Source Separation Runtime and Model Delivery

Status: Accepted with release blockers
Date: 2026-08-09

## Context and drivers

The retired band-splitting profile was an FFT-era approximation and did not perform real source
separation. BandScope now uses Demucs 4.0.1 `htdemucs` to return vocals, bass, drums, and other for
local rehearsal analysis. The production boundary must remain local-first after model provisioning,
bounded on CPU, platform-honest, and traceable to an exact model artifact.

The current Demucs loader downloads weights on first use and verifies only the eight-hex hash prefix
embedded in `955717e8-8726e21a.th`. The exact artifact is 84,141,911 bytes with SHA-256
`8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4`. The Demucs code is MIT
licensed, but no separate commercial redistribution grant for the official weights was identified;
the upstream licensing discussion characterizes the weights as scientific-use material.

## Decision

1. `htdemucs` is the only production four-source model name until a superseding ADR.
2. The old `bandsplit-v1-profile` asset and inventory record are retired and must not reappear.
3. The exact official source URL, signature, full SHA-256, byte size, license uncertainty, cache
   location, and release usage remain in `supply-chain/supplemental-component-inventory.json`.
4. Runtime retrieval is not equivalent to bundling. Documentation and SBOM evidence must preserve
   that distinction.
5. A release claiming source-separation readiness must verify the full SHA-256 before any torch
   deserialization and must have a recorded legal decision for its chosen download or distribution
   path.
6. Until those blockers are implemented, first-load network access is explicit, offline inference is
   guaranteed only with a trusted pre-provisioned cache, and source separation is unavailable on
   macOS Intel under the current dependency markers.

## Alternatives considered

- Keep the FFT profile: rejected because it produces structurally plausible but invalid stems.
- Bundle official htdemucs weights immediately: rejected because repository/release size and model
  redistribution rights are unresolved.
- Rely on Demucs' eight-hex prefix only: retained temporarily as current behavior, rejected as the
  release target because it is weaker than the repository's full-integrity policy.
- Replace with ONNX or another commercially licensed model: viable future work, but it requires
  parity, quality, platform, performance, and licensing evidence.

## Consequences

BandScope obtains real separation quality but inherits torch/Demucs resource cost, platform gaps,
runtime model retrieval, and an upstream model-rights decision. Release evidence cannot describe the
model as bundled or fully offline today. The supplemental inventory check now fails if the runtime
model is missing, incompletely pinned, or replaced by the retired profile.

## Security and governance implications

Model bytes are untrusted until verified. Full-hash verification must precede pickle/torch checkpoint
deserialization; a post-load hash is insufficient. Cache paths must be user-scoped, non-symlinked,
bounded, and cleaned or quarantined on mismatch. No user-supplied checkpoint is accepted. Model
downloads and errors must not expose tokens, usernames, or full paths.

## Acceptance, recovery, and rollback

- Inventory/model-name consistency check passes.
- A corrupt or substituted model fails before deserialization.
- Supported platform tests prove canonical finite stems and known-stem quality.
- Unsupported platforms return a stable fallback error.
- Rollback disables source separation or restores the previous exact approved model artifact; it
  never restores the FFT profile as a production separator.

## Supersession triggers

Supersede this ADR when BandScope adopts a differently licensed model, bundles weights, implements an
ONNX/Rust inference path, changes the four-source contract, or makes GPU execution part of the
release baseline.

## References

- Défossez, A., Usunier, N., Bottou, L., & Bach, F. (2019). Music source separation in the
  waveform domain. *arXiv*. https://arxiv.org/abs/1911.13254
- Meta Research. (n.d.). *Demucs* [Source code]. GitHub.
  https://github.com/facebookresearch/demucs
- Rouard, S., Stoller, D., & Défossez, A. (2023). Hybrid transformers for music source
  separation. In *ICASSP 2023*. IEEE. https://arxiv.org/abs/2211.08553

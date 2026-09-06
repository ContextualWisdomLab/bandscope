# Demucs local-model admission traceability

Status: Draft

## Problem

BandScope promises local-first rehearsal analysis and the repository security policy says ordinary local analysis must not acquire a network dependency. The production separator nevertheless called `demucs.pretrained.get_model("htdemucs")` without first proving that the canonical checkpoint already existed locally.

For the Demucs 4.x API currently consumed by BandScope, `get_model(..., repo=None)` constructs a `RemoteRepo`. `RemoteRepo.get_model` delegates to `torch.hub.load_state_dict_from_url`, so an absent checkpoint can turn the first stem-separation run into an implicit network download. The same production module previously described inference as network-free, so documentation and runtime behavior disagreed.

## Constraints

- BandScope must remain local-first during ordinary analysis.
- Runtime code must not silently download model artifacts.
- Model artifacts are supply-chain inputs: redistribution rights, provenance, full integrity evidence, package placement, SBOM/supplemental inventory coverage, signing and update/rollback behavior belong to Distribution rather than to MIR inference code.
- A missing local model must fail safely rather than fall back to the retired FFT mask or claim successful separation.
- Unit fixtures may mock a model boundary; release/scientific acceptance still requires rights-cleared real decoded audio and the actual released model artifact.

## RED evidence

Commit `716438d1c927bbdea38cb6a78b3a417994992e3d` adds `test_demucs_local_model_boundary.py`.

The regression replaces `demucs.pretrained.get_model` with a forbidden remote resolver and points torch at an empty hub directory. The predecessor enters `get_model` and therefore violates the contract. The same test also records the intended compatibility path: an exact cached `955717e8-8726e21a.th` checkpoint may enter the existing Demucs resolver.

No hosted RED failure receipt is claimed because the causal fix followed immediately on the same owner branch.

## Selected repair

Commit `61b629baaef0d6da15967fe272b9d9f109d18eaf` adds a narrow model-admission guard before Demucs resolution:

- only the production `htdemucs` model has a registered local checkpoint filename;
- the expected checkpoint must already exist under torch's local `checkpoints` cache;
- the checkpoint must be a regular file and not a symlink;
- unsupported model names and missing/non-regular checkpoint objects fail with the bounded message `Stem separation model weights are not installed locally.`;
- only after that evidence exists does BandScope enter the upstream Demucs resolver.

Commit `8ccdf2013582db16811168cfadd44d1560ed375d` keeps the older separation unit tests honest about their scope: those tests deliberately replace Demucs with an in-memory fake and therefore bypass only the local-checkpoint prerequisite. The dedicated model-admission regressions do not receive that bypass.

## Alternatives considered

### Keep the existing `get_model("htdemucs")` path

Rejected. An absent checkpoint can invoke `torch.hub.load_state_dict_from_url`; that contradicts the repository's local-first runtime rule and makes first-run behavior depend on external availability.

### Download the model explicitly from BandScope at first use

Rejected for ordinary analysis. This merely moves the hidden network dependency into BandScope and would require an explicit model-delivery product flow, source allowlist, full checksum/signature verification, license review, disclosure, cancellation/retry semantics and updater-style rollback.

### Bundle the checkpoint immediately in this Project Persistence PR

Rejected as a cross-context shortcut. Shipping a large model artifact changes licensing, package size, SBOM/supplemental inventory, signing, notarization, update and rollback evidence. Distribution must own that immutable artifact contract; Signal/MIR consumes only the released artifact.

### Fall back to heuristic FFT stem masks

Rejected. The prior heuristic is not a scientifically acceptable substitute for source separation and must not turn an unavailable model into false rehearsal confidence.

## Security Notes

### Attack surface

The model-loading boundary crosses the local Python process into third-party Demucs/torch model resolution and deserialization. The checkpoint path and bytes are security- and scientific-integrity-sensitive inputs.

### Trust boundary

Signal/MIR may consume a locally available model artifact, but it does not own remote download policy or release packaging. The upstream Demucs resolver is not itself evidence that BandScope has admitted a release artifact.

### Realistic threats

- a first stem-separation run initiates an unexpected network request because weights are absent;
- an unsupported model name expands the remote model surface;
- a symlink is presented at the expected checkpoint path;
- a missing model is silently replaced with weaker heuristic output;
- a locally present checkpoint is corrupt or malicious even though its filename is expected;
- the checkpoint is removed between BandScope's local preflight and the upstream resolver, allowing the upstream remote fallback to become reachable in that race window.

### Mitigations

- exact allowlist for the currently supported `htdemucs` cached checkpoint filename;
- regular-file and no-symlink preflight;
- bounded fail-closed error before entering Demucs when local evidence is absent;
- no heuristic-success fallback;
- dedicated regression proving the missing-checkpoint path never invokes the upstream resolver;
- release model bundling is kept as a separate Distribution prerequisite rather than being implemented as an ad-hoc download in MIR code.

### Remaining risk

The current repair is an immediate local-first guard, not the final release artifact boundary. It does not provide a repository-owned full SHA-256/signature for the Demucs weights, and the existing supplemental component inventory does not list a shipped htdemucs checkpoint. There is also a small preflight-to-upstream-resolver TOCTOU window: if the checkpoint disappears after the guard, upstream `get_model` can still attempt its remote path. Release readiness therefore requires a BandScope-owned immutable model artifact or a local-only loader that consumes an already-open/verified artifact without any remote fallback.

The upstream `955717e8-8726e21a.th` filename contains only the truncated checksum convention used by Demucs/torch. That is not sufficient evidence for BandScope's commercial release provenance claim.

### Test points

- absent local checkpoint: upstream resolver call count remains zero;
- exact cached checkpoint: existing offline resolver remains usable;
- unsupported model name: fail closed without lookup;
- symlink/non-regular checkpoint: fail closed;
- released model artifact: full checksum/signature, inventory, package and offline Windows/macOS real-audio acceptance before release.

## Effect

The normal missing-model path no longer begins an implicit model download. A machine without the required local checkpoint now receives a bounded separation-unavailable failure instead of silently becoming network-dependent.

This deliberately exposes the next buyer-visible gap: a commercial BandScope package must provide an admitted model artifact so an offline buyer does not need a pre-populated developer torch cache.

## Follow-up

1. Establish the Distribution-owned htdemucs artifact decision: redistribution/license basis, exact version, full digest, storage/package location and release/update policy.
2. Replace the preflight-plus-upstream-resolver compatibility path with a local-only loader bound to the verified released artifact, eliminating the remaining remote-fallback race.
3. Add the released model to `supply-chain/supplemental-component-inventory.json` and SBOM/provenance evidence.
4. Exercise the exact packaged artifact on supported Windows and macOS using rights-cleared real audio, with source-separation metrics and explicit uncertainty/claim boundaries.
5. Keep #770 as the scientific-accuracy owner; model-delivery evidence must not substitute for MIR-quality evidence.

## References

Défossez, A., Usunier, N., Bottou, L., & Bach, F. (2021). Music source separation in the waveform domain. *Transactions of the International Society for Music Information Retrieval, 4*(1), 197–208. https://doi.org/10.5334/tismir.76

Rouard, S., Massa, F., & Défossez, A. (2023). Hybrid transformers for music source separation. *Proceedings of the IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)*. https://doi.org/10.1109/ICASSP49357.2023.10097003

Meta Platforms, Inc. (2023). `demucs.pretrained`: loading pretrained models. *facebookresearch/demucs*. https://github.com/facebookresearch/demucs/blob/main/demucs/pretrained.py

Meta Platforms, Inc. (2023). `demucs.repo`: remote and local model repositories. *facebookresearch/demucs*. https://github.com/facebookresearch/demucs/blob/main/demucs/repo.py

Meta Platforms, Inc. (2023). Demucs remote model manifest. *facebookresearch/demucs*. https://github.com/facebookresearch/demucs/blob/main/demucs/remote/files.txt

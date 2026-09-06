# Demucs local-model admission traceability

Status: Draft

## Problem

BandScope promises local-first rehearsal analysis and the repository security policy says ordinary local analysis must not acquire a network dependency. The production separator nevertheless called `demucs.pretrained.get_model("htdemucs")` without first proving that the canonical checkpoint already existed locally.

For the Demucs 4.x API currently consumed by BandScope, `get_model(..., repo=None)` constructs a `RemoteRepo`. `RemoteRepo.get_model` delegates to `torch.hub.load_state_dict_from_url`, so an absent checkpoint can turn the first stem-separation run into an implicit network download. The same production module previously described inference as network-free, so documentation and runtime behavior disagreed.

The first local-only guard then exposed a second integrity gap: it accepted any regular non-symlink file named `955717e8-8726e21a.th`. Demucs itself treats the suffix after `-` as a SHA-256 checksum prefix for locally stored model files. Accepting modified bytes solely because the expected filename remained present allowed a tampered cache object to reach model deserialization.

## Constraints

- BandScope must remain local-first during ordinary analysis.
- Runtime code must not silently download model artifacts.
- A locally cached model must reproduce the checksum convention attached to the canonical Demucs checkpoint before upstream model resolution.
- Model artifacts are supply-chain inputs: redistribution rights, provenance, full integrity evidence, package placement, SBOM/supplemental inventory coverage, signing and update/rollback behavior belong to Distribution rather than to MIR inference code.
- A missing or modified local model must fail safely rather than fall back to the retired FFT mask or claim successful separation.
- Unit fixtures may mock a model boundary; release/scientific acceptance still requires rights-cleared real decoded audio and the actual released model artifact.

## RED evidence

Commit `716438d1c927bbdea38cb6a78b3a417994992e3d` adds the initial `test_demucs_local_model_boundary.py` contract. It replaces `demucs.pretrained.get_model` with a forbidden remote resolver and points torch at an empty hub directory. The predecessor enters `get_model` and therefore violates the local-first contract. No hosted RED failure receipt is claimed because the causal fix followed immediately on the same owner branch.

Commit `fb9571b5bb351ccb742a5956dbfa82966400b02d` adds the cache-integrity RED. The fixture registers a checkpoint name whose checksum suffix belongs to one byte sequence, writes different bytes under that exact name, and requires the upstream resolver call count to remain zero. The predecessor checked only path shape, regular-file status and filename, so it would enter the fake resolver. An immediate ordinary descendant carried the fix; no hosted RED failure receipt is claimed for this intermediate head.

## Selected repair

Commit `61b629baaef0d6da15967fe272b9d9f109d18eaf` adds the first narrow model-admission guard before Demucs resolution:

- only the production `htdemucs` model has a registered local checkpoint filename;
- the expected checkpoint must already exist under torch's local `checkpoints` cache;
- the checkpoint must be a regular file and not a symlink;
- unsupported model names and missing/non-regular checkpoint objects fail with the bounded message `Stem separation model weights are not installed locally.`;
- only after that evidence exists does BandScope enter the upstream Demucs resolver.

Commit `d0432187eea6ec94a247d78f1c02f69e7185a5a1` closes the filename-only cache-integrity gap. BandScope now parses the canonical lowercase eight-hex checksum suffix from the registered Demucs checkpoint filename, streams SHA-256 over the local object in bounded chunks, and enters `get_model` only when the digest starts with that expected prefix. A modified cache object therefore fails before Demucs/torch deserialization or remote fallback is entered. The compatibility regression uses fixture-specific registered checksum prefixes so unit bytes do not masquerade as the real released htdemucs artifact.

Commit `8ccdf2013582db16811168cfadd44d1560ed375d` keeps the older separation unit tests honest about their scope: those tests deliberately replace Demucs with an in-memory fake and therefore bypass only the local-checkpoint prerequisite. The dedicated model-admission regressions do not receive that bypass.

## Alternatives considered

### Keep the existing `get_model("htdemucs")` path

Rejected. An absent checkpoint can invoke `torch.hub.load_state_dict_from_url`; that contradicts the repository's local-first runtime rule and makes first-run behavior depend on external availability.

### Trust the canonical checkpoint filename without checking bytes

Rejected. Demucs's own local repository logic interprets a suffix such as `-8726e21a` as a SHA-256 prefix and checks local model bytes before loading. Filename-only admission would be weaker than the upstream local-model integrity convention while still crossing a deserialization boundary.

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

Signal/MIR may consume a locally available model artifact, but it does not own remote download policy or release packaging. The upstream Demucs resolver is not itself evidence that BandScope has admitted a release artifact. The checksum prefix is a bounded compatibility integrity check, not BandScope's commercial provenance authority.

### Realistic threats

- a first stem-separation run initiates an unexpected network request because weights are absent;
- an unsupported model name expands the remote model surface;
- a symlink is presented at the expected checkpoint path;
- a missing model is silently replaced with weaker heuristic output;
- modified or malicious bytes are placed at the expected checkpoint filename;
- the checkpoint is removed or replaced between BandScope's local verification and the upstream resolver, allowing the upstream remote fallback or a different local object to become reachable in that race window.

### Mitigations

- exact allowlist for the currently supported `htdemucs` cached checkpoint filename;
- regular-file and no-symlink preflight;
- strict parsing of the registered eight-hex lowercase checksum suffix;
- bounded streaming SHA-256 verification against that Demucs checksum prefix before upstream resolution;
- bounded fail-closed error before entering Demucs when local evidence is absent or modified;
- no heuristic-success fallback;
- dedicated regressions proving missing and checksum-mismatched checkpoints never invoke the upstream resolver;
- release model bundling remains a separate Distribution prerequisite rather than an ad-hoc download in MIR code.

### Remaining risk

The current repair is an immediate local-first compatibility guard, not the final release artifact boundary. The eight-hex suffix is only a truncated upstream checksum convention; it is not a repository-owned full SHA-256, signature or immutable release provenance statement. The existing supplemental component inventory also does not list a shipped htdemucs checkpoint.

There is still a preflight-to-upstream-resolver TOCTOU window: BandScope closes its verification descriptor before `get_model` reopens the cache path. If the checkpoint disappears or is replaced after verification, the upstream remote path can become reachable or another object can be presented. Release readiness therefore requires a BandScope-owned immutable model artifact and a local-only loader that consumes the verified artifact without any remote fallback or pathname re-open race.

### Test points

- absent local checkpoint: upstream resolver call count remains zero;
- checksum-mismatched cached checkpoint: upstream resolver call count remains zero;
- checksum-matching registered fixture: existing offline resolver remains usable;
- unsupported model name: fail closed without lookup;
- symlink/non-regular checkpoint: fail closed;
- released model artifact: full checksum/signature, inventory, package and offline Windows/macOS real-audio acceptance before release.

## Effect

The normal missing-model path no longer begins an implicit model download, and a modified cache object with the expected filename no longer reaches Demucs model resolution solely by name. A machine without a locally admitted checkpoint receives a bounded separation-unavailable failure instead of silently becoming network-dependent or deserializing unchecked cached bytes.

This deliberately exposes the next buyer-visible gap: a commercial BandScope package must provide an admitted model artifact so an offline buyer does not need a pre-populated developer torch cache.

## Follow-up

1. Establish the Distribution-owned htdemucs artifact decision: redistribution/license basis, exact version, full digest, storage/package location and release/update policy.
2. Replace the preflight-plus-upstream-resolver compatibility path with a local-only loader bound to an already-open or immutable verified released artifact, eliminating the remaining remote-fallback/path-reopen race.
3. Add the released model to `supply-chain/supplemental-component-inventory.json` and SBOM/provenance evidence.
4. Exercise the exact packaged artifact on supported Windows and macOS using rights-cleared real audio, with source-separation metrics and explicit uncertainty/claim boundaries.
5. Keep #770 as the scientific-accuracy owner; model-delivery evidence must not substitute for MIR-quality evidence.

## References

Défossez, A., Usunier, N., Bottou, L., & Bach, F. (2021). Music source separation in the waveform domain. *Transactions of the International Society for Music Information Retrieval, 4*(1), 197–208. https://doi.org/10.5334/tismir.76

Rouard, S., Massa, F., & Défossez, A. (2023). Hybrid transformers for music source separation. *Proceedings of the IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)*. https://doi.org/10.1109/ICASSP49357.2023.10097003

Meta Platforms, Inc. (2023). `demucs.pretrained`: loading pretrained models. *facebookresearch/demucs*. https://github.com/facebookresearch/demucs/blob/main/demucs/pretrained.py

Meta Platforms, Inc. (2023). `demucs.repo`: remote and local model repositories. *facebookresearch/demucs*. https://github.com/facebookresearch/demucs/blob/main/demucs/repo.py

Meta Platforms, Inc. (2023). Demucs remote model manifest. *facebookresearch/demucs*. https://github.com/facebookresearch/demucs/blob/main/demucs/remote/files.txt

PyTorch Contributors. (2026). `torch.hub`: model download and cache behavior. *pytorch/pytorch*. https://github.com/pytorch/pytorch/blob/main/torch/hub.py

# Demucs local-model admission traceability

Status: Draft

## Problem

BandScope promises local-first rehearsal analysis and the repository security policy says ordinary local analysis must not acquire a network dependency. The production separator originally called `demucs.pretrained.get_model("htdemucs")` without first proving that the canonical checkpoint already existed locally.

For the Demucs 4.x API currently consumed by BandScope, `get_model(..., repo=None)` constructs a `RemoteRepo`. `RemoteRepo.get_model` can delegate to `torch.hub.load_state_dict_from_url`, so an absent checkpoint could turn first stem separation into an implicit network download. A first local-only guard then exposed a second integrity gap: it accepted any regular non-symlink file named `955717e8-8726e21a.th`. Demucs itself treats the suffix after `-` as a SHA-256 checksum prefix for locally stored model files, so filename-only admission was weaker than upstream's own local repository contract.

The next implementation still verified the mutable torch-cache object and then let the upstream resolver reopen that pathname. A replacement or deletion after verification could therefore invalidate the evidence. The current implementation instead copies bytes from the verified descriptor into a private local Demucs repository and calls `get_model(signature, repo=snapshot_root)`. Demucs consequently resolves through `LocalRepo`; a later mutation of the torch-cache pathname cannot change the model bytes being deserialized or reactivate `RemoteRepo` for that load.

That private snapshot introduced a separate resource-admission gap: a regular cache object with the canonical filename could be arbitrarily large. Checksum mismatch was detected only after copying the object, so corrupted local state could consume unbounded temporary storage before failing. The current boundary rejects empty or over-limit descriptors before copying and enforces the same ceiling while streaming, covering growth after `fstat` as well.

A commercial review exposed an independent rights blocker. The upstream Demucs issue about distributing pretrained models commercially received an explicit maintainer response that the model weights are not covered by the MIT code license and are provided only for scientific purposes. Technical integrity, local-only loading, a third-party mirror, or conversion of the same weights cannot create commercial rights. BandScope issue #1181 owns that release blocker.

## Constraints

- BandScope must remain local-first during ordinary analysis.
- Runtime code must not silently download model artifacts.
- A local model cache object is untrusted input: type, identity, byte size, and checksum evidence must be bounded before deserialization.
- The private compatibility snapshot is temporary runtime authority, not a released model artifact or provenance statement.
- The upstream pretrained Demucs weights must not be bundled, auto-downloaded, or represented as commercially licensed unless an explicit commercial-use/redistribution grant covering the exact artifact is obtained.
- Model artifacts are supply-chain inputs: usage/redistribution rights, provenance, exact full integrity evidence, package placement, SBOM/supplemental inventory coverage, signing and update/rollback behavior belong to Distribution rather than MIR inference code.
- A missing, modified, oversized, or commercially inadmissible model must fail safely rather than fall back to the retired FFT mask or claim successful separation.
- Unit fixtures may mock a model boundary; release/scientific acceptance still requires rights-cleared real decoded audio and an actually admissible released model artifact.

## RED evidence

Commit `716438d1c927bbdea38cb6a78b3a417994992e3d` adds the initial local-only regression. It replaces the upstream resolver with a forbidden call and points torch at an empty hub directory. The predecessor enters `get_model`; the causal fix followed immediately, so no hosted RED failure receipt is claimed.

Commit `fb9571b5bb351ccb742a5956dbfa82966400b02d` adds the cache-integrity RED. The fixture registers a checkpoint name whose checksum suffix belongs to one byte sequence, writes different bytes under that exact name, and requires the resolver call count to remain zero. The predecessor checked only path shape, file type, and filename.

Commit `9fd9b562d068dea1e9348584f53ced6d9c6c0553` adds the immutable-snapshot regression. It requires the bytes presented through the private local repository to remain the verified bytes even if the original torch-cache pathname is replaced after snapshot acquisition.

Commit `7ac4bc1d35ff736966ed556407b6ff56d03942c0` adds the resource-bound RED. A checksum-valid fixture is deliberately larger than a monkeypatched local-model ceiling; the Demucs resolver is forbidden. The predecessor had no checkpoint-size admission rule, so it would continue to resolution rather than fail before model loading. The immediate descendant carries the causal fix; no hosted RED failure receipt is claimed for this intermediate head.

## Selected repair

Commit `61b629baaef0d6da15967fe272b9d9f109d18eaf` established the first narrow admission guard: the production `htdemucs` checkpoint must already exist locally, be a regular non-symlink object, and unsupported/missing inputs fail with the bounded message `Stem separation model weights are not installed locally.`

Commit `d0432187eea6ec94a247d78f1c02f69e7185a5a1` parses the canonical lowercase eight-hex checksum suffix and streams SHA-256 over the local object before model resolution. The compatibility regression uses fixture-specific checksum prefixes so unit bytes do not masquerade as the released htdemucs artifact.

Commit `3662de13e1ffae2ac2337835dd6f317011e81bff` closes the mutable-cache pathname gap. BandScope opens the canonical cache object with no-follow semantics where available, verifies that the opened descriptor is the same regular object observed by `lstat`, copies and hashes that descriptor into a process-private temporary Demucs repository, and invokes `get_model(signature, repo=snapshot_root)`. Upstream `get_model` therefore uses `LocalRepo`; the mutable torch-cache pathname is no longer reopened by the model resolver and `RemoteRepo` is not selected for this load.

Commit `c21c6c4476f7c9ae937a24dda77eb841515ed315` bounds that compatibility snapshot to 128 MiB. The descriptor must report a positive size no greater than the ceiling before copying. The copy loop also counts actual bytes and fails before writing an over-limit chunk, so growth after the metadata check cannot cause unbounded snapshot storage. A checksum mismatch, size violation, file-identity mismatch, or I/O failure removes the owned snapshot and returns the same bounded model-unavailable result before Demucs deserialization.

The 128 MiB ceiling is a defensive compatibility resource limit, not a claim about the exact commercial artifact. Distribution #1180 must eventually replace this cache-compatibility assumption with an immutable admitted artifact whose exact byte size, full digest/signature, package placement, and update/rollback compatibility are release inputs.

The commercial-rights finding is not treated as a code bug that can be patched by changing a package label. #1181 makes the upstream pretrained weights a release-blocking legal/product prerequisite. Signal/MIR may keep this technical fail-closed boundary in Draft, but Distribution must not turn those weights into a commercial BandScope artifact without rights evidence.

## Alternatives considered

### Keep `get_model("htdemucs")` with no explicit local repository

Rejected. An absent checkpoint can select `RemoteRepo`, and a mutable cache pathname can be reopened after BandScope's own verification.

### Trust the canonical filename without checking bytes

Rejected. Upstream `LocalRepo` interprets the checksum-bearing filename as integrity evidence. Filename-only admission is insufficient across a deserialization boundary.

### Verify the cache and then let upstream reopen it

Rejected. It leaves a verification-to-use pathname race. Copying from the verified descriptor into a private repository binds the bytes used by the resolver to the bytes BandScope admitted.

### Copy any sized regular checkpoint and reject only after hashing

Rejected. Integrity failure after an unbounded copy is still a resource-exhaustion path. Model artifacts require an explicit byte ceiling before and during materialization.

### Download or bundle the checkpoint from this MIR/Project Persistence lane

Rejected. Ordinary analysis must not gain a network dependency, and model acquisition/package provenance belongs to Distribution. More importantly, #1181 currently prevents treating the upstream pretrained weights as a commercially admissible BandScope release input.

### Rely on a third-party rehost or converted copy carrying an MIT label

Rejected. The upstream maintainer explicitly distinguished model weights from MIT-licensed source code. A mirror, conversion, or downstream label does not establish broader rights.

### Replace the model with a commercially admissible separator

Viable. The replacement must have traceable model-weight/training-data rights and meet BandScope's real-audio source-separation and rehearsal-quality contract. License safety must not silently regress to heuristic stems.

### Fall back to heuristic FFT masks

Rejected. The retired heuristic is not a scientifically acceptable substitute for source separation and must not turn unavailable model authority into false rehearsal confidence.

## Security Notes

### Attack surface

The model-loading boundary crosses the local Python process into third-party Demucs/torch deserialization. Cache pathname state, opened model bytes, temporary snapshots, and release model artifacts are security-, availability-, scientific-integrity-, and supply-chain-sensitive inputs.

### Trust boundary

Signal/MIR may consume a technically admitted local model for Draft analysis, but it does not own remote acquisition, commercial-use/redistribution rights, or release packaging. The private snapshot binds one load to verified local bytes; it does not make those bytes commercially admissible. The eight-hex checksum is upstream compatibility integrity evidence, not BandScope release provenance. #1180 owns Distribution artifact delivery and #1181 owns the pretrained-weight rights blocker.

### Realistic threats

- an absent model initiates an unexpected network fetch;
- an unsupported model name expands the resolver surface;
- a symlink/non-regular object is presented under the expected cache pathname;
- modified bytes retain a trusted-looking checkpoint filename;
- a cache object is replaced between verification and model use;
- a corrupted canonical-name object is extremely large and exhausts temporary storage before checksum rejection;
- a technically valid upstream checkpoint is shipped or advertised commercially despite the stated scientific-purpose restriction;
- a third-party mirror or converted artifact is mistaken for a new commercial license grant.

### Mitigations

- exact allowlist for the currently supported `htdemucs` checkpoint name;
- regular-file, no-follow, and descriptor identity checks;
- positive-size and 128 MiB compatibility ceiling before snapshotting;
- streaming byte-count enforcement during the snapshot copy so post-`fstat` growth also fails closed;
- streaming SHA-256 verification against the canonical Demucs checksum prefix;
- private temporary local repository built from the verified descriptor bytes;
- explicit `repo=snapshot_root`, keeping upstream model resolution on `LocalRepo` instead of `RemoteRepo`;
- bounded failure before Demucs deserialization for missing, modified, oversized, or otherwise inadmissible cache state;
- no heuristic-success fallback;
- #1181 blocks commercial packaging/auto-download/rights claims until explicit rights or an admissible replacement exists;
- #1180 retains ownership of immutable release artifact, full digest/signature, inventory, package, signing, and updater/rollback evidence.

### Remaining risk

The current path is still a compatibility bridge around a developer/runtime torch cache, not a commercial release artifact boundary. The eight-hex suffix is truncated upstream integrity evidence, not a repository-owned full SHA-256, signature, provenance receipt, or exact package manifest. The 128 MiB ceiling is deliberately a generic safety limit rather than the exact size of an admitted release artifact.

Demucs/torch deserialization still consumes a trusted technical snapshot in its native checkpoint format. A commercially admitted release should minimize code-executing model formats where practical or bind any unavoidable format to immutable package/signature provenance and a narrow loader. The upstream pretrained `htdemucs` weights remain blocked for commercial release by #1181 even if every technical integrity check passes.

### Test points

- absent local checkpoint: upstream resolver call count remains zero;
- checksum-mismatched cached checkpoint: resolver call count remains zero;
- checksum-matching fixture: resolver receives only the private snapshot repository;
- original cache pathname replaced after snapshot: private snapshot bytes remain unchanged;
- checkpoint larger than the active resource ceiling: resolver call count remains zero;
- unsupported model name and symlink/non-regular object: fail closed;
- commercial release: exact rights evidence exists for the immutable artifact or the upstream weights are absent from release inputs;
- released admissible model: exact full digest/signature, exact size, inventory, package/signing/notarization, rollback, and offline Windows/macOS real-audio acceptance are linked.

## Effect

Ordinary missing-model execution no longer begins an implicit model download. Modified or oversized cache objects fail before Demucs resolution, and the model resolver consumes a private snapshot derived from the exact descriptor BandScope verified rather than reopening the mutable torch-cache pathname. These controls establish a technical local-first compatibility boundary; they do not authorize commercial use of the upstream weights.

## Follow-up

1. Resolve #1181: obtain explicit commercial-use/redistribution rights for the exact upstream weights or select/train a commercially admissible replacement with traceable training-data/model rights.
2. Under #1180, establish the admitted model's exact version, exact byte size, full digest/signature, package location, supplemental inventory/SBOM/NOTICE, signing/notarization, and update/rollback policy.
3. Replace torch-cache compatibility discovery with a Distribution-owned immutable local artifact path/manifest. Retain the descriptor-bound/private-load principle and no-remote-fallback invariant.
4. Evaluate whether a lower-risk model serialization format can replace native checkpoint deserialization without sacrificing supported-platform behavior or scientific accuracy; document the decision and removal condition if not.
5. Exercise the exact packaged artifact on supported Windows and macOS using rights-cleared real audio, recognized source-separation metrics, and explicit uncertainty/claim boundaries under #770.

## References

Défossez, A., Usunier, N., Bottou, L., & Bach, F. (2021). Music source separation in the waveform domain. *Transactions of the International Society for Music Information Retrieval, 4*(1), 197–208. https://doi.org/10.5334/tismir.76

Rouard, S., Massa, F., & Défossez, A. (2023). Hybrid transformers for music source separation. *Proceedings of the IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)*. https://doi.org/10.1109/ICASSP49357.2023.10097003

Défossez, A. (2022). Re: License of pre-trained models (Issue comment 1134828611). *facebookresearch/demucs* (Issue #327). https://github.com/facebookresearch/demucs/issues/327#issuecomment-1134828611

Meta Platforms, Inc. (2023). `demucs.pretrained`: loading pretrained models. *facebookresearch/demucs*. https://github.com/facebookresearch/demucs/blob/v4.0.1/demucs/pretrained.py

Meta Platforms, Inc. (2023). `demucs.repo`: remote and local model repositories. *facebookresearch/demucs*. https://github.com/facebookresearch/demucs/blob/v4.0.1/demucs/repo.py

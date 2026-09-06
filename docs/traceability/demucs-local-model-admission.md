# Demucs local-model admission traceability

Status: Draft

## Problem

BandScope promises local-first rehearsal analysis and the repository security policy says ordinary local analysis must not acquire a network dependency. The production separator originally called `demucs.pretrained.get_model("htdemucs")` without first proving that the canonical checkpoint already existed locally.

For the Demucs 4.x API currently consumed by BandScope, `get_model(..., repo=None)` constructs a `RemoteRepo`. `RemoteRepo.get_model` can delegate to `torch.hub.load_state_dict_from_url`, so an absent checkpoint could turn first stem separation into an implicit network download. A first local-only guard then exposed a second integrity gap: it accepted any regular non-symlink file named `955717e8-8726e21a.th`. Demucs itself treats the suffix after `-` as a SHA-256 checksum prefix for locally stored model files, so filename-only admission was weaker than upstream's own local repository contract.

The next implementation still verified the mutable torch-cache object and then let the upstream resolver reopen that pathname. A replacement or deletion after verification could therefore invalidate the evidence. The current implementation instead copies bytes from the verified descriptor into a private local Demucs repository and calls `get_model(signature, repo=snapshot_root)`. Demucs consequently resolves through `LocalRepo`; a later mutation of the torch-cache pathname cannot change the model bytes being deserialized or reactivate `RemoteRepo` for that load.

That private snapshot introduced a separate resource-admission gap: a regular cache object with the canonical filename could be arbitrarily large. Checksum mismatch was detected only after copying the object, so corrupted local state could consume unbounded temporary storage before failing. A 128 MiB ceiling repaired the unbounded-copy case, but the copy still streamed until EOF rather than binding materialization to the descriptor size observed at `fstat`. If the file grew after preflight while remaining below the ceiling, extra bytes could still enter the private snapshot before checksum rejection. The current boundary therefore snapshots exactly the descriptor-reported byte count, rejects short reads, and rejects any byte beyond that admitted count before resolver/deserialization.

The live analysis lock now resolves `torch==2.12.1`. PyTorch changed `torch.load` so releases starting with 2.6 use `weights_only=True` by default when a custom `pickle_module` is not supplied. Native Demucs packages contain more than a plain tensor `state_dict`: upstream loading consumes serialized class/constructor metadata. A compatibility package may therefore raise `pickle.UnpicklingError` when the weights-only unpickler rejects a serialized global. That failure is security-relevant as well as operational: BandScope must not surface internal serialized class names to a buyer, silently switch to `weights_only=False`, or turn a compatibility failure into remote/model fallback. The Signal/MIR boundary converts this incompatibility to the existing bounded local-model-unavailable diagnostic while leaving the release serialization decision with Distribution.

PyTorch also documents a process-level override, `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD`, that makes an implicit `torch.load` use `weights_only=False` when the call site did not pass the argument. Upstream Demucs 4.x uses that implicit form for native packages. Relying only on PyTorch's safer default therefore left a downgrade path outside BandScope's model-admission code: a truthy inherited environment value could reactivate unrestricted pickle loading before any BandScope exception boundary ran. The current loader rejects that unsafe override before Demucs import/resolution or checkpoint deserialization and returns the same bounded local-model-unavailable diagnostic.

A commercial review exposed an independent rights blocker. The upstream Demucs issue about distributing pretrained models commercially received an explicit maintainer response that the model weights are not covered by the MIT code license and are provided only for scientific purposes. Technical integrity, local-only loading, a third-party mirror, conversion of the same weights, or a PyTorch compatibility workaround cannot create commercial rights. BandScope issue #1181 owns that release blocker.

## Constraints

- BandScope must remain local-first during ordinary analysis.
- Runtime code must not silently download model artifacts.
- A local model cache object is untrusted input: type, identity, byte size, and checksum evidence must be bounded before deserialization.
- The private compatibility snapshot is temporary runtime authority, not a released model artifact or provenance statement.
- A PyTorch weights-only incompatibility must not silently authorize unsafe legacy pickle loading; process environment must not downgrade an implicit Demucs `torch.load` to `weights_only=False`; any broader deserialization policy belongs to a fully admitted immutable release artifact and explicit Distribution decision.
- The upstream pretrained Demucs weights must not be bundled, auto-downloaded, or represented as commercially licensed unless an explicit commercial-use/redistribution grant covering the exact artifact is obtained.
- Model artifacts are supply-chain inputs: usage/redistribution rights, provenance, exact full integrity evidence, package placement, SBOM/supplemental inventory coverage, signing and update/rollback behavior belong to Distribution rather than MIR inference code.
- A missing, modified, oversized, size-racing, incompatible, environment-downgraded, or commercially inadmissible model must fail safely rather than fall back to the retired FFT mask or claim successful separation.
- Unit fixtures may mock a model boundary; release/scientific acceptance still requires rights-cleared real decoded audio and an actually admissible released model artifact.

## RED evidence

Commit `716438d1c927bbdea38cb6a78b3a417994992e3d` adds the initial local-only regression. It replaces the upstream resolver with a forbidden call and points torch at an empty hub directory. The predecessor enters `get_model`; the causal fix followed immediately, so no hosted RED failure receipt is claimed.

Commit `fb9571b5bb351ccb742a5956dbfa82966400b02d` adds the cache-integrity RED. The fixture registers a checkpoint name whose checksum suffix belongs to one byte sequence, writes different bytes under that exact name, and requires the resolver call count to remain zero. The predecessor checked only path shape, file type, and filename.

Commit `9fd9b562d068dea1e9348584f53ced6d9c6c0553` adds the immutable-snapshot regression. It requires the bytes presented through the private local repository to remain the verified bytes even if the original torch-cache pathname is replaced after snapshot acquisition.

Commit `7ac4bc1d35ff736966ed556407b6ff56d03942c0` adds the resource-bound RED. A checksum-valid fixture is deliberately larger than a monkeypatched local-model ceiling; the Demucs resolver is forbidden. The predecessor had no checkpoint-size admission rule, so it would continue to resolution rather than fail before model loading. The immediate descendant carries the causal fix; no hosted RED failure receipt is claimed for this intermediate head.

Commit `f4ef3dc86e34432936b2febb152991af70e57bd1` adds the descriptor-size continuity RED. The fixture presents a stable regular checkpoint whose descriptor preflight reports one byte less than the bytes subsequently readable from that same descriptor and forbids any Demucs resolver call. The predecessor streamed until EOF, so the extra post-preflight byte entered the private snapshot and a checksum-valid full byte sequence could still reach model resolution. The immediate descendant carries the causal fix; no hosted RED failure receipt is claimed for the intermediate head.

Commit `5789562e716d955c758a7eb728140c5fcb02f779` adds the PyTorch weights-only compatibility RED. A checksum-valid local fixture reaches the mocked Demucs resolver, which raises the same `pickle.UnpicklingError` class used when a weights-only load rejects a serialized global such as `demucs.htdemucs.HTDemucs`. The contract requires the public exception to remain `Stem separation model weights are not installed locally.` and forbids the serialized class name from leaking through that buyer-facing message. The predecessor propagated the unpickling failure. The production descendant followed immediately, so no hosted RED-failure receipt is claimed for the intermediate head.

Commit `3ae3646087f6fe2ae6a9aa709025720fc40beb6c` adds the environment-downgrade RED. For every documented truthy form of `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD` plus uppercase `TRUE`, a checksum-valid local fixture forbids the Demucs resolver from being called. The predecessor entered `get_model`, so an upstream implicit `torch.load` could have observed the unsafe process override. The production descendant followed immediately, so no hosted RED-failure receipt is claimed for the intermediate head.

## Selected repair

Commit `61b629baaef0d6da15967fe272b9d9f109d18eaf` established the first narrow admission guard: the production `htdemucs` checkpoint must already exist locally, be a regular non-symlink object, and unsupported/missing inputs fail with the bounded message `Stem separation model weights are not installed locally.`

Commit `d0432187eea6ec94a247d78f1c02f69e7185a5a1` parses the canonical lowercase eight-hex checksum suffix and streams SHA-256 over the local object before model resolution. The compatibility regression uses fixture-specific checksum prefixes so unit bytes do not masquerade as the released htdemucs artifact.

Commit `3662de13e1ffae2ac2337835dd6f317011e81bff` closes the mutable-cache pathname gap. BandScope opens the canonical cache object with no-follow semantics where available, verifies that the opened descriptor is the same regular object observed by `lstat`, copies and hashes that descriptor into a process-private temporary Demucs repository, and invokes `get_model(signature, repo=snapshot_root)`. Upstream `get_model` therefore uses `LocalRepo`; the mutable torch-cache pathname is no longer reopened by the model resolver and `RemoteRepo` is not selected for this load.

Commit `c21c6c4476f7c9ae937a24dda77eb841515ed315` bounds that compatibility snapshot to 128 MiB. The descriptor must report a positive size no greater than the ceiling before copying, so an already-oversized cache object cannot consume unbounded snapshot storage.

Commit `0d0c6c3263e9b72b5aec554c1824de3d004b5831` binds snapshot materialization to that admitted descriptor size. The copy reads exactly `descriptor_stat.st_size` bytes, fails on an early EOF, and probes one additional byte without copying it; any post-`fstat` growth therefore fails before Demucs resolution instead of entering the snapshot. SHA-256 verification of those exact bytes against the canonical filename prefix remains required. A checksum mismatch, size violation, file-identity mismatch, size race, or I/O failure removes the owned snapshot and returns the same bounded model-unavailable result before Demucs deserialization.

Commit `d395c6055bb16cfc4a76f490f16e9e6540590fae` keeps the PyTorch 2.6+ compatibility failure inside that same local-model boundary. `_load_model` catches only `pickle.UnpicklingError` from the admitted `get_model(signature, repo=snapshot_root)` call and converts it to the existing bounded local-model-unavailable `ValueError`. It does not set `weights_only=False`, broaden remote resolution, weaken snapshot checks, or treat incompatible bytes as successful model authority. Other unexpected exceptions remain visible to engineering rather than being swallowed by a broad catch.

Commit `0d9fb9f983a093fe3868106945677dfa58d10bba` rejects PyTorch's documented no-weights-only process override before Demucs import/resolution. The guard recognizes the documented truthy values case-insensitively and does not mutate global process environment or rewrite upstream loader code. An unsafe inherited override therefore cannot turn the admitted compatibility path into unrestricted pickle deserialization; it fails with the existing bounded model-unavailable diagnostic.

The 128 MiB ceiling is a defensive compatibility resource limit, not a claim about the exact commercial artifact. Distribution #1180 must replace this cache-compatibility assumption with an immutable admitted artifact whose exact byte size, full digest/signature, serialization contract, package placement, and update/rollback compatibility are release inputs. The exact packaged artifact must be demonstrated under the release PyTorch/model-loader stack rather than assuming that either `weights_only=True` or `weights_only=False` is safe or compatible.

The commercial-rights finding is not treated as a code bug that can be patched by changing a package label. #1181 makes the upstream pretrained weights a release-blocking legal/product prerequisite. Signal/MIR may keep this technical fail-closed boundary in Draft, but Distribution must not turn those weights into a commercial BandScope artifact without rights evidence.

## Alternatives considered

### Keep `get_model("htdemucs")` with no explicit local repository

Rejected. An absent checkpoint can select `RemoteRepo`, and a mutable cache pathname can be reopened after BandScope's own verification.

### Trust the canonical filename without checking bytes

Rejected. Upstream `LocalRepo` interprets the checksum-bearing filename as integrity evidence. Filename-only admission is insufficient across a deserialization boundary.

### Verify the cache and then let upstream reopen it

Rejected. It leaves a verification-to-use pathname race. Copying from the verified descriptor into a private repository binds the bytes used by the resolver to the bytes BandScope admitted.

### Copy until EOF under only a generic maximum

Rejected. A generic maximum prevents unbounded storage but does not preserve the exact descriptor-size observation that authorized the snapshot. A file that grows after `fstat` but remains below the ceiling would contribute unadmitted bytes before checksum rejection. Exact-count copy plus an extra-byte probe keeps resource and identity evidence aligned.

### Force `weights_only=False` when current PyTorch rejects the package

Rejected for the compatibility cache path. PyTorch documents that legacy pickle loading can execute arbitrary functions encoded by the checkpoint. The current eight-hex filename suffix and private snapshot establish local compatibility integrity, not the full release provenance needed to authorize a code-bearing object graph. Distribution may choose a native checkpoint only after exact rights/provenance, immutable full integrity evidence, loader isolation and removal conditions are documented under #1180.

### Rely on PyTorch's default without guarding its environment override

Rejected. Upstream Demucs does not pass `weights_only` explicitly at the native package call site, and PyTorch documents that a truthy `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD` changes such calls to `weights_only=False`. A secure default is not an invariant if inherited process state can reverse it. BandScope rejects the downgrade before entering the third-party loader rather than modifying global environment or patching Demucs.

### Broadly catch every model-loader exception

Rejected. A broad catch would hide implementation defects and incompatible scientific behavior. The current repair handles the identified `pickle.UnpicklingError` compatibility boundary while preserving fail-fast engineering visibility for unrelated failures.

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

The model-loading boundary crosses the local Python process into third-party Demucs/torch deserialization. Cache pathname state, opened model bytes, descriptor size, temporary snapshots, serialized object graphs, inherited PyTorch loader environment, loader behavior, and release model artifacts are security-, availability-, scientific-integrity-, and supply-chain-sensitive inputs.

### Trust boundary

Signal/MIR may consume a technically admitted local model for Draft analysis, but it does not own remote acquisition, commercial-use/redistribution rights, or release packaging. The private snapshot binds one load to the regular descriptor, its admitted byte count, and verified local bytes; it does not make those bytes commercially admissible. The eight-hex checksum is upstream compatibility integrity evidence, not BandScope release provenance. PyTorch's weights-only policy is a loader security boundary, not a model-rights or scientific-acceptance statement, and BandScope requires that inherited process state cannot downgrade that policy on this implicit upstream call. #1180 owns Distribution artifact delivery and #1181 owns the pretrained-weight rights blocker.

### Realistic threats

- an absent model initiates an unexpected network fetch;
- an unsupported model name expands the resolver surface;
- a symlink/non-regular object is presented under the expected cache pathname;
- modified bytes retain a trusted-looking checkpoint filename;
- a cache object is replaced between verification and model use;
- a cache descriptor grows or shrinks after size preflight and changes the bytes copied into the private repository;
- a corrupted canonical-name object is extremely large and exhausts temporary storage before checksum rejection;
- a legacy serialized package is incompatible with the locked PyTorch weights-only default and leaks internal class/global names through an error;
- inherited `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD` state silently turns an implicit upstream load into unrestricted pickle deserialization;
- an operator responds to compatibility failure by enabling unsafe legacy pickle loading on a merely compatibility-admitted cache object;
- a technically valid upstream checkpoint is shipped or advertised commercially despite the stated scientific-purpose restriction;
- a third-party mirror or converted artifact is mistaken for a new commercial license grant.

### Mitigations

- exact allowlist for the currently supported `htdemucs` checkpoint name;
- regular-file, no-follow, and descriptor identity checks;
- positive-size and 128 MiB compatibility ceiling before snapshotting;
- exact descriptor-size snapshotting with early-EOF and extra-byte rejection, so post-`fstat` shrink/growth fails closed;
- streaming SHA-256 verification against the canonical Demucs checksum prefix;
- private temporary local repository built from the verified descriptor bytes;
- explicit `repo=snapshot_root`, keeping upstream model resolution on `LocalRepo` instead of `RemoteRepo`;
- reject a truthy `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD` before the upstream loader can deserialize a native package;
- bounded `pickle.UnpicklingError` handling without setting `weights_only=False` or exposing serialized class details;
- bounded failure before Demucs deserialization/use for missing, modified, oversized, size-racing, environment-downgraded, or otherwise inadmissible cache state;
- no heuristic-success fallback;
- #1181 blocks commercial packaging/auto-download/rights claims until explicit rights or an admissible replacement exists;
- #1180 retains ownership of immutable release artifact, full digest/signature, serialization policy, inventory, package, signing, and updater/rollback evidence.

### Remaining risk

The current path is still a compatibility bridge around a developer/runtime torch cache, not a commercial release artifact boundary. The eight-hex suffix is truncated upstream integrity evidence, not a repository-owned full SHA-256, signature, provenance receipt, or exact package manifest. The 128 MiB ceiling is deliberately a generic safety limit rather than the exact size of an admitted release artifact.

Demucs/torch deserialization still consumes a trusted technical snapshot in its native checkpoint format. Current PyTorch may reject legacy object graphs under the safer weights-only default; BandScope now fails closed rather than weakening that default or allowing PyTorch's documented no-weights-only environment override to weaken it on the implicit Demucs call. A commercially admitted release should prefer a non-code-executing or materially narrower model format where scientifically equivalent, or bind unavoidable native deserialization to immutable package/signature provenance, an explicitly documented allowed object graph/loader policy, isolation and a removal condition. The upstream pretrained `htdemucs` weights remain blocked for commercial release by #1181 even if every technical integrity and compatibility check passes.

### Test points

- absent local checkpoint: upstream resolver call count remains zero;
- checksum-mismatched cached checkpoint: resolver call count remains zero;
- checksum-matching fixture: resolver receives only the private snapshot repository;
- original cache pathname replaced after snapshot: private snapshot bytes remain unchanged;
- checkpoint larger than the active resource ceiling: resolver call count remains zero;
- descriptor preflight smaller than readable bytes: extra bytes do not enter the snapshot and resolver call count remains zero;
- weights-only incompatibility: `pickle.UnpicklingError` becomes the bounded local-model-unavailable diagnostic and serialized class names are absent from the public message;
- truthy `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD`: resolver/deserialization call count remains zero and the bounded local-model-unavailable diagnostic is returned;
- unsupported model name and symlink/non-regular object: fail closed;
- commercial release: exact rights evidence exists for the immutable artifact or the upstream weights are absent from release inputs;
- released admissible model: exact full digest/signature, exact size, serialization/loader policy, inventory, package/signing/notarization, rollback, and offline Windows/macOS real-audio acceptance are linked.

## Effect

Ordinary missing-model execution no longer begins an implicit model download. Modified, oversized, or size-racing cache objects fail before Demucs resolution, and the model resolver consumes a private snapshot derived from exactly the descriptor byte count BandScope admitted rather than reopening the mutable torch-cache pathname or accepting later growth. The PyTorch 2.6+ weights-only compatibility failure is bounded without silently enabling legacy pickle loading, and inherited PyTorch environment state cannot opt the implicit Demucs load back into unrestricted pickle mode. These controls establish a technical local-first compatibility boundary; they do not prove that the upstream package loads successfully under the current locked stack, establish scientific accuracy, or authorize commercial use of the upstream weights.

## Follow-up

1. Resolve #1181: obtain explicit commercial-use/redistribution rights for the exact upstream weights or select/train a commercially admissible replacement with traceable training-data/model rights.
2. Under #1180, establish the admitted model's exact version, exact byte size, full digest/signature, serialization/loader contract, package location, supplemental inventory/SBOM/NOTICE, signing/notarization, and update/rollback policy.
3. Exercise the exact released model with the exact locked PyTorch/loader stack. If a native checkpoint is retained, document the allowed object graph and loader/isolation policy; do not treat a blanket `weights_only=False` compatibility toggle or environment override as an admission control.
4. Replace torch-cache compatibility discovery with a Distribution-owned immutable local artifact path/manifest. Retain the descriptor-bound/private-load principle and no-remote-fallback invariant.
5. Evaluate whether a lower-risk model serialization format can replace native checkpoint deserialization without sacrificing supported-platform behavior or scientific accuracy; document the decision and removal condition if not.
6. Exercise the exact packaged artifact on supported Windows and macOS using rights-cleared real audio, recognized source-separation metrics, and explicit uncertainty/claim boundaries under #770.

## References

Défossez, A., Usunier, N., Bottou, L., & Bach, F. (2021). Music source separation in the waveform domain. *Transactions of the International Society for Music Information Retrieval, 4*(1), 197–208. https://doi.org/10.5334/tismir.76

Rouard, S., Massa, F., & Défossez, A. (2023). Hybrid transformers for music source separation. *Proceedings of the IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)*. https://doi.org/10.1109/ICASSP49357.2023.10097003

Défossez, A. (2022). Re: License of pre-trained models (Issue comment 1134828611). *facebookresearch/demucs* (Issue #327). https://github.com/facebookresearch/demucs/issues/327#issuecomment-1134828611

Gawarecki, M. (2024, November 4). BC-breaking change: `torch.load` is being flipped to use `weights_only=True` by default in the nightlies after #137602. *PyTorch Developer Mailing List*. https://dev-discuss.pytorch.org/t/bc-breaking-change-torch-load-is-being-flipped-to-use-weights-only-true-by-default-in-the-nightlies-after-137602/2573

Meta Platforms, Inc. (2023). `demucs.pretrained`: loading pretrained models. *facebookresearch/demucs*. https://github.com/facebookresearch/demucs/blob/v4.0.1/demucs/pretrained.py

Meta Platforms, Inc. (2023). `demucs.repo`: remote and local model repositories. *facebookresearch/demucs*. https://github.com/facebookresearch/demucs/blob/v4.0.1/demucs/repo.py

PyTorch Contributors. (2026). Miscellaneous environment variables. *PyTorch documentation*. https://docs.pytorch.org/docs/stable/miscellaneous_environment_variables.html

PyTorch Contributors. (2026). Serialization semantics: `torch.load` with `weights_only=True`. *PyTorch documentation*. https://docs.pytorch.org/docs/stable/notes/serialization.html#torch-load-with-weights-only-true

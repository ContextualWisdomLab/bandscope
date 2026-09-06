# PyTorch runtime-environment admission traceability

Status: Draft

## Problem

BandScope's local Demucs compatibility path is intended to enter PyTorch only after BandScope has decided that the local model boundary is admissible. Current PyTorch documentation exposes two inherited process-environment controls that can widen execution before or during that third-party boundary:

- `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD` makes an implicit `torch.load` use `weights_only=False`. Demucs 4.x uses an implicit `torch.load` for native packages, so this can reactivate unrestricted pickle deserialization.
- `TORCH_DEVICE_BACKEND_AUTOLOAD=1` makes `import torch` automatically import out-of-tree backend extensions. The Demucs path imports torch as part of model loading, so inherited process state can expand the code-import surface before BandScope has admitted the checkpoint.

Neither variable is model evidence. An inherited shell, launcher, test harness, or host environment must not be able to weaken BandScope's local model-admission boundary.

## Constraints

- The Draft `htdemucs` path is CPU-oriented and does not require out-of-tree backend autoload.
- BandScope must not mutate the parent process environment as a hidden compatibility workaround.
- The compatibility path must fail closed before importing Demucs/torch when a documented unsafe environment control is active.
- Failure must use the existing bounded local-model-unavailable diagnostic and must not reveal loader internals.
- A future accelerator/backend design must be explicit, packaged, versioned, and admitted by Distribution rather than enabled through inherited autoload state.
- These runtime controls do not establish commercial model rights, immutable artifact provenance, or scientific acceptance. #1180 and #1181 retain those owner boundaries.

## RED evidence

Commit `3ae3646087f6fe2ae6a9aa709025720fc40beb6c` sets each documented truthy form of `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD` and requires the Demucs resolver call count to remain zero. The predecessor entered `get_model`, so the upstream implicit `torch.load` could observe the downgrade. Fix `0d9fb9f983a093fe3868106945677dfa58d10bba` followed immediately; no hosted RED-failure receipt is claimed for the intermediate head.

Commit `4d0b16b6ace0bad9ef5b91fc996034b1ae4001c8` sets `TORCH_DEVICE_BACKEND_AUTOLOAD=1` and requires the model resolver call count to remain zero. PyTorch documents that this value causes out-of-tree backend extensions to be imported when `torch` is imported. The predecessor had no pre-import guard for this environment control. Fix `000fdb57e212be5f08a328bb677be4e0ae1ebb24` followed immediately; no hosted RED-failure receipt is claimed for the intermediate head.

## Selected repair

The Signal/MIR loader checks the two documented unsafe inherited environment conditions before importing `demucs.pretrained`:

- documented truthy `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD` values are rejected case-insensitively;
- `TORCH_DEVICE_BACKEND_AUTOLOAD=1` is rejected exactly as documented by PyTorch.

The repair does not clear or rewrite global environment variables, monkeypatch PyTorch, enable a different backend, broaden remote resolution, or change the existing private checkpoint snapshot. It simply refuses to enter the third-party loader when inherited runtime state would widen the code-execution surface.

## Alternatives considered

### Delete the environment variables inside BandScope

Rejected. Mutating process-global environment is surprising stateful behavior and can race with other code in the process. The local compatibility path does not own the user's shell or parent launcher configuration.

### Permit backend autoload because the current model uses CPU

Rejected. CPU use makes the autoload unnecessary, not safe. Automatic import of installed out-of-tree backend extensions expands the execution surface without contributing to BandScope's current CPU inference contract.

### Depend on PyTorch's safer defaults

Rejected. PyTorch explicitly documents environment controls that alter those defaults. A security boundary that can be reversed by inherited process state is not a stable BandScope invariant.

### Add an implicit accelerator fallback

Rejected. Accelerator support must be explicit and reproducible across supported platform packages. An inherited environment flag is not a versioned capability contract and cannot substitute for CPU/MLX/CUDA/OpenCL parity evidence.

## Security Notes

### Attack surface

The attack surface includes BandScope's analysis child process, inherited environment variables, Python module import, installed PyTorch out-of-tree backend extensions, Demucs model resolution, and native checkpoint deserialization.

### Trust boundary

The analysis child process may inherit ordinary environment state, but that state is not trusted to authorize broader Python/native code loading. Signal/MIR owns the fail-closed pre-import compatibility guard. Distribution owns which backends, model artifacts, loader versions, signatures, and package contents are admitted in a commercial release.

### Realistic threats

- a parent launcher sets `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD`, causing an implicit Demucs `torch.load` to fall back to unrestricted pickle;
- a parent launcher sets `TORCH_DEVICE_BACKEND_AUTOLOAD=1`, causing `import torch` to import installed out-of-tree backend extensions before model admission;
- a compatibility workaround becomes an undocumented production dependency and later differs across Windows/macOS packages;
- a bounded local-model failure leaks serialized class or backend implementation details to the buyer.

### Mitigations

- reject documented unsafe environment states before Demucs/torch import;
- keep the existing bounded local-model-unavailable diagnostic;
- do not mutate process-global environment or silently enable another backend;
- preserve the private descriptor-bound local model snapshot and local-only resolver;
- require Distribution-owned explicit backend/model package admission for release behavior;
- require supported-platform tests to exercise negative inherited-environment cases for any retained implicit third-party loader behavior.

### Remaining risk

This guard only covers the documented PyTorch environment controls that materially affect the current local model-loading path. A commercially admitted release still needs a complete environment/package execution model, immutable model provenance, an explicit serialization policy, and isolation/removal conditions for any native checkpoint deserialization. The current upstream pretrained weights also remain commercially blocked by #1181 independent of runtime hardening.

### Test points

- each documented truthy `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD` value fails before resolver/deserialization;
- `TORCH_DEVICE_BACKEND_AUTOLOAD=1` fails before Demucs/torch import and resolver use;
- normal environment state still reaches the existing local-only snapshot path;
- failure text remains the bounded local-model-unavailable diagnostic;
- exact packaged Windows/macOS release tests cover inherited environment downgrade/autoload cases if the native PyTorch loader remains;
- no environment guard is counted as MIR accuracy, real-audio scientific acceptance, or commercial-rights evidence.

## Effect

Inherited PyTorch process state can no longer opt BandScope's Draft local Demucs path into unrestricted implicit pickle loading or automatic import of out-of-tree backend extensions. The loader fails before entering Demucs/torch when either documented widening condition is active. This narrows runtime execution but does not make the upstream checkpoint commercially admissible or scientifically accepted.

## Follow-up

1. #1180 must define the release model/backend environment contract, including negative tests for loader environment downgrades and any intentionally packaged accelerator extensions.
2. Prefer an artifact/loader format with a materially narrower code-execution surface when scientific parity is demonstrated.
3. Keep #1181 as the independent commercial-rights prerequisite for upstream pretrained weights.
4. Run rights-cleared real-audio source-separation acceptance on exact supported Windows/macOS packages under #770 before any release-quality claim.

## References

PyTorch Contributors. (2025, June 17). *Miscellaneous environment variables*. PyTorch documentation. https://docs.pytorch.org/docs/main/miscellaneous_environment_variables.html

PyTorch Contributors. (2026). *Serialization semantics: torch.load with weights_only=True*. PyTorch documentation. https://docs.pytorch.org/docs/stable/notes/serialization.html#torch-load-with-weights-only-true

Meta Platforms, Inc. (2023). *demucs.states: model serialization/loading*. facebookresearch/demucs. https://github.com/facebookresearch/demucs/blob/v4.0.1/demucs/states.py

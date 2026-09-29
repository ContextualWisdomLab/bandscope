# ADR-20260929: Qualify no-OEM separation models without promoting unmeasured weights

Status: Proposed for release; the user has authorized the qualification work.
Owner: BandScope Signal/MIR #828 / #770.
Prerequisites: #1181 rights records; #1180 / #1126 Distribution admission and native release.
Source baseline: develop@314ddeae7b775a4957594b599358c8255617eb2e.
Existing Signal/MIR head before this work: 0ba16b192b66773f52df2af544896e3c2a432142.

## Decision and scope

Use the official Open-Unmix **UMX-HQ**, not the upstream default UMXL, as the first
no-OEM reference adapter. This is an implementation-order decision, not a quality
ranking. The four canonical targets remain vocals, bass, drums and other.

The Zenodo publisher record for UMX-HQ explicitly describes model **weights** and
reports version 1.0.1 with `metadata.license.id = mit-license`. Its public MIT grant
is the model permission basis: a separate OEM contract is not a prerequisite.
Preserve the actual copyright and MIT permission notice in any admitted package.
Internal evidence review is not a request for a new license from the publisher.
This grant does not itself establish rights to an input recording, a benchmark
corpus, every training recording, patents, or an indemnity.

X-UMX-HQ (CC BY 4.0) and official Spleeter four-stem (the authors' paper explicitly
includes pretrained models in MIT distribution) remain independent alternatives.
Do not make paid OEM SDK procurement or a response to a new licensing inquiry a
prerequisite for this no-OEM route. Mega 53 is a separate high-resource extension
candidate, not a four-stem replacement by summing its overlapping targets.

Keep UMXL, unknown mirrors, and unapproved HTDemucs as prohibited automatic
fallbacks. A wrapper's code license does not grant rights to every checkpoint it
can load. Public model permission, byte integrity, scientific validity and
native package acceptance are four independent claims.

## Implemented reference boundary

`services/analysis-engine/tests/open_unmix_candidate.py` is outside the installed
analysis package and is not invoked by normal local analysis.

- It accepts four immutable byte strings plus independently reviewed, exact
  filename/size/full-SHA256 receipts. It performs no filesystem lookup or download.
- All four snapshots are checked before the first model deserialization. The
  64 MiB per-checkpoint reference bound is a safety ceiling, not an exact released
  artifact size and not a relaxation of the unrelated Demucs 128 MiB policy.
- It instantiates `OpenUnmix` and `Separator` directly from the pinned 1.3.0
  reference package. It never calls the pretrained factories or torch.hub.
- Loading is CPU-only, explicit `weights_only=True`, and rejects a nonempty
  process safe-global list. Tensor keys, shapes, dtypes, strided layout and finite
  values must match the constructed model before strict state loading. There is
  no missing-key random initialization, non-strict retry or unrestricted pickle retry.
- Inference requires 44.1-kHz stereo; source order, sample count and float32 finite
  output are checked. It does not silently resample, downmix, pad, clip, reorder,
  fabricate a missing stem, or report a quality score.

A receipt supplied by the same caller as the bytes is a consistency check only.
The caller must obtain it independently through reviewed acquisition. This helper
is not a signature verifier, provenance authority, legal adjudicator or sandbox.
The full upstream checkpoint object graph remains untested until original bytes
are acquired; an exact-key failure must be investigated, not changed to strict=False.

## PyTorch backend-default finding

PyTorch v2.10.0's `_is_device_backend_autoload_enabled()` evaluates
`os.getenv("TORCH_DEVICE_BACKEND_AUTOLOAD", "1") == "1"`. Unset therefore means
**enabled**, not disabled. The adapter requires the exact value `0` before runtime
import. An unset-variable RED was executed and the causal guard repaired.

PyTorch 2.10 also registers three safe-global helpers during import in the observed
reference environment. The reusable loader does not clear another caller's global
state: it rejects nonempty safe globals. The separate architecture-unit smoke
initializes a dedicated interpreter, sets absent backend-autoload configuration
to `0`, imports the fixed runtime, then clears that worker's extra safe globals.
It never widens an allowlist or modifies the desktop host process. An inherited
unsafe override still fails. This is reference-worker isolation, not OS sandboxing.

## Verification and execution

Ordinary dependency-light control tests use doubles only at the optional
third-party runtime boundary; they do not require Open-Unmix in the product lock.

```sh
python -m pytest services/analysis-engine/tests/test_open_unmix_candidate.py -q
python -m coverage run --branch --source=open_unmix_candidate -m pytest services/analysis-engine/tests/test_open_unmix_candidate.py -q
python -m coverage report --fail-under=100
```

The explicit reference-runtime check fails if its required libraries are absent;
it is not a skipped ordinary test and not a pretrained-quality benchmark:

```sh
python -W error services/analysis-engine/tests/run_open_unmix_candidate_smoke.py
```

Observed environment: Linux CPU, Python 3.13.5, Open-Unmix 1.3.0,
PyTorch/torchaudio 2.10.0+cpu, NumPy 2.3.5, pytest 9.0.2, coverage 7.13.3.
58 final control tests passed; the candidate module has 100/100 statements and
34/34 branches covered. The actual-library smoke loaded generated tensor-only
unit checkpoints into all four full-size Open-Unmix architectures and returned
four finite stereo arrays of shape (2, 4410). It also rejected a benign
callable-bearing checkpoint with no unrestricted-load retry.

The generated checkpoint and synthetic samples are **unit fixtures only**. They
are not real audio, pretrained weights, SI-SDR evidence, a throughput benchmark,
release evidence or a replacement for #770. Python socket audit hooks denied
connect/address-resolution/sendto in this smoke; native egress was not sandboxed.

## Outstanding evidence and owner return

The explicit original Zenodo download failed in this environment; git transport
also failed with `Could not resolve host: github.com`. No original UMX-HQ bytes
were acquired or hashed. The accompanying JSON is an acquisition/qualification
record, **not a release manifest or shipped-component inventory**. Its null full
digests must not be represented as verified artifacts. GitHub connector writes
remain available; the source is therefore contributed to the existing #828 lane.

The repository-pinned Ruff 0.15.5 was not installed or in the offline tool cache.
Ruff, full repository tests, dependency audit and native package gates are not
claimed passing by these focused tests. No production dependency, lockfile,
default-model, source audio, updater or release policy is changed.

Continue through the existing owners, without duplicating their implementations:

1. #1180/#1126 acquire the four original files and MIT notice, record source and
   notice bytes/provenance and complete full SHA256/size receipts. Acquisition is
   explicit and separate from inference; no OEM negotiation is needed for MIT use.
2. #828/#770 load those exact receipts in a dedicated worker and measure all four
   named stems on authorized, held-out real multitracks. Keep sample/channel/
   alignment/window settings and track-clustered uncertainty with the result.
   Do not lower acceptance after seeing candidate scores or substitute a vocal-only slice.
3. Compare X-UMX-HQ and Spleeter if necessary; none is a runtime failure fallback.
4. #1180/#1126 implement the production Rust/native or validated export adapter,
   app/model compatibility, SBOM/NOTICE, offline standard-user packaging, signing,
   notarization and rollback. Reference-to-delivery parity is mandatory.
5. Reconcile #828's pre-existing develop conflicts by ordinary ancestry, preserve
   other owners' deltas, and reacquire exact-head CI and independent review. The
   candidate does not authorize merging the parent or closing #1180/#1181.

Python is retained here only as the original ML reference oracle. Production
security and numerical ownership stay in the canonical Rust/native boundaries.
The exception ends when a production adapter has exact-artifact numerical parity
and real-audio acceptance; do not ship a second Python stack from this test code.

## Security Notes

Attack surface: acquired model bytes, caller receipts, deserialization settings,
backend import, dependency code and in-memory decoded audio.

Trust boundary: independently reviewed acquisition -> reference tensor loading ->
Signal/MIR evidence. Distribution keeps filesystem, signatures, release and rollback
authority. An MIT field and a checksum are not substitutes for that authority.

Mitigations: fixed UMX-HQ filenames and complete target set, immutable snapshots,
full-digest consistency, bounded blobs/audio, pre-import environment rejection,
empty safe-global requirement, tensor-only state and exact output checks,
no model factories/downloads/fallbacks, generic error codes and separate unit evidence.

Remaining risk: original artifact compatibility and provenance are unverified;
weights-only loading does not eliminate denial of service or native-runtime bugs;
no OS sandbox, native egress control, package signing, quality or performance claim.
Raw audio is caller-owned and not logged or persisted by this helper. Only synthetic
unit arrays were processed in this execution. The candidate metadata contains no
input audio, private paths or credentials.

Test points: complete set/filename/hash/size rejection, malformed containers,
strict tensor keys/shapes/dtypes/layout/finite checks, no unrestricted retry,
missing runtime, wrong version, unsafe/unset backend environment, inherited safe
globals, source order, stereo/length/dtype preservation, and bounded inference errors.

## Primary references

Stöter, F.-R., & Liutkus, A. (2019). *Open-Unmix-Pytorch UMX-HQ* (Version 1.0.1)
[Model weights]. Zenodo. https://doi.org/10.5281/zenodo.3370489

UMX-HQ publisher metadata: https://zenodo.org/api/records/3370489

Stöter, F.-R., Uhlich, S., Liutkus, A., & Mitsufuji, Y. (2019). Open-Unmix—A
reference implementation for music source separation. *Journal of Open Source
Software, 4*(41), 1667. https://doi.org/10.21105/joss.01667

PyPI. (2024). *Open-Unmix 1.3.0 distribution metadata*.
https://pypi.org/pypi/openunmix/1.3.0/json

PyTorch Contributors. (2026). *Backend autoload switch* (v2.10.0, torch/__init__.py).
https://github.com/pytorch/pytorch/blob/v2.10.0/torch/__init__.py#L2945-L2959

X-UMX-HQ publisher rights record: https://doi.org/10.5281/zenodo.4740378

Spleeter authors' model-license statement: https://github.com/deezer/spleeter/blob/master/paper.md

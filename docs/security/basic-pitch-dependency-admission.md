# Basic Pitch dependency admission

Admission snapshot: 2026-10-09. Scope: the recording-to-MIDI feature stacked on
[PR #866](https://github.com/ContextualWisdomLab/bandscope/pull/866). The
[design record](../plans/2026-10-09-basic-pitch-midi.md) describes runtime behavior
and the remaining platform/security acceptance work. This record documents an
implementation choice; it does not certify a published desktop release.

## Direct runtime dependencies

| Dependency | Purpose and classification | Source, maintenance, and license | Alternatives and release risk |
| --- | --- | --- | --- |
| `basic-pitch[onnx]==0.4.0` | Runtime: upstream audio windowing, overlap removal, polyphonic note/onset decoding, and pitch-bend extraction | Spotify's [repository at v0.4.0](https://github.com/spotify/basic-pitch/tree/v0.4.0) and [PyPI release](https://pypi.org/project/basic-pitch/0.4.0/), published 2024-08-16. Apache-2.0 code; Spotify's [model card](https://huggingface.co/spotify/basic-pitch) separately identifies the model license as Apache-2.0. The release is old and its default runtime metadata needs the explicit profile below; upstream release age is an ongoing maintenance risk. | Existing monophonic pitch methods do not supply this polyphonic note/bend workflow. The Spotify JS package would add a separate TensorFlow.js/model-loading path to the renderer. Reimplementing the decoder would expand BandScope's maintenance burden. The admitted package version and model bytes must move together in a reviewed change. |
| `onnxruntime==1.30.0`, Intel macOS `==1.23.2` | Runtime: execute only the verified ONNX model with `CPUExecutionProvider` | Microsoft's [ONNX Runtime repository](https://github.com/microsoft/onnxruntime) and official [1.30.0](https://pypi.org/project/onnxruntime/1.30.0/) / [1.23.2](https://pypi.org/project/onnxruntime/1.23.2/) PyPI releases. MIT with bundled third-party notices. The 1.30.0 release includes current model-loading, allocation, and operator-validation hardening. | TensorFlow would introduce an additional heavyweight runtime and incompatible default requirements; CoreML and TFLite would add different platform execution paths. Native runtime wheels increase installer size and require architecture-specific tests. The Intel pin is a wheel-availability compromise, not a security-equivalence claim. |
| `mido==1.3.3` | Runtime: serialize deterministic MIDI ordering and reset pitch-wheel state at note boundaries | [Official project](https://github.com/mido/mido) and [PyPI release](https://pypi.org/project/mido/1.3.3/), published 2024-10-25; MIT. Its stable release and narrow API are used with an exact pin. Release age still warrants maintenance review. | Pretty MIDI's default writer alone does not provide this explicit same-tick ordering policy. A custom SMF encoder adds avoidable protocol code. Mido is also required by the admitted Pretty MIDI dependency; making the direct use explicit adds no second MIDI stack. No device-port, networking, or playback-backend extras are selected. |
| Rust `base64 = "=0.22.1"` | Runtime: decode the bounded, verified MIDI draft once at native cache publication | Marshall Pierce's [official crate source](https://docs.rs/crate/base64/0.22.1/source/Cargo.toml), linked to `marshallpierce/rust-base64`; MIT OR Apache-2.0. The [crates.io version metadata](https://crates.io/api/v1/crates/base64/0.22.1) reports release 2024-04-30 and not yanked at review. The release's age warrants continued maintenance monitoring; this record does not assert current maintainer response capacity. | Reusing the codec already in the native dependency graph avoids a handwritten base64 parser. Retaining renderer-selected bytes or a Blob download would not supply native ownership of the save operation. The crate supplies decoding, not file authority; export bounds and destination consent remain BandScope responsibilities. |

These dependencies remain under their own licenses; BandScope's MIT license does
not replace them. The model license is recorded separately from the code
license. Neither license authorizes redistribution of the player's recording or
the upstream training/test datasets.

### Native export crate scope

The `base64` archive is 81,597 bytes, requires Rust 1.48 or later, and has no
normal or build dependencies; default `std` enables only `alloc`. Its SHA-256 is
`72b3254f16251a8381aa12e40e3c4d2f0199f8c6508fbecb9d91f575e0fbb8c6`.
The root `Cargo.lock` adds this one package. The native desktop lock already
contains the identical version/checksum and gains only the core dependency
edge; no existing Rust package/version identities change. Both locks and the
Rust SBOM remain required. Retain the crate's
[MIT](https://docs.rs/crate/base64/0.22.1/source/LICENSE-MIT) and
[Apache-2.0](https://docs.rs/crate/base64/0.22.1/source/LICENSE-APACHE) license
material with the corresponding release notices; there is no model or binary
outside the package graph to add to the supplemental model inventory.

On 2026-10-09, an OSV query to `https://api.osv.dev/v1/query` for ecosystem
`crates.io`, package `base64`, version `0.22.1` returned `{}`. The historical
[RUSTSEC-2017-0004](https://rustsec.org/advisories/RUSTSEC-2017-0004.html)
encoding overflow is patched in `>=0.5.2`, so this pin is outside its affected
range. This dated observation does not replace current whole-lock audits.

Native publication validates the encoded length before allocating decoded
bytes, then admits a MIDI of at most 256 KiB. The renderer's save argument is
only a bounded exact-cache comparison value. `TranscriptionExportState` owns
the verified bytes and a single active save lease; the native OS chooser owns
the destination. The plan records cache retention, temporary-write cleanup,
and the remaining target-platform save checks. This adds no native runtime,
download path, or new advisory exception.

## Exact installation profile

The source of truth is `services/analysis-engine/pyproject.toml` plus its committed
`uv.lock`. The profile requires **uv 0.12.23 exactly**. Both the required-version
setting and the CI resolver pins must retain that contract until a later
resolver change is reviewed.

Basic Pitch 0.4.0 declares multiple runtime dependencies even when its `onnx`
extra is selected. Its package/version-scoped exclusion removes only
`tensorflow`, `tensorflow-macos`, `coremltools`, and `tflite-runtime` from that
package's declared dependency edges. The ONNX extra and explicit runtime pins
remain active. This is a runtime-selection decision, not an advisory ignore.
The scoped form is documented in the [official uv settings reference](https://docs.astral.sh/uv/reference/settings/#exclude-dependencies).

An actual local uv 0.8.6 check warned that `exclude-dependencies` was an unknown
field despite returning exit code zero. Therefore an old resolver must not be
accepted merely because its command exits successfully. Plain `pip install`
does not implement this uv profile and is not an equivalent installation path.

`pip-audit --local --strict` audits installed distributions; its strict flag
fails dependency collection errors. It does not implement `pip check`'s missing
`Requires-Dist` validation. A separate `pip check` can report Basic Pitch's
intentionally excluded alternative runtimes. Do not silence vulnerability
findings or weaken the synced-environment audit because of this metadata issue.
See the [official pip-audit dependency source](https://github.com/pypa/pip-audit/blob/main/pip_audit/_dependency_source/pip.py)
and [CLI](https://github.com/pypa/pip-audit/blob/main/pip_audit/_cli.py).

## Transitive footprint and compatibility

The admission lock snapshot adds 13 package/version entries representing 12
projects to the #866 base lock: Basic Pitch, two ONNX Runtime versions, Mido,
Pretty MIDI, mir_eval, resampy, flatbuffers, protobuf, coloredlogs, humanfriendly,
importlib-resources, and six. The two ONNX versions are selected by disjoint
platform markers. NumPy, librosa, SciPy, scikit-learn, Numba, and the existing
analysis stack are shared dependencies, not duplicate bundled stacks.

The comparison preserves all 91 existing package/version identities, with no
removed package or existing version bump. It is not a literal append-only lock
diff: uv lock revision changes from 2 to 5, resolution markers split the Intel
macOS runtime branch, the exclusion manifest is added, project dependency
metadata changes, and existing `cuda-toolkit`, `standard-aifc`, and
`standard-sunau` dependency markers are normalized. Five Intel macOS wheel records
for MarkupSafe 3.0.3 are pruned; the hashes of its retained wheel records do not
change. Those metadata/artifact changes must remain visible in dependency review
even though the existing package versions are unchanged.

The Basic Pitch wheel is 758,279 bytes and Mido's wheel is 54,614 bytes. ONNX
Runtime's native wheel is the main added platform-dependent cost; the full
installed footprint and final installer sizes still need release measurements.
Per-wheel URLs, sizes, and hashes are in `uv.lock`.

The lock retains librosa 0.11.0, Numba 0.62.1, and NumPy 2.3.5.
[librosa 0.11.0 supports NumPy 2](https://librosa.org/doc/0.11.0/changelog.html),
but Numba 0.62.1 requires NumPy below 2.4. Basic Pitch and the selected ONNX
Runtime packages do not themselves impose that upper bound. Preserve the full
resolved constraint set when updating the profile.

| Official CPython 3.12 ONNX wheel | Selected version | Verified wheel availability; feature execution still pending |
| --- | --- | --- |
| Windows amd64 | 1.30.0 | `win_amd64` |
| Windows arm64 | 1.30.0 | `win_arm64` |
| macOS arm64 | 1.30.0 | `macosx_14_0_arm64` |
| macOS Intel | 1.23.2 | `macosx_13_0_x86_64` |

ONNX Runtime 1.30.0 does not publish an Intel macOS wheel. The selected Intel
1.23.2 release has CPython 3.12/3.13 wheels but no 3.14 wheel. The native dependency
closure is a separate constraint: Numba 0.62.1 lacks a Windows ARM64 wheel, and
upgrading to Numba 0.66.0 also loses Intel macOS wheel availability. Do not present
an ONNX wheel table as evidence that all four complete application builds work.
All four platform build gates remain mandatory.

## Known security signals

On 2026-10-09, direct PyPI version JSON queries for the admitted packages were
used for the known-vulnerability review; the exact results are retained in
`supply-chain/third-party/basic-pitch-0.4.0/provenance.json`. ONNX Runtime 1.30.0
and 1.23.2 also returned no matching advisories from the OSV PyPI version query.
This is a dated feed observation, not proof of absence of vulnerabilities, and
does not replace the repository's current complete-environment gates.

The [1.30.0 release notes](https://github.com/microsoft/onnxruntime/releases/tag/v1.30.0)
describe model-graph depth restrictions, external-data path handling, checked
allocation arithmetic, and shape/rank validation. Intel 1.23.2 does not inherit
all later hardening. Restricting inference to the exact bundled model snapshot
reduces exposure to arbitrary graphs, but the native runtime and media decoder
still require security updates and platform testing. No new vulnerability
exception or scanner suppression is admitted by this feature.

## Model materials and notice preservation

The active ONNX is recorded in
`supply-chain/supplemental-component-inventory.json`. Its entry links the exact
wheel, immutable upstream tag commit, model size/hash, verification function,
and the per-file wheel asset inventory. The latter also records the inactive
TensorFlow, CoreML, and TFLite representations still carried by the unmodified
wheel. Excluding runtime dependencies does not remove those files.

`supply-chain/third-party/basic-pitch-0.4.0/LICENSE` and `NOTICE` are byte-for-byte
copies of the installed, lock-pinned wheel notices. Keep them with redistributed
model/package material, including when a packager strips distribution metadata.
Retain `onnxruntime/LICENSE`, `onnxruntime/ThirdPartyNotices.txt`, Mido's license,
and all other installed dependency notices in release packaging as well. A
repository notice copy and a source-tree SBOM alone do not prove that a final
desktop artifact contains these materials; inspect the artifacts before release.

The Basic Pitch NOTICE mentions TensorFlow and the CC-BY-4.0 Vocadito test audio.
It is preserved verbatim. Those lines are upstream attribution, not evidence
that excluded TensorFlow code executes in this profile or that BandScope ships
the Vocadito recordings.

### Current installer packaging gap

**Installer offline execution is BLOCKED by the current packaging path.**
`apps/desktop/src-tauri/tauri.conf.json` contains no Python resource or external
binary collection rule. `build-baseline.yml` installs the engine into the CI
checkout and builds Tauri installers; `package_desktop_artifact.py` only copies
and hashes those installers. No inspected script stages the analysis interpreter,
installed Python modules, Basic Pitch models, or notices into the app resources.
This is a repo-controlled `FAILED` release-readiness condition, not an assertion
of missing GitHub permissions or an artifact test that simply has not run.

The Hatch package rule covers `src/bandscope_analysis`, so the new transcription
modules are within the Python package scope. That rule does not embed the Python
package or its dependencies in the desktop installer. Development execution uses
the installed checkout engine with `BANDSCOPE_ANALYSIS_PYTHON`; the native launcher
also searches app-adjacent runtime directories, but the current packaging scripts
do not populate them. Completing delivery requires the runtime/model packaging
owner to supply that path and verify it on installed Windows/macOS apps.

Retain Basic Pitch distribution metadata as well as its model and notices:
`_verified_model_bytes` uses `importlib.metadata.distribution("basic-pitch")` to
check version and locate the ONNX. Copying only the ONNX or stripping that
metadata without an equivalent supported packaging arrangement would make the
model unavailable. No final installer contents were inspected in this review.

## Supply-chain evidence and required gates

| Control | Repository evidence and required interpretation |
| --- | --- |
| PR dependency/security review | Organization-owned `ContextualWisdomLab/.github/.github/workflows/security-scan.yml`; the Security Scan job owns OSV, dependency review, and Trivy on every PR base, including this stack. Do not create a bypass for the stack. |
| Local/trusted-branch audit | `.github/workflows/security-audit.yml`, job `security-backstop`; synced uv environment and `pip-audit --local --strict`, alongside the existing ecosystem checks |
| Inventory and SBOM | `.github/workflows/sbom.yml`, jobs `supply-chain-inventory` and `sbom`; `CycloneDX JSON`, Actions artifacts `bandscope-sbom` and `bandscope-supply-chain-inventory` |
| Release retention | `.github/workflows/build-baseline.yml`; release SBOM and inventory retained in `bandscope-release-sbom-<sha>` and attached with the validated artifact set before draft release publication; artifact retention duration follows the existing workflow/repository setting |
| Platform gates | `.github/workflows/build-baseline.yml`; `gate / build / windows` and `gate / build / macos`, each representing both required architectures |
| Feature native checks | `.github/workflows/basic-pitch-midi.yml`; actual Windows/macOS Tauri shell compilation and transcription checks must supply CI results in addition to local core tests |
| Required contexts for `main` and `develop` | `docs/security/github-required-checks.md`; both branches retain `ci / build-and-test`, `dependency-review`, `sbom`, the two platform gates, `trivy-fs`, and CodeQL contexts; `develop` has the additional documented contexts |
| Dependabot baseline | `.github/dependabot.yml` has weekly npm, pip, cargo, and GitHub Actions coverage targeting `develop`. Alerts, security updates, dependency graph, and supported dependency submission remain required GitHub settings. Live setting activation was not revalidated in this document task. |

No Windows/macOS run, final feature-head Security Scan, released SBOM, release
artifact notice inspection, or live GitHub protection/settings check is claimed
by this admission snapshot. Record actual results in the PR before declaring
the corresponding control satisfied. A missing or incompatible repo-controlled
artifact is `FAILED`; a verified permissions/auth/network/platform inability is
`BLOCKED`, as defined by the dependency policy.

## Security Notes

### Attack surface

New package/model bytes and native inference code join the installed application.
The native export core adds bounded base64 decoding, cached MIDI bytes, a save
identity IPC, and a write to the destination chosen in the OS dialog.

### Trust boundary

Locked installation and release packaging supply the only accepted model;
the renderer and player-selected audio cannot choose another model or runtime.
The renderer also cannot choose a save path or supply replacement MIDI bytes:
native code retains and matches the already verified draft before opening the
destination chooser.

### Realistic threats

Tampered packages/models, an ignored resolver profile, missing license material,
an unpatched native runtime, or an unsupported architecture can invalidate the
intended release behavior. An unbounded codec input, stale draft identity, or
incomplete destination write could break the native export contract.

### Mitigations

Exact package/resolver pins, scoped runtime exclusions, per-wheel lock hashes,
runtime model hashing, retained upstream notices, artifact inventory, and all
existing review/audit/SBOM/platform gates remain required.
Bound before decoding, verify the native MIDI structure, compare the save
identity exactly, hold a single immutable save snapshot, and use an exclusive
same-directory stage followed by file synchronization and rename. The native
command reports chooser cancellation separately from confirmed completion.

### Remaining risk

Feed coverage is incomplete; Intel macOS uses an older runtime. Neither package
metadata nor local Linux testing proves Windows/macOS packaging or performance.
The native MIDI cache persists until replacement or app exit, and failed stage
cleanup can leave derived music on disk. Parent-directory rename durability
after power loss is not established by synchronizing only the staged file.

### Test points

Run frozen lock/profile validation with uv 0.12.23, current installed-environment
audit, model-integrity failure tests, notice/asset hash verification, the plan's
boundary and native export tests, current Rust whole-lock audits, and all four
packaged-platform checks before release.

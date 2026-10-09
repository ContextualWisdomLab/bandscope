# Basic Pitch 0.4.0 model materials

This directory retains the upstream notices and a per-file provenance record for
the Basic Pitch wheel used by BandScope recording-to-MIDI drafts. Model binaries
are installed from the locked wheel; they are not vendored in this directory.

## Source and identity

- Package: [`basic-pitch==0.4.0`](https://pypi.org/project/basic-pitch/0.4.0/),
  published by the Spotify Basic Pitch project.
- Immutable source: [v0.4.0 commit
  `9991303bba609a3b93089d13ec80d1d495083596`](https://github.com/spotify/basic-pitch/tree/9991303bba609a3b93089d13ec80d1d495083596).
- Wheel: `basic_pitch-0.4.0-py2.py3-none-any.whl`, 758,279 bytes;
  SHA-256 `738adb503aae7fdfc7d1e1511aa0ce35052315f260a19531ef4c356708425db0`.
  The exact HTTPS URL is in [provenance.json](provenance.json) and
  `services/analysis-engine/uv.lock`.
- Active model: `basic_pitch/saved_models/icassp_2022/nmp.onnx`, 230,444 bytes;
  SHA-256 `2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec`.
- Code license: Apache-2.0. Model license: Apache-2.0, independently identified
  by [Spotify's model card](https://huggingface.co/spotify/basic-pitch).

The wheel retains eight model/metadata files totaling 2,012,735 bytes after
decompression: the active ONNX file and seven inactive TensorFlow SavedModel,
CoreML package, and TFLite files. `provenance.json` records every path, byte count,
and SHA-256. The
[supplemental component inventory](../../supplemental-component-inventory.json)
also embeds the inactive-asset records so the release inventory explains their
presence without requiring a model binary in Git.

## Notice preservation

[LICENSE](LICENSE) and [NOTICE](NOTICE) are unchanged, byte-for-byte copies from
`basic_pitch-0.4.0.dist-info` in the installed lock-pinned wheel. Their sizes,
digests, original locations, and retained locations are recorded in
`provenance.json`. Do not edit the upstream notice to describe BandScope's
configuration; use this README or the admission record instead.

Keep these license/notice materials with any redistributed package/model. If a
desktop packager strips `.dist-info`, retain an accessible equivalent copy with
the packaged third-party notices. This repository copy is a preservation source,
not evidence that a final installer already includes it. Release inspection
must verify the actual packaged notice material and model identity.

The upstream NOTICE mentions TensorFlow and Vocadito test audio licensed under
CC-BY-4.0. The version-scoped ONNX profile excludes alternative runtime
dependencies; preserving their upstream attribution does not activate them.
The installed `saved_models` inventory contains no Vocadito recordings, and
this record grants no rights to training/test datasets or player audio.

The separately installed ONNX Runtime and MIDI libraries keep their own licenses
and third-party notices. In particular, ONNX Runtime's license files live inside
its `onnxruntime` package directory, not its `.dist-info` directory. Retain
`onnxruntime/LICENSE` and `onnxruntime/ThirdPartyNotices.txt` when packaging it.

## Runtime admission

`basic_pitch_backend._verified_model_bytes` requires distribution version 0.4.0,
reads at most the fixed model size plus one probe byte, and checks both length
and the hard-coded SHA-256. `_load_session` consumes those same bytes with the
CPU execution provider. The inactive representations are never selected by this
feature. Runtime exclusions do not strip their bytes from the wheel.

Any package/model update requires a reviewed lock change, fresh per-file
provenance and notices, synchronized runtime identity constants, and the
existing dependency/security/SBOM/platform checks. Packaging that removes an
inactive representation must update both this record and the release inventory;
do not report removed assets while still distributing the unmodified wheel.

## Security Notes

### Attack surface

Installed package/model files and release notice/provenance material.

### Trust boundary

The locked distribution supplies model bytes; user audio and renderer payloads
cannot choose a model or alter the expected digest.

### Realistic threats

Artifact substitution, mismatch between packaging and the inventory, or loss of
upstream notices during distribution-metadata stripping.

### Mitigations

Exact wheel and model identities, per-file inventory, unchanged notice copies,
runtime byte verification, and final release artifact inspection.

### Remaining risk

A dated checksum/feed observation is not a security audit or proof of platform
execution. This task has not verified a Windows/macOS release artifact.

### Test points

Compare all installed/packaged asset and notice sizes/digests with
`provenance.json`; test the runtime's missing/wrong-version/wrong-size/wrong-hash
failures; retain the SBOM and supplemental inventory with the final release.
See the [dependency admission record](../../../docs/security/basic-pitch-dependency-admission.md)
and [feature design](../../../docs/plans/2026-10-09-basic-pitch-midi.md).

"""Edge regressions for fail-closed Resource Admission coverage."""

from __future__ import annotations

import io
import json
from pathlib import Path

import numpy as np
import pytest

from bandscope_analysis import api, audio_decode, cli, feature_cache_generation
from bandscope_analysis.audio_resource_policy import (
    AudioResourcePolicy,
    AudioResourcePolicyError,
)


_SOURCE_SHA256 = "ab" * 32


def _cached_metadata(stem_keys: object) -> dict[str, object]:
    """Return a minimally valid sidecar except for the supplied stem-key shape."""
    return {
        "schemaVersion": api.FEATURE_CACHE_SCHEMA_VERSION,
        "sampleRate": 44_100,
        "separation": {"duration_seconds": 1.0},
        "stemKeys": stem_keys,
        "stemRoleTypes": {},
    }


def test_normalize_stem_role_types_rejects_wrong_container_and_key_set() -> None:
    """Persisted role metadata must be a dictionary over the exact stem vocabulary."""
    assert api._normalize_stem_role_types(["instrument"], ["bass"]) is None
    assert (
        api._normalize_stem_role_types(
            {"bass": "instrument", "drums": "instrument"}, ["bass"]
        )
        is None
    )


@pytest.mark.parametrize("stem_keys", [None, [], [""]])
def test_cached_feature_loader_rejects_missing_or_blank_stem_keys(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    stem_keys: object,
) -> None:
    """A cache sidecar cannot authorize an absent, empty, or blank stem identity."""
    monkeypatch.setattr(
        api,
        "read_bounded_feature_cache_metadata",
        lambda *_args, **_kwargs: _cached_metadata(stem_keys),
    )
    monkeypatch.setattr(
        api,
        "load_bounded_stem_archive",
        lambda *_args, **_kwargs: pytest.fail("archive replay must not run"),
    )

    assert (
        api._load_cached_local_audio_features(
            tmp_path / "fixture.features.json",
            tmp_path / "fixture.features.npz",
        )
        is None
    )


def test_feature_store_rejects_uncommittable_generation_manifest(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """A source-scoped generation is not published when its commit marker cannot be built."""
    cache_root = (
        tmp_path
        / "cache"
        / "source-sha256-v1"
        / _SOURCE_SHA256
        / "analysis-cache-v1"
    )
    metadata_path = cache_root / "fixture.features.json"
    arrays_path = cache_root / "fixture.features.npz"
    request = {
        "sourceKind": "local_audio",
        "sourceLabel": "rehearsal.wav",
        "roleFocus": [],
        "projectId": "project-1",
        "localSource": {
            "sourcePath": "/app-owned/project/source.wav",
            "fileName": "rehearsal.wav",
            "extension": "wav",
            "fileSizeBytes": 4096,
        },
    }
    features = {
        "stems": {"bass": np.array([0.0, 0.25], dtype=np.float32)},
        "sr": 44_100,
        "stem_role_types": {"bass": "instrument"},
        "separation": {
            "duration_seconds": 2 / 44_100,
            "chunk_count": 1,
            "notes": "bounded",
        },
    }
    monkeypatch.setattr(api, "build_generation_manifest", lambda *_args: None)

    assert not api._store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        request,
        features,
    )
    assert not metadata_path.exists()
    assert not arrays_path.exists()
    assert not metadata_path.with_suffix(".manifest.json").exists()


def test_decode_preserves_policy_rejection_from_decoder(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A typed resource rejection raised by the decoder boundary retains its reason."""
    rejection = AudioResourcePolicyError("duration_exceeded")

    def reject_decode(*_args: object, **_kwargs: object) -> tuple[np.ndarray, int]:
        raise rejection

    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(audio_decode.librosa, "load", reject_decode)

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(io.BytesIO(b"container"))

    assert caught.value is rejection


def test_decode_redacts_unexpected_decoded_validation_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Unexpected validator details remain behind the payload-safe malformed-header error."""
    secret_detail = "/private/rehearsal/source.wav validation exploded"
    monkeypatch.setattr(audio_decode, "preflight_audio_metadata", lambda *_args: None)
    monkeypatch.setattr(
        audio_decode.librosa,
        "load",
        lambda *_args, **_kwargs: (np.array([0.1], dtype=np.float32), 44_100),
    )

    def fail_validation(
        _self: AudioResourcePolicy,
        _decoded: object,
        _sample_rate: object,
    ) -> np.ndarray:
        raise RuntimeError(secret_detail)

    monkeypatch.setattr(AudioResourcePolicy, "validate_decoded_audio", fail_validation)

    with pytest.raises(AudioResourcePolicyError) as caught:
        audio_decode.decode_mono_audio(io.BytesIO(b"container"))

    assert caught.value.reason == "malformed_header"
    assert secret_detail not in str(caught.value)
    assert isinstance(caught.value.__cause__, RuntimeError)


def test_cache_namespace_binding_leaves_non_mapping_request_untouched() -> None:
    """The CLI cache binder has no authority over a non-request object."""
    request = object()

    assert cli._bind_verified_source_cache_namespace(request, None) is request


def test_cli_rejects_non_string_requested_at_before_request_execution(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Malformed timestamp authority fails before the analysis request can execute."""
    payload = {"jobId": "job-1", "requestedAt": 7, "request": {}}
    stdout = io.StringIO()
    monkeypatch.setattr(cli.sys, "argv", ["bandscope-analysis"])
    monkeypatch.setattr(cli.sys, "stdin", io.StringIO(json.dumps(payload)))
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 0
    response = json.loads(stdout.getvalue())
    assert response["state"] == "failed"
    assert response["error"]["message"] == (
        "Invalid analysis job request: invalid field 'requestedAt'"
    )


def test_file_sha256_returns_none_when_artifact_cannot_be_opened(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Hashing failure is a cache miss and does not surface local path details."""

    def fail_open(_path: Path, *_args: object, **_kwargs: object) -> object:
        raise OSError("/private/cache/secret.features.npz unavailable")

    monkeypatch.setattr(Path, "open", fail_open)

    assert feature_cache_generation.file_sha256(tmp_path / "secret.features.npz") is None


def test_generation_manifest_builder_rejects_invalid_source_and_missing_artifacts(
    tmp_path: Path,
) -> None:
    """A manifest requires canonical source identity and both staged artifacts."""
    metadata_path = tmp_path / "missing.features.json"
    arrays_path = tmp_path / "missing.features.npz"

    assert (
        feature_cache_generation.build_generation_manifest(
            metadata_path,
            arrays_path,
            "not-a-digest",
        )
        is None
    )
    assert (
        feature_cache_generation.build_generation_manifest(
            metadata_path,
            arrays_path,
            _SOURCE_SHA256,
        )
        is None
    )


@pytest.mark.parametrize(
    "payload",
    [
        None,
        {"schemaVersion": 1},
        {
            "schemaVersion": 2,
            "sourceSha256": _SOURCE_SHA256,
            "metadataSha256": "11" * 32,
            "archiveSha256": "22" * 32,
        },
        {
            "schemaVersion": 1,
            "sourceSha256": "cd" * 32,
            "metadataSha256": "11" * 32,
            "archiveSha256": "22" * 32,
        },
        {
            "schemaVersion": 1,
            "sourceSha256": _SOURCE_SHA256,
            "metadataSha256": "invalid",
            "archiveSha256": "22" * 32,
        },
        {
            "schemaVersion": 1,
            "sourceSha256": _SOURCE_SHA256,
            "metadataSha256": "11" * 32,
            "archiveSha256": "invalid",
        },
    ],
)
def test_generation_manifest_reader_rejects_malformed_commit_markers(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    payload: object,
) -> None:
    """Malformed, cross-source, or incomplete markers never authorize persisted stems."""
    monkeypatch.setattr(
        feature_cache_generation,
        "read_bounded_feature_cache_metadata",
        lambda *_args, **_kwargs: payload,
    )

    assert (
        feature_cache_generation.read_generation_manifest(
            tmp_path / "fixture.features.json",
            _SOURCE_SHA256,
        )
        is None
    )


def test_generation_manifest_reader_rejects_invalid_requested_source(
    tmp_path: Path,
) -> None:
    """An invalid requested source digest is rejected before manifest I/O."""
    assert (
        feature_cache_generation.read_generation_manifest(
            tmp_path / "fixture.features.json",
            "INVALID",
        )
        is None
    )

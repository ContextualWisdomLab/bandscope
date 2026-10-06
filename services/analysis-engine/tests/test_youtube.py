"""Tests for YouTube import capabilities."""

import hashlib
import importlib
import os
import ssl
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import yt_dlp  # type: ignore

from bandscope_analysis.youtube import (
    MAX_YOUTUBE_URL_LENGTH,
    _verify_executable_artifact,
    download_youtube_audio,
    validate_url,
)


@pytest.mark.parametrize("path_kind", ["parent_posix", "parent_windows", "outside"])
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_real_output_guard_denial(
    mock_ydl_class: MagicMock,
    path_kind: str,
    output_root: Path,
    tmp_path: Path,
) -> None:
    """Keep intentional escapes separate from legitimate downloader fixtures."""
    from bandscope_analysis import youtube

    outside = tmp_path / "outside"
    outside.mkdir()
    sentinel = outside / "sentinel.webm"
    sentinel.write_bytes(b"untouched outside sentinel")
    if path_kind == "parent_posix":
        out_dir = "../outside"
    elif path_kind == "parent_windows":
        out_dir = r"..\outside"
    else:
        out_dir = str(outside)
    with patch.object(
        youtube, "_resolve_output_directory", wraps=youtube._resolve_output_directory
    ) as resolve_spy:
        result = download_youtube_audio(
            "https://youtube.com/watch?v=abc123DEF45",
            out_dir,
            allowed_output_root=str(output_root),
        )
        resolve_spy.assert_called_once_with(out_dir, str(output_root))
    assert result == {
        "ok": False,
        "error": {
            "code": "invalid_output_directory",
            "message": "The local download directory failed safety validation.",
        },
    }
    mock_ydl_class.assert_not_called()
    assert sentinel.read_bytes() == b"untouched outside sentinel"


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_real_prepared_path_denial(
    mock_ydl_class: MagicMock, output_root: Path, tmp_path: Path
) -> None:
    """Run the real produced-path guard without reading or deleting an outside file."""
    from bandscope_analysis import youtube

    outside = tmp_path / "outside.webm"
    outside.write_bytes(b"untouched outside sentinel")
    mock_ydl = mock_ydl_class.return_value.__enter__.return_value
    mock_ydl.extract_info.return_value = {"id": "abc123DEF45", "duration": 60}
    mock_ydl.prepare_filename.return_value = str(outside)
    with patch.object(
        youtube, "_path_is_within_directory", wraps=youtube._path_is_within_directory
    ) as containment_spy:
        result = download_youtube_audio(
            "https://youtube.com/watch?v=abc123DEF45",
            str(output_root),
            allowed_output_root=str(output_root),
        )
        containment_spy.assert_called_once_with(str(outside), output_root.resolve())
    assert result == {
        "ok": False,
        "error": {
            "code": "invalid_output_directory",
            "message": "The local download directory failed safety validation.",
        },
    }
    assert mock_ydl.extract_info.call_count == 2
    assert outside.read_bytes() == b"untouched outside sentinel"


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_real_symlink_output_denial(
    mock_ydl_class: MagicMock, output_root: Path, tmp_path: Path
) -> None:
    """Reject a direct directory symlink even when its target is owned."""
    from bandscope_analysis import youtube

    link = tmp_path / "download-link"
    try:
        link.symlink_to(output_root, target_is_directory=True)
    except OSError:
        pytest.skip("symlink creation is unavailable on this platform")
    sentinel = output_root / "sentinel.webm"
    sentinel.write_bytes(b"untouched owned sentinel")
    with patch.object(
        youtube, "_resolve_output_directory", wraps=youtube._resolve_output_directory
    ) as resolve_spy:
        result = download_youtube_audio(
            "https://youtube.com/watch?v=abc123DEF45",
            str(link),
            allowed_output_root=str(output_root),
        )
        resolve_spy.assert_called_once_with(str(link), str(output_root))
    assert result["ok"] is False
    assert result["error"]["code"] == "invalid_output_directory"
    mock_ydl_class.assert_not_called()
    assert sentinel.read_bytes() == b"untouched owned sentinel"


def test_validate_url() -> None:
    """Test URL validation."""
    assert validate_url("https://youtube.com/watch?v=abc123DEF45") is True
    assert validate_url("https://youtu.be/abc123DEF45") is True
    assert validate_url("https://www.youtube.com/watch?v=abc123DEF45") is True
    assert validate_url("https://www.youtube.com/watch?v=abc123DEF45&t=10") is True
    url_prefix = "https://youtube.com/watch?v=abc123DEF45&x="
    max_length_url = url_prefix + ("a" * (MAX_YOUTUBE_URL_LENGTH - len(url_prefix)))
    long_query_url = max_length_url + "a"

    assert validate_url(max_length_url) is True
    assert validate_url("https://m.youtube.com/watch?v=abc123DEF45") is False
    assert validate_url("https://music.youtube.com/watch?v=abc123DEF45") is False
    assert validate_url("https://evil.youtube.com/watch?v=abc123DEF45") is False
    assert validate_url("https://youtube.com/watch?v=123") is False
    assert validate_url("https://youtu.be/123") is False
    assert validate_url("http://youtube.com/watch?v=abc123DEF45") is False
    assert validate_url("https://vimeo.com/abc123DEF45") is False
    assert validate_url("https://youtube.com/redirect?q=https://example.com") is False
    assert validate_url("https://www.youtube.com/redirect?q=https://example.com") is False
    assert validate_url("https://youtube.com/watch?v=") is False
    assert validate_url("https://youtu.be/") is False
    assert validate_url("https://youtu.be/abc123DEF45/extra") is False
    assert validate_url("https://youtube.com/watch?v=abc123DEF45&v=def456GHI78") is False
    assert validate_url("https://youtube.com/watch?v=&v=def456GHI78") is False
    assert validate_url("https://youtube.com/watch?v=abc123DEF45&v=") is False
    assert validate_url("https://youtube.com/watch?v=../../../etc/passwd") is False
    assert validate_url("https://youtu.be/../../../etc/passwd") is False
    assert validate_url(long_query_url) is False


def test_validate_url_edge_cases() -> None:
    """Test URL validation edge cases and potential bypasses."""
    # IP address bypass attempts
    assert validate_url("https://127.0.0.1/watch?v=123") is False
    assert validate_url("https://[::1]/watch?v=123") is False

    # User info bypass attempts
    assert validate_url("https://youtube.com@evil.com/watch?v=123") is False
    assert validate_url("https://youtube.com@youtu.be/123") is False
    assert validate_url("https://user:pass@youtube.com/watch?v=123") is False

    # Subdomain/Suffix trickery
    assert validate_url("https://youtube.com.evil.com/watch?v=123") is False
    assert validate_url("https://evil-youtube.com/watch?v=123") is False

    # Path/Query trickery
    assert validate_url("https://evil.com/youtube.com/watch?v=123") is False
    assert validate_url("https://evil.com?youtube.com/watch?v=123") is False
    assert validate_url("https://evil.com#youtube.com/watch?v=123") is False
    assert validate_url("https://youtube.com:443@evil.example/watch?v=abc123DEF45") is False
    assert validate_url("https://youtube.com:444/watch?v=abc123DEF45") is False

    # Allowlist behavior and explicit default ports
    assert validate_url("https://kr.youtube.com/watch?v=abc123DEF45") is False
    assert validate_url("https://youtube.com:443/watch?v=abc123DEF45") is True


def test_download_youtube_audio_invalid_url(output_root: Path) -> None:
    """Test downloading with an invalid URL."""
    result = download_youtube_audio(
        "https://vimeo.com/abc123DEF45", str(output_root), allowed_output_root=str(output_root)
    )
    assert result["ok"] is False
    assert result["error"]["code"] == "unsupported_url"


@pytest.fixture
def output_root(tmp_path: Path) -> Path:
    """Create a caller-owned root without assuming any system temp path."""
    root = tmp_path / "downloads"
    root.mkdir()
    return root


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_success(
    mock_ydl_class: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    output_root: Path,
) -> None:
    """Test successful download."""
    ssl_context = MagicMock()
    ssl_context.get_ca_certs.return_value = [b"managed-ca"]
    monkeypatch.setattr(ssl, "create_default_context", lambda: ssl_context)

    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    mock_info = {
        "id": "abc123DEF45",
        "title": "Test Video",
        "duration": 60,
    }
    mock_ydl.extract_info.return_value = mock_info
    filepath = output_root / "abc123DEF45.webm"
    filepath.write_bytes(b"\x1aE\xdf\xa3synthetic webm fixture")
    mock_ydl.prepare_filename.return_value = str(filepath)

    input_url = "https://youtube.com/watch?v=abc123DEF45"
    from bandscope_analysis import youtube

    with (
        patch.object(
            youtube, "_resolve_output_directory", wraps=youtube._resolve_output_directory
        ) as resolve_spy,
        patch.object(
            youtube, "_path_is_within_directory", wraps=youtube._path_is_within_directory
        ) as containment_spy,
    ):
        result = download_youtube_audio(
            input_url, str(output_root), allowed_output_root=str(output_root)
        )
        resolve_spy.assert_called_once_with(str(output_root), str(output_root))
        assert containment_spy.call_count == 2
        assert all(
            call.args == (str(filepath), output_root.resolve())
            for call in containment_spy.call_args_list
        )

    assert result["ok"] is True
    assert result["metadata"]["id"] == "abc123DEF45"
    assert result["metadata"]["title"] == "Test Video"
    assert result["metadata"]["duration"] == 60
    assert result["metadata"]["filepath"] == str(filepath)

    # Assert that YoutubeDL was initialized with the correct options
    mock_ydl_class.assert_called_once()
    called_opts = mock_ydl_class.call_args[0][0]
    assert called_opts["format"] == "bestaudio/best"
    assert called_opts["quiet"] is True
    assert called_opts["no_warnings"] is True
    assert called_opts["noprogress"] is True
    assert called_opts["noplaylist"] is True
    assert called_opts["geo_bypass"] is False
    assert not called_opts.get("nocheckcertificate", False)
    assert called_opts["outtmpl"] == str(output_root.resolve() / "%(id)s.%(ext)s")
    ssl_context.get_ca_certs.assert_called_once_with(binary_form=True)
    assert called_opts["compat_opts"] == {"no-certifi"}
    assert called_opts["postprocessors"] == [{"key": "FFmpegExtractAudio"}]
    assert "%(id)s.%(ext)s" in called_opts["outtmpl"]

    # Verify extract_info was called twice correctly: once for metadata, once for download
    from unittest.mock import call

    assert mock_ydl.extract_info.call_count == 2
    mock_ydl.extract_info.assert_has_calls(
        [
            call(input_url, download=False),
            call(input_url, download=True),
        ]
    )


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_uses_system_ca_only_when_populated(
    mock_ydl_class: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    output_root: Path,
) -> None:
    """Use OS-managed roots only after confirming the trust store is populated."""
    ssl_context = MagicMock()
    ssl_context.get_ca_certs.return_value = [b"managed-ca"]
    monkeypatch.setattr(ssl, "create_default_context", lambda: ssl_context)
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {"id": "abc123DEF45", "duration": 16 * 60}

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
    )

    assert result["error"]["code"] == "duration_exceeded"
    options = mock_ydl_class.call_args.args[0]
    assert options["compat_opts"] == {"no-certifi"}
    assert not options.get("nocheckcertificate", False)
    ssl_context.get_ca_certs.assert_called_once_with(binary_form=True)


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_keeps_ytdlp_ca_fallback_for_empty_system_store(
    mock_ydl_class: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    output_root: Path,
) -> None:
    """Retain yt-dlp's certifi fallback when no system roots are available."""
    ssl_context = MagicMock()
    ssl_context.get_ca_certs.return_value = []
    monkeypatch.setattr(ssl, "create_default_context", lambda: ssl_context)
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {"id": "abc123DEF45", "duration": 16 * 60}

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
    )

    assert result["error"]["code"] == "duration_exceeded"
    options = mock_ydl_class.call_args.args[0]
    assert "compat_opts" not in options
    assert not options.get("nocheckcertificate", False)


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_keeps_ytdlp_ca_fallback_when_store_probe_fails(
    mock_ydl_class: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    output_root: Path,
) -> None:
    """Treat trust-store probe errors as unavailable roots rather than disabling TLS."""

    def fail_to_create_context() -> ssl.SSLContext:
        raise RuntimeError("host trust store unavailable")

    monkeypatch.setattr(ssl, "create_default_context", fail_to_create_context)
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {"id": "abc123DEF45", "duration": 16 * 60}

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
    )

    assert result["error"]["code"] == "duration_exceeded"
    options = mock_ydl_class.call_args.args[0]
    assert "compat_opts" not in options
    assert not options.get("nocheckcertificate", False)


def _executable_file(path: Path, contents: bytes) -> str:
    """Create a regular executable test artifact and return its SHA-256 digest."""
    path.write_bytes(contents)
    path.chmod(0o700)
    return hashlib.sha256(contents).hexdigest()


def test_media_runtime_executable_identity_requires_typed_pair() -> None:
    """Reject a missing path/digest before attempting filesystem access."""
    assert _verify_executable_artifact(None, None) is None


def _verified_media_runtime(tmp_path: Path, suffix: str | None = None) -> dict[str, str]:
    """Create sibling ffmpeg/ffprobe artifacts and return their exact identities."""
    if suffix is None:
        suffix = ".exe" if os.name == "nt" else ""
    ffmpeg = tmp_path / f"ffmpeg{suffix}"
    ffprobe = tmp_path / f"ffprobe{suffix}"
    return {
        "ffmpeg_path": str(ffmpeg),
        "ffmpeg_sha256": _executable_file(ffmpeg, b"trusted ffmpeg artifact"),
        "ffprobe_path": str(ffprobe),
        "ffprobe_sha256": _executable_file(ffprobe, b"trusted ffprobe artifact"),
    }


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_passes_verified_ffmpeg_path_to_ytdlp(
    mock_ydl_class: MagicMock,
    tmp_path: Path,
    output_root: Path,
) -> None:
    """Verify the complete media executable set before handing it to yt-dlp."""
    suffix = ".exe" if os.name == "nt" else ""
    runtime = _verified_media_runtime(tmp_path, suffix)
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {
        "id": "abc123DEF45",
        "title": "Test Video",
        "duration": 60,
    }
    filepath = output_root / "abc123DEF45.webm"
    filepath.write_bytes(b"\x1aE\xdf\xa3synthetic webm fixture")
    mock_ydl.prepare_filename.return_value = str(filepath)

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
        **runtime,
    )

    assert result["ok"] is True
    options = mock_ydl_class.call_args.args[0]
    assert options["ffmpeg_location"] == str((tmp_path / f"ffmpeg{suffix}").resolve())


@pytest.mark.parametrize(
    "runtime",
    [
        {"ffmpeg_path": "/opt/bandscope/ffmpeg"},
        {"ffmpeg_sha256": "0" * 64},
        {
            "ffmpeg_path": "/opt/bandscope/ffmpeg",
            "ffmpeg_sha256": "0" * 64,
            "ffprobe_path": "/opt/bandscope/ffprobe",
        },
    ],
)
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_rejects_partial_media_runtime_identity(
    mock_ydl_class: MagicMock,
    runtime: dict[str, str],
    output_root: Path,
) -> None:
    """Reject a configured runtime unless all four identity fields are present."""
    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
        **runtime,
    )

    assert result == {
        "ok": False,
        "error": {
            "code": "runtime_dependency_invalid",
            "message": "The configured media runtime failed identity verification.",
        },
    }
    mock_ydl_class.assert_not_called()


@pytest.mark.parametrize("invalid_hash", ["0" * 63, "A" * 64, "not-a-sha256"])
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_rejects_malformed_ffmpeg_hash(
    mock_ydl_class: MagicMock,
    invalid_hash: str,
    tmp_path: Path,
    output_root: Path,
) -> None:
    """Require the canonical full lowercase SHA-256 representation."""
    runtime = _verified_media_runtime(tmp_path)
    runtime["ffmpeg_sha256"] = invalid_hash

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
        **runtime,
    )

    assert result["error"]["code"] == "runtime_dependency_invalid"
    mock_ydl_class.assert_not_called()


@pytest.mark.parametrize("artifact_kind", ["relative", "missing", "directory", "non_executable"])
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_rejects_invalid_ffmpeg_artifact(
    mock_ydl_class: MagicMock,
    artifact_kind: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    output_root: Path,
) -> None:
    """Reject ffmpeg paths that cannot identify a fixed regular executable file."""
    runtime = _verified_media_runtime(tmp_path)
    if artifact_kind == "relative":
        ffmpeg = Path("ffmpeg")
    elif artifact_kind == "missing":
        ffmpeg = tmp_path / "missing-ffmpeg"
    elif artifact_kind == "directory":
        ffmpeg = tmp_path
    else:
        ffmpeg = Path(runtime["ffmpeg_path"])
        permission_spy = MagicMock(return_value=False)
        monkeypatch.setattr(
            "bandscope_analysis.youtube._has_execute_permission",
            permission_spy,
        )

    runtime["ffmpeg_path"] = str(ffmpeg)
    if artifact_kind != "non_executable":
        runtime["ffmpeg_sha256"] = "0" * 64
    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
        **runtime,
    )

    assert result["error"]["code"] == "runtime_dependency_invalid"
    mock_ydl_class.assert_not_called()
    if artifact_kind == "non_executable":
        permission_spy.assert_any_call(ffmpeg.resolve())


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_rejects_symlinked_ffmpeg(
    mock_ydl_class: MagicMock,
    tmp_path: Path,
    output_root: Path,
) -> None:
    """Reject a replaceable symlink at the configured executable boundary."""
    target = tmp_path / "real-ffmpeg"
    expected_hash = _executable_file(target, b"trusted ffmpeg artifact")
    suffix = ".exe" if os.name == "nt" else ""
    ffprobe = tmp_path / f"ffprobe{suffix}"
    ffprobe_hash = _executable_file(ffprobe, b"trusted ffprobe artifact")
    ffmpeg = tmp_path / f"ffmpeg{suffix}"
    try:
        ffmpeg.symlink_to(target)
    except OSError:
        pytest.skip("symlink creation is unavailable on this platform")

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
        ffmpeg_path=str(ffmpeg),
        ffmpeg_sha256=expected_hash,
        ffprobe_path=str(ffprobe),
        ffprobe_sha256=ffprobe_hash,
    )

    assert result["error"]["code"] == "runtime_dependency_invalid"
    mock_ydl_class.assert_not_called()


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_rejects_ffmpeg_hash_mismatch(
    mock_ydl_class: MagicMock,
    tmp_path: Path,
    output_root: Path,
) -> None:
    """Fail closed before yt-dlp when the executable bytes do not match the manifest."""
    runtime = _verified_media_runtime(tmp_path)
    runtime["ffmpeg_sha256"] = "0" * 64

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
        **runtime,
    )

    assert result["error"]["code"] == "runtime_dependency_invalid"
    mock_ydl_class.assert_not_called()


@pytest.mark.parametrize("failure", ["probe_hash", "probe_name", "probe_directory", "ffmpeg_name"])
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_rejects_unverified_executable_set(
    mock_ydl_class: MagicMock,
    failure: str,
    tmp_path: Path,
    output_root: Path,
) -> None:
    """Authenticate every executable yt-dlp may derive from ffmpeg_location."""
    runtime = _verified_media_runtime(tmp_path)
    if failure == "probe_hash":
        runtime["ffprobe_sha256"] = "0" * 64
    elif failure == "probe_name":
        wrong_probe = tmp_path / "media-probe"
        runtime["ffprobe_path"] = str(wrong_probe)
        runtime["ffprobe_sha256"] = _executable_file(wrong_probe, b"trusted probe")
    elif failure == "probe_directory":
        probe_directory = tmp_path / "probe-bin"
        probe_directory.mkdir()
        suffix = ".exe" if os.name == "nt" else ""
        wrong_probe = probe_directory / f"ffprobe{suffix}"
        runtime["ffprobe_path"] = str(wrong_probe)
        runtime["ffprobe_sha256"] = _executable_file(wrong_probe, b"trusted probe")
    else:
        wrong_ffmpeg = tmp_path / "media-converter"
        runtime["ffmpeg_path"] = str(wrong_ffmpeg)
        runtime["ffmpeg_sha256"] = _executable_file(wrong_ffmpeg, b"trusted converter")

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
        **runtime,
    )

    assert result["error"]["code"] == "runtime_dependency_invalid"
    mock_ydl_class.assert_not_called()


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_rejects_case_mismatched_program_names(
    mock_ydl_class: MagicMock,
    tmp_path: Path,
    output_root: Path,
) -> None:
    """Require the exact sibling names yt-dlp derives on the active platform."""
    suffix = ".EXE" if os.name == "nt" else ""
    ffmpeg = tmp_path / f"FFMPEG{suffix}"
    ffprobe = tmp_path / f"FFPROBE{suffix}"
    runtime = {
        "ffmpeg_path": str(ffmpeg),
        "ffmpeg_sha256": _executable_file(ffmpeg, b"trusted ffmpeg artifact"),
        "ffprobe_path": str(ffprobe),
        "ffprobe_sha256": _executable_file(ffprobe, b"trusted ffprobe artifact"),
    }

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
        **runtime,
    )

    assert result["error"]["code"] == "runtime_dependency_invalid"
    mock_ydl_class.assert_not_called()


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_converted_extension(
    mock_ydl_class: MagicMock,
    output_root: Path,
) -> None:
    """Test successful download when the file is converted to another extension."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    mock_info = {
        "id": "abc123DEF45",
        "title": "Test Video",
        "duration": 60,
    }
    mock_ydl.extract_info.return_value = mock_info
    prepared = output_root / "abc123DEF45.webm"
    converted = prepared.with_suffix(".opus")
    converted.write_bytes(b"OggSsynthetic opus fixture")
    mock_ydl.prepare_filename.return_value = str(prepared)
    assert not prepared.exists()
    assert converted.is_file()

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
    )

    assert result["ok"] is True
    assert result["metadata"]["filepath"] == str(converted)


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_file_not_found(
    mock_ydl_class: MagicMock,
    output_root: Path,
) -> None:
    """Test failure when the downloaded file cannot be found."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    mock_info = {
        "id": "abc123DEF45",
        "title": "Test Video",
        "duration": 60,
    }
    mock_ydl.extract_info.return_value = mock_info
    filepath = output_root / "abc123DEF45.webm"
    mock_ydl.prepare_filename.return_value = str(filepath)
    assert not filepath.exists()

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
    )

    assert result["ok"] is False
    assert result["error"]["code"] == "file_not_found"


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_info_none(mock_ydl_class: MagicMock, output_root: Path) -> None:
    """Test when extract_info returns None."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    mock_ydl.extract_info.return_value = None

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
    )

    assert result["ok"] is False
    assert result["error"]["code"] == "download_error"
    assert result["error"]["message"] == (
        "YouTube import failed. Please use a local audio file instead."
    )


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_restricted(mock_ydl_class: MagicMock, output_root: Path) -> None:
    """Test when download fails due to restrictions."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    mock_ydl.extract_info.side_effect = yt_dlp.utils.DownloadError("Sign in to confirm")

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
    )

    assert result["ok"] is False
    assert result["error"]["code"] == "restricted_content"
    assert "restricted" in result["error"]["message"]


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_generic_download_error(
    mock_ydl_class: MagicMock, output_root: Path
) -> None:
    """Test when download fails with a generic error."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    raw_error = (
        "Some random network error for https://youtube.com/watch?v=abc123DEF45"
        " with cookie=secret and /Users/test/local/path"
    )
    mock_ydl.extract_info.side_effect = yt_dlp.utils.DownloadError(raw_error)

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
    )

    assert result["ok"] is False
    assert result["error"]["code"] == "download_failed"
    assert result["error"]["message"] == (
        "Failed to download audio from YouTube. Please use a local audio file instead."
    )
    assert raw_error not in result["error"]["message"]
    assert "cookie=secret" not in result["error"]["message"]
    assert "/Users/test/local/path" not in result["error"]["message"]


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_exception(mock_ydl_class: MagicMock, output_root: Path) -> None:
    """Test when an unexpected exception occurs."""
    raw_error = "Unexpected explosion with token=secret in /Users/test/private/path"
    mock_ydl_class.side_effect = ValueError(raw_error)

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
    )

    assert result["ok"] is False
    assert result["error"]["code"] == "download_error"
    assert result["error"]["message"] == (
        "YouTube import failed. Please use a local audio file instead."
    )
    assert raw_error not in result["error"]["message"]
    assert "token=secret" not in result["error"]["message"]
    assert "/Users/test/private/path" not in result["error"]["message"]


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_duration_exceeded(
    mock_ydl_class: MagicMock, output_root: Path
) -> None:
    """Test download fails if duration exceeds 15 minutes."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {"id": "abc123DEF45", "duration": 16 * 60}

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
    )
    assert result["ok"] is False
    assert result["error"]["code"] == "duration_exceeded"


@patch("bandscope_analysis.youtube.os.remove", wraps=os.remove)
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_size_exceeded(
    mock_ydl_class: MagicMock,
    mock_remove: MagicMock,
    output_root: Path,
) -> None:
    """Test download fails if size exceeds 50MB."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {"id": "abc123DEF45", "duration": 10 * 60}
    filepath = output_root / "abc123DEF45.m4a"
    with filepath.open("wb") as artifact:
        artifact.write(b"synthetic m4a fixture")
        artifact.truncate(51 * 1024 * 1024)
    mock_ydl.prepare_filename.return_value = str(filepath)

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
    )
    assert result["ok"] is False
    assert result["error"]["code"] == "size_exceeded"
    mock_remove.assert_called_once_with(str(filepath))
    assert not filepath.exists()


def test_main_block(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], output_root: Path
) -> None:
    """Test the CLI entry point."""
    test_args = [
        "youtube.py",
        "--url",
        "https://youtube.com/watch?v=abc123DEF45",
        "--out-dir",
        str(output_root),
        "--allowed-output-root",
        str(output_root),
        "--ffmpeg-path",
        "/opt/bandscope/ffmpeg",
        "--ffmpeg-sha256",
        "a" * 64,
        "--ffprobe-path",
        "/opt/bandscope/ffprobe",
        "--ffprobe-sha256",
        "b" * 64,
    ]
    monkeypatch.setattr(sys, "argv", test_args)

    import bandscope_analysis.youtube

    importlib.reload(bandscope_analysis.youtube)

    with patch("bandscope_analysis.youtube.download_youtube_audio") as mock_download:
        mock_download.return_value = {"ok": True, "metadata": {"id": "abc123DEF45"}}

        with patch.object(sys, "exit") as mock_exit:
            bandscope_analysis.youtube.main()
            mock_download.assert_called_with(
                "https://youtube.com/watch?v=abc123DEF45",
                str(output_root),
                allowed_output_root=str(output_root),
                ffmpeg_path="/opt/bandscope/ffmpeg",
                ffmpeg_sha256="a" * 64,
                ffprobe_path="/opt/bandscope/ffprobe",
                ffprobe_sha256="b" * 64,
            )
            mock_exit.assert_called_with(0)

            # test failure exit 1
            mock_download.return_value = {"ok": False}
            bandscope_analysis.youtube.main()
            mock_exit.assert_called_with(1)


def test_module_execution(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    output_root: Path,
) -> None:
    """Test the if __name__ == '__main__' block using runpy."""
    import runpy

    import bandscope_analysis.youtube

    test_args = [
        "youtube.py",
        "--url",
        "https://youtube.com/watch?v=abc123DEF45",
        "--out-dir",
        str(output_root),
        "--allowed-output-root",
        str(output_root),
    ]
    monkeypatch.setattr(sys, "argv", test_args)

    # Mock yt_dlp so runpy doesn't actually download
    mock_yt_dlp = MagicMock()
    mock_ydl = MagicMock()
    mock_yt_dlp.YoutubeDL.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {"id": "abc123DEF45"}
    filepath = output_root / "abc123DEF45.m4a"
    filepath.write_bytes(b"synthetic m4a fixture")
    mock_ydl.prepare_filename.return_value = str(filepath)
    monkeypatch.setitem(sys.modules, "yt_dlp", mock_yt_dlp)

    with pytest.raises(SystemExit) as exit_info:
        runpy.run_path(bandscope_analysis.youtube.__file__, run_name="__main__")
    assert exit_info.value.code == 0

    import json

    result = json.loads(capsys.readouterr().out)
    assert result == {
        "ok": True,
        "metadata": {
            "id": "abc123DEF45",
            "title": None,
            "duration": None,
            "filepath": str(filepath),
        },
    }
    mock_yt_dlp.YoutubeDL.assert_called_once()
    assert mock_ydl.extract_info.call_count == 2


@patch("bandscope_analysis.youtube.urllib.parse.urlparse")
def test_validate_url_exception(mock_urlparse: MagicMock) -> None:
    """Test URL validation exception handling."""
    mock_urlparse.side_effect = ValueError("Test exception")
    assert validate_url("https://youtube.com/watch?v=abc123DEF45") is False


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_second_info_none(
    mock_ydl_class: MagicMock, output_root: Path
) -> None:
    """Test when the second extract_info returns None."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    # First call (download=False) returns info, second call (download=True) returns None
    mock_ydl.extract_info.side_effect = [{"duration": 60}, None]

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(output_root),
        allowed_output_root=str(output_root),
    )

    assert result["ok"] is False
    assert result["error"]["code"] == "download_error"
    assert result["error"]["message"] == (
        "YouTube import failed. Please use a local audio file instead."
    )

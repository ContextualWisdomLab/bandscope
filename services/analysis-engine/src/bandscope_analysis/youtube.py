"""YouTube import capabilities for BandScope.

This module provides a safe wrapper around yt-dlp to download audio from YouTube.

Security Notes:
- Accepts only bounded, standard HTTPS YouTube watch URLs and disables playlists,
  geographic bypass, credentials, and interactive authentication.
- Keeps certificate verification enabled. It uses the operating-system trust
  store when roots are present and otherwise retains yt-dlp's CA fallback.
- Optionally accepts sibling absolute ffmpeg/ffprobe paths only with both full
  SHA-256 identities, verifies both regular executables before handoff, and
  returns redacted failures.
- Rejects metadata over 15 minutes and completed files over 50 MiB, returns
  sanitized public errors, and never logs the requested URL or downloaded audio.
"""

import argparse
import hashlib
import hmac
import json
import os
import re
import ssl
import sys
import urllib.parse
from pathlib import Path
from typing import Any, Dict, Optional

import yt_dlp  # type: ignore

YOUTUBE_VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")
MAX_YOUTUBE_URL_LENGTH = 2000
SUPPORTED_AUDIO_EXTENSIONS = (".opus", ".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg")
YOUTUBE_DOWNLOAD_FAILED_MESSAGE = (
    "Failed to download audio from YouTube. Please use a local audio file instead."
)
YOUTUBE_IMPORT_FAILED_MESSAGE = "YouTube import failed. Please use a local audio file instead."
RUNTIME_DEPENDENCY_INVALID_MESSAGE = "The configured media runtime failed identity verification."
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def validate_url(url: str) -> bool:
    """
    Validate that a URL is a standard YouTube or youtu.be URL.

    Args:
        url: The URL to validate.

    Returns:
        True if the URL is valid, False otherwise.
    """
    # Pragmatic upper bound to avoid spending parser/downloader work on oversized user input.
    if len(url) > MAX_YOUTUBE_URL_LENGTH:
        return False

    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https":
            return False
        if (
            parsed.username is not None
            or parsed.password is not None
            or parsed.port not in (None, 443)
        ):
            return False
        host = parsed.hostname

        if host == "youtu.be":
            path = parsed.path.strip("/")
            return bool(YOUTUBE_VIDEO_ID_PATTERN.match(path))

        if host in {"youtube.com", "www.youtube.com"}:
            if parsed.path != "/watch":
                return False
            query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
            video_ids = query.get("v", [])
            return len(video_ids) == 1 and bool(YOUTUBE_VIDEO_ID_PATTERN.match(video_ids[0]))

        return False
    except ValueError:
        return False


def _find_downloaded_file(actual_filepath: str) -> Optional[str]:
    """Find the downloaded file, including postprocessor extension changes."""
    if not os.path.exists(actual_filepath):
        # Try to find the file with a different extension in case of conversion
        base_path = os.path.splitext(actual_filepath)[0]
        for ext in SUPPORTED_AUDIO_EXTENSIONS:
            match = base_path + ext
            if os.path.exists(match):
                return match
        return None
    return actual_filepath


def _handle_download_error(e: yt_dlp.utils.DownloadError) -> Dict[str, Any]:
    """Map yt-dlp DownloadError to the public YouTube import error response."""
    msg = str(e).lower()
    if (
        "sign in" in msg
        or "members-only" in msg
        or "private" in msg
        or "geo" in msg
        or "premium" in msg
    ):
        return {
            "ok": False,
            "error": {
                "code": "restricted_content",
                "message": (
                    "This video is restricted (login, paywall, or geo-blocked). "
                    "Please use a local audio file instead."
                ),
            },
        }
    return {
        "ok": False,
        "error": {
            "code": "download_failed",
            "message": YOUTUBE_DOWNLOAD_FAILED_MESSAGE,
        },
    }


def _system_ca_available() -> bool:
    """Return whether the operating-system TLS context contains trusted CA roots.

    Any probe failure is treated as an empty system store so yt-dlp keeps its
    default CA behavior. Certificate verification is never disabled.
    """
    try:
        context = ssl.create_default_context()
        return bool(context.get_ca_certs(binary_form=True))
    except Exception:
        return False


def _verify_executable_artifact(
    executable_path: Optional[str], executable_sha256: Optional[str]
) -> Optional[str]:
    """Authenticate one executable and return its resolved absolute path.

    The executable must be an absolute, non-symlinked regular file with execute
    permission, and the digest must be a canonical full lowercase SHA-256.
    """
    if not isinstance(executable_path, str) or not isinstance(executable_sha256, str):
        return None
    if not SHA256_PATTERN.fullmatch(executable_sha256):
        return None

    candidate = Path(executable_path)
    if not candidate.is_absolute() or candidate.is_symlink():
        return None

    try:
        resolved = candidate.resolve(strict=True)
        if not resolved.is_file() or not os.access(resolved, os.X_OK):
            return None

        digest = hashlib.sha256()
        with resolved.open("rb") as artifact:
            for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
                digest.update(chunk)
    except (OSError, RuntimeError):
        return None

    if not hmac.compare_digest(digest.hexdigest(), executable_sha256):
        return None
    return str(resolved)


def _verify_media_runtime(
    ffmpeg_path: Optional[str],
    ffmpeg_sha256: Optional[str],
    ffprobe_path: Optional[str],
    ffprobe_sha256: Optional[str],
) -> tuple[bool, Optional[str]]:
    """Authenticate the complete executable set yt-dlp may invoke.

    An omitted four-part identity retains ordinary yt-dlp PATH behavior. Once
    any field is configured, all four are mandatory. ffmpeg and ffprobe must be
    exact sibling program names because yt-dlp derives its probe path from the
    configured ffmpeg location.
    """
    identity = (ffmpeg_path, ffmpeg_sha256, ffprobe_path, ffprobe_sha256)
    if all(value is None for value in identity):
        return True, None
    if any(not isinstance(value, str) for value in identity):
        return False, None

    verified_ffmpeg = _verify_executable_artifact(ffmpeg_path, ffmpeg_sha256)
    verified_ffprobe = _verify_executable_artifact(ffprobe_path, ffprobe_sha256)
    if verified_ffmpeg is None or verified_ffprobe is None:
        return False, None

    ffmpeg = Path(verified_ffmpeg)
    ffprobe = Path(verified_ffprobe)
    executable_suffix = {"nt": ".exe"}.get(os.name, "")
    if ffmpeg.name != f"ffmpeg{executable_suffix}":
        return False, None
    if ffprobe.name != f"ffprobe{executable_suffix}" or ffprobe.parent != ffmpeg.parent:
        return False, None
    return True, verified_ffmpeg


def _runtime_dependency_invalid() -> Dict[str, Any]:
    """Return the stable redacted response for an untrusted media runtime."""
    return {
        "ok": False,
        "error": {
            "code": "runtime_dependency_invalid",
            "message": RUNTIME_DEPENDENCY_INVALID_MESSAGE,
        },
    }


def download_youtube_audio(
    url: str,
    out_dir: str,
    *,
    ffmpeg_path: Optional[str] = None,
    ffmpeg_sha256: Optional[str] = None,
    ffprobe_path: Optional[str] = None,
    ffprobe_sha256: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Download audio from a YouTube URL to the specified directory.

    Args:
        url: The YouTube URL to download.
        out_dir: The directory to save the audio file.
        ffmpeg_path: Optional absolute path to a provisioned ffmpeg executable.
        ffmpeg_sha256: Full lowercase SHA-256 identity for ``ffmpeg_path``.
        ffprobe_path: Optional sibling path to the provisioned ffprobe executable.
        ffprobe_sha256: Full lowercase SHA-256 identity for ``ffprobe_path``.

    Returns:
        A dictionary containing the result of the download.
    """
    if not validate_url(url):
        return {
            "ok": False,
            "error": {
                "code": "unsupported_url",
                "message": "Only standard YouTube URLs are supported.",
            },
        }

    runtime_is_valid, verified_ffmpeg_path = _verify_media_runtime(
        ffmpeg_path,
        ffmpeg_sha256,
        ffprobe_path,
        ffprobe_sha256,
    )
    if not runtime_is_valid:
        return _runtime_dependency_invalid()

    ydl_opts: Dict[str, Any] = {
        "format": "bestaudio/best",
        "outtmpl": os.path.join(out_dir, "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "postprocessors": [{"key": "FFmpegExtractAudio"}],
        "geo_bypass": False,
    }
    if _system_ca_available():
        # Use managed desktop trust roots only after confirming that the store
        # is populated. Otherwise yt-dlp retains its built-in CA fallback.
        ydl_opts["compat_opts"] = {"no-certifi"}
    if verified_ffmpeg_path is not None:
        ydl_opts["ffmpeg_location"] = verified_ffmpeg_path

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info is None:
                raise Exception("Failed to extract info")
            duration = info.get("duration")
            if duration is not None and duration > 15 * 60:
                return {
                    "ok": False,
                    "error": {
                        "code": "duration_exceeded",
                        "message": "Video exceeds the 15-minute limit.",
                    },
                }

            info = ydl.extract_info(url, download=True)
            if info is None:
                raise Exception("Failed to extract info")
            actual_filepath = ydl.prepare_filename(info)

            actual_filepath = _find_downloaded_file(actual_filepath)

            if actual_filepath is None:
                return {
                    "ok": False,
                    "error": {
                        "code": "file_not_found",
                        "message": "Downloaded file could not be found.",
                    },
                }

            if (
                os.path.exists(actual_filepath)
                and os.path.getsize(actual_filepath) > 50 * 1024 * 1024
            ):
                os.remove(actual_filepath)
                return {
                    "ok": False,
                    "error": {
                        "code": "size_exceeded",
                        "message": "Downloaded file exceeds the 50MB limit.",
                    },
                }
            return {
                "ok": True,
                "metadata": {
                    "id": info.get("id"),
                    "title": info.get("title"),
                    "duration": info.get("duration"),
                    "filepath": actual_filepath,
                },
            }
    except yt_dlp.utils.DownloadError as e:
        return _handle_download_error(e)
    except Exception:
        return {
            "ok": False,
            "error": {"code": "download_error", "message": YOUTUBE_IMPORT_FAILED_MESSAGE},
        }


def main() -> None:
    """Run as a script."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--ffmpeg-path")
    parser.add_argument("--ffmpeg-sha256")
    parser.add_argument("--ffprobe-path")
    parser.add_argument("--ffprobe-sha256")
    args = parser.parse_args()

    result = download_youtube_audio(
        args.url,
        args.out_dir,
        ffmpeg_path=args.ffmpeg_path,
        ffmpeg_sha256=args.ffmpeg_sha256,
        ffprobe_path=args.ffprobe_path,
        ffprobe_sha256=args.ffprobe_sha256,
    )
    print(json.dumps(result))
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()

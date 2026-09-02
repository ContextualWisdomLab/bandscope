"""
YouTube import capabilities for BandScope.

This module provides a safe wrapper around yt-dlp to download audio from YouTube.
"""

import argparse
import json
import os
import re
import sys
import urllib.parse
from typing import Any, Dict, Optional

import yt_dlp  # type: ignore

from bandscope_analysis.audio_resource_policy import (
    AudioResourcePolicyError,
    validate_duration_seconds,
    validate_encoded_file_bytes,
)

YOUTUBE_VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")
MAX_YOUTUBE_URL_LENGTH = 2000
SUPPORTED_AUDIO_EXTENSIONS = (".opus", ".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg")
YOUTUBE_DOWNLOAD_FAILED_MESSAGE = (
    "Failed to download audio from YouTube. Please use a local audio file instead."
)
YOUTUBE_IMPORT_FAILED_MESSAGE = "YouTube import failed. Please use a local audio file instead."


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
        host = parsed.netloc.lower().split(":")[0]

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


def download_youtube_audio(url: str, out_dir: str) -> Dict[str, Any]:
    """
    Download audio from a YouTube URL to the specified directory.

    Args:
        url: The YouTube URL to download.
        out_dir: The directory to save the audio file.

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

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info is None:
                raise Exception("Failed to extract info")
            duration = info.get("duration")
            if duration is not None:
                try:
                    validate_duration_seconds(duration)
                except AudioResourcePolicyError as policy_error:
                    return {
                        "ok": False,
                        "error": {
                            "code": policy_error.rejection_reason,
                            "message": policy_error.safe_message,
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

            if not os.path.exists(actual_filepath):
                return {
                    "ok": False,
                    "error": {
                        "code": "file_not_found",
                        "message": "Downloaded file could not be found.",
                    },
                }
            try:
                validate_encoded_file_bytes(os.path.getsize(actual_filepath))
            except AudioResourcePolicyError as policy_error:
                os.remove(actual_filepath)
                return {
                    "ok": False,
                    "error": {
                        "code": policy_error.rejection_reason,
                        "message": policy_error.safe_message,
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
    args = parser.parse_args()

    result = download_youtube_audio(args.url, args.out_dir)
    print(json.dumps(result))
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()

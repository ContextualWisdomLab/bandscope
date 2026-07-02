"""
YouTube import capabilities for BandScope.

This module provides a safe wrapper around yt-dlp to download audio from YouTube.
"""

import argparse
import glob
import json
import logging
import os
import re
import sys
import urllib.parse
from typing import Any, Dict, Optional

import yt_dlp  # type: ignore

YOUTUBE_VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")
SUPPORTED_AUDIO_EXTENSIONS = (".opus", ".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg")
YOUTUBE_DOWNLOAD_FAILED_MESSAGE = (
    "Failed to download audio from YouTube. Please use a local audio file instead."
)
YOUTUBE_IMPORT_FAILED_MESSAGE = "YouTube import failed. Please use a local audio file instead."

logger = logging.getLogger(__name__)


def validate_url(url: str) -> bool:
    """
    Validate that a URL is a standard YouTube or youtu.be URL.

    Args:
        url: The URL to validate.

    Returns:
        True if the URL is valid, False otherwise.
    """
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https":
            logger.warning(f"Security: Invalid scheme {parsed.scheme}")
            return False
        host = parsed.netloc.lower().split(":")[0]

        if host == "youtu.be":
            path = parsed.path.strip("/")
            if bool(YOUTUBE_VIDEO_ID_PATTERN.match(path)):
                return True
            logger.warning("Security: Invalid youtu.be path")
            return False

        if host in {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}:
            if parsed.path != "/watch":
                logger.warning(f"Security: Invalid youtube.com path {parsed.path}")
                return False
            query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
            video_ids = query.get("v", [])
            if len(video_ids) == 1 and bool(YOUTUBE_VIDEO_ID_PATTERN.match(video_ids[0])):
                return True
            logger.warning("Security: Invalid youtube.com video ID")
            return False

        logger.warning(f"Security: Invalid host {host}")
        return False
    except ValueError:
        logger.warning("Security: URL parsing error")
        return False


def _find_downloaded_file(actual_filepath: str) -> Optional[str]:
    """Find the downloaded file, including postprocessor extension changes."""
    if not os.path.exists(actual_filepath):
        # Try to find the file with a different extension in case of conversion
        base_path = os.path.splitext(actual_filepath)[0]
        for match in glob.iglob(glob.escape(base_path) + ".*"):
            if match.endswith(SUPPORTED_AUDIO_EXTENSIONS):
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
        logger.warning(f"Security: Blocked unsupported YouTube URL: {url}")
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
            if duration is not None and duration > 15 * 60:
                return {
                    "ok": False,
                    "error": {
                        "code": "duration_exceeded",
                        "message": "Video exceeds the 15-minute limit.",
                    },
                }

            info = ydl.process_ie_result(info, download=True)
            if info is None:
                raise Exception("Failed to extract info")
            actual_filepath = ydl.prepare_filename(info)

            actual_filepath = _find_downloaded_file(actual_filepath)

            if actual_filepath is not None:
                # Security: prevent directory traversal by validating the path remains in out_dir
                # Ensure trailing separator on directory comparison
                actual_filepath_abs = os.path.abspath(actual_filepath)
                out_dir_abs = os.path.abspath(out_dir)
                if not out_dir_abs.endswith(os.sep):
                    out_dir_abs += os.sep
                if not actual_filepath_abs.startswith(out_dir_abs):
                    logger.warning(f"Security: Traversal attempt blocked: {actual_filepath}")
                    actual_filepath = None

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
        logger.warning("Security: Download error occurred")
        return _handle_download_error(e)
    except Exception:
        logger.error("Security: Unexpected error during download")
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

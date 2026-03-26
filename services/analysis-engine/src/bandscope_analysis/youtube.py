"""
YouTube import capabilities for BandScope.

This module provides a safe wrapper around yt-dlp to download audio from YouTube.
"""

import argparse
import json
import os
import sys
import urllib.parse
from typing import Any, Dict

import yt_dlp  # type: ignore


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
            return False
        host = parsed.netloc.lower().split(":")[0]
        return host == "youtu.be" or host == "youtube.com" or host.endswith(".youtube.com")
    except Exception:
        return False


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

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": os.path.join(out_dir, "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "extract_audio": True,
        "geo_bypass": False,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if info is None:
                raise Exception("Failed to extract info")
            actual_filepath = ydl.prepare_filename(info)
            duration = info.get("duration")
            if duration is not None and duration > 15 * 60:
                if os.path.exists(actual_filepath):
                    os.remove(actual_filepath)
                return {
                    "ok": False,
                    "error": {
                        "code": "duration_exceeded",
                        "message": "Video exceeds the 15-minute limit.",
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
                "message": (
                    f"Failed to download audio from YouTube. "
                    f"Please use a local audio file instead. ({e})"
                ),
            },
        }
    except Exception as e:
        return {"ok": False, "error": {"code": "download_error", "message": str(e)}}


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

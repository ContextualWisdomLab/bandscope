"""YouTube import capabilities for BandScope.

This module provides a safe wrapper around yt-dlp to download audio from YouTube.

Security Notes:
    - URL intake remains host/path/query allowlisted before any network work.
    - Each validated video ID acquires an atomic same-cache import lease before
      yt-dlp starts. A second same-ID import cannot write or clean the first
      import's predictable artifact names while the lease is held. A stale
      lease fails closed rather than authorizing deletion.
    - A completed artifact for the same video ID must not pre-exist the lease;
      this prevents a later import from overwriting or claiming an older file.
    - Encoded-byte admission uses the same canonical 100 MiB policy as local
      audio. yt-dlp ``max_filesize`` and a progress hook abort in-flight
      transfers so a multi-gigabyte download cannot fill the cache root before
      the post-download check runs.
    - Announced duration must be a finite positive non-Boolean number when
      present; malformed known-duration metadata fails closed before download.
      Download-result duration is revalidated before success so changed
      metadata cannot bypass the same 15-minute admission boundary.
    - Announced ``filesize`` / ``filesize_approx`` values over the policy
      ceiling reject the import before ``download=True``.
    - yt-dlp metadata must retain the requested video ID before and after the
      download. A changed ID cannot redirect the current lease to another
      import's predictable filenames.
    - The completed download path must resolve beneath this import's ``out_dir``
      and match one canonical ``{video_id}{extension}`` final-artifact name
      before post-download size checks, cleanup, or success metadata can use it.
    - The opened-file size is revalidated with ``AudioResourcePolicy`` after
      download; oversized artifacts and malformed zero-byte outputs are deleted
      while retaining the correct buyer-facing rejection category.
    - In-flight abort deletes only an exact canonical final artifact or the
      leased video's explicitly transient ``.part``, ``.ytdl``, and ``-FragN``
      filenames beneath this ``out_dir``. Same-ID prefix alone never grants
      deletion authority.
    - Validation errors are payload-free and never include source paths, URLs,
      cookies, or audio content.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import urllib.parse
from typing import Any, Dict, Optional

import yt_dlp  # type: ignore

from bandscope_analysis.audio_resource_policy import (
    DEFAULT_AUDIO_RESOURCE_POLICY,
    DEFAULT_MAX_DURATION_SECONDS,
    DEFAULT_MAX_ENCODED_FILE_BYTES,
    AudioResourcePolicyError,
)

YOUTUBE_VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")
MAX_YOUTUBE_URL_LENGTH = 2000
SUPPORTED_AUDIO_EXTENSIONS = (".opus", ".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg")
YOUTUBE_COMPLETED_AUDIO_EXTENSIONS = (*SUPPORTED_AUDIO_EXTENSIONS, ".webm")
YOUTUBE_DOWNLOAD_FAILED_MESSAGE = (
    "Failed to download audio from YouTube. Please use a local audio file instead."
)
YOUTUBE_IMPORT_FAILED_MESSAGE = "YouTube import failed. Please use a local audio file instead."
YOUTUBE_SIZE_EXCEEDED_MESSAGE = "Selected audio file exceeds the 100 MiB analysis limit."


class YoutubeResourceLimitError(Exception):
    """Fail-closed YouTube admission error that never includes payload paths."""

    def __init__(self, code: str, message: str) -> None:
        """Store a payload-safe public error code and next-action message.

        Args:
            code: Stable machine-readable error code.
            message: User-facing instruction that omits paths and URLs.
        """
        super().__init__(message)
        self.code = code
        self.message = message


def _youtube_video_id(url: str) -> str | None:
    """Return the one allowlisted YouTube video ID carried by ``url``.

    Args:
        url: Candidate external URL.

    Returns:
        The validated 11-character video ID, or ``None`` when the URL is outside
        the supported HTTPS host/path/query contract.
    """
    if len(url) > MAX_YOUTUBE_URL_LENGTH:
        return None

    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https":
            return None
        host = parsed.netloc.lower().split(":")[0]

        if host == "youtu.be":
            path = parsed.path.strip("/")
            return path if YOUTUBE_VIDEO_ID_PATTERN.fullmatch(path) else None

        if host in {"youtube.com", "www.youtube.com"}:
            if parsed.path != "/watch":
                return None
            query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
            video_ids = query.get("v", [])
            if len(video_ids) != 1:
                return None
            video_id = video_ids[0]
            return video_id if YOUTUBE_VIDEO_ID_PATTERN.fullmatch(video_id) else None

        return None
    except ValueError:
        return None


def validate_url(url: str) -> bool:
    """Return whether ``url`` is one supported YouTube video URL."""
    return _youtube_video_id(url) is not None


def _import_lease_path(out_dir: str, video_id: str) -> str:
    """Return the path-free-on-error lease directory for one video/cache pair."""
    return os.path.join(out_dir, f".bandscope-youtube-{video_id}.lock")


def _acquire_import_lease(out_dir: str, video_id: str) -> str | None:
    """Atomically reserve one video ID inside a shared cache directory.

    The directory creation itself is the cross-process exclusion primitive. A
    stale lease is intentionally not removed here: absence of current ownership
    evidence must fail closed instead of deleting another process's state.
    """
    lease_path = _import_lease_path(out_dir, video_id)
    try:
        os.mkdir(lease_path, 0o700)
    except OSError:
        return None
    return lease_path


def _release_import_lease(lease_path: str) -> None:
    """Release only the still-empty lease directory created by this import."""
    try:
        os.rmdir(lease_path)
    except OSError:
        return


def _preexisting_final_artifact(out_dir: str, video_id: str) -> bool:
    """Return whether this cache already contains a final artifact for ``video_id``.

    A previous completed import is not current ownership evidence. Refusing to
    overwrite it keeps same-ID cache reuse fail-closed even after a lease ends.
    Partial files are intentionally excluded because the active lease is the
    authority that distinguishes current cleanup from a concurrent writer.
    """
    return any(
        os.path.lexists(os.path.join(out_dir, f"{video_id}{ext}"))
        for ext in YOUTUBE_COMPLETED_AUDIO_EXTENSIONS
    )


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


def _size_exceeded_result() -> Dict[str, Any]:
    """Return the payload-safe oversize result shared by every admission path."""
    return {
        "ok": False,
        "error": {
            "code": "size_exceeded",
            "message": YOUTUBE_SIZE_EXCEEDED_MESSAGE,
        },
    }


def _download_error_result() -> Dict[str, Any]:
    """Return the payload-safe generic import failure result."""
    return {
        "ok": False,
        "error": {"code": "download_error", "message": YOUTUBE_IMPORT_FAILED_MESSAGE},
    }


def _reject_invalid_or_oversize_duration(info: dict[str, Any]) -> Dict[str, Any] | None:
    """Validate announced duration before authorizing download work.

    Args:
        info: Metadata dictionary from yt-dlp extraction.

    Returns:
        A payload-safe failure for malformed/over-budget known duration, or
        ``None`` when duration is absent or valid and within policy.
    """
    duration = info.get("duration")
    if duration is None:
        return None
    if type(duration) not in (int, float):
        return _download_error_result()
    duration_seconds = float(duration)
    if not math.isfinite(duration_seconds) or duration_seconds <= 0.0:
        return _download_error_result()
    if duration_seconds > DEFAULT_MAX_DURATION_SECONDS:
        return {
            "ok": False,
            "error": {
                "code": "duration_exceeded",
                "message": "Video exceeds the 15-minute limit.",
            },
        }
    return None


def _announced_size_exceeds_policy(announced: object) -> bool:
    """Return whether yt-dlp metadata already reports an over-budget file.

    Args:
        announced: Candidate ``filesize`` or ``filesize_approx`` value.

    Returns:
        True when the value is a finite number strictly above the policy ceiling.
    """
    if isinstance(announced, bool) or not isinstance(announced, int | float):
        return False
    if isinstance(announced, float) and not math.isfinite(announced):
        return False
    size_bytes: int | float = announced
    return bool(size_bytes > DEFAULT_MAX_ENCODED_FILE_BYTES)


def _reject_announced_oversize(info: dict[str, Any]) -> Dict[str, Any] | None:
    """Reject before download when extract_info already announced oversize bytes.

    Args:
        info: Metadata dictionary from ``extract_info(..., download=False)``.

    Returns:
        The size-exceeded result, or ``None`` when download may proceed.
    """
    if _announced_size_exceeds_policy(info.get("filesize")) or _announced_size_exceeds_policy(
        info.get("filesize_approx")
    ):
        return _size_exceeded_result()
    return None


def _owned_file_path(path: object, out_dir: str) -> str | None:
    """Return a real path only when it stays inside this import's output directory."""
    if not isinstance(path, str) or path == "":
        return None
    try:
        resolved = os.path.realpath(path)
        root = os.path.realpath(out_dir)
    except OSError:
        return None
    if resolved == root or not resolved.startswith(root + os.sep):
        return None
    return resolved


def _owned_video_file_path(path: object, out_dir: str, video_id: str) -> str | None:
    """Return a contained path only when its filename belongs to ``video_id``."""
    owned = _owned_file_path(path, out_dir)
    if owned is None:
        return None
    if not os.path.basename(owned).startswith(f"{video_id}."):
        return None
    return owned


def _owned_completed_video_file_path(
    path: object,
    out_dir: str,
    video_id: str,
) -> str | None:
    """Return only one canonical completed artifact owned by the active lease."""
    owned = _owned_file_path(path, out_dir)
    if owned is None:
        return None
    allowed_names = {f"{video_id}{ext}" for ext in YOUTUBE_COMPLETED_AUDIO_EXTENSIONS}
    if os.path.basename(owned) not in allowed_names:
        return None
    return owned


def _owned_transient_video_file_path(
    path: object,
    out_dir: str,
    video_id: str,
) -> str | None:
    """Return only an explicitly transient yt-dlp artifact for the active lease."""
    owned = _owned_video_file_path(path, out_dir, video_id)
    if owned is None:
        return None
    name = os.path.basename(owned)
    artifact_name = name[len(video_id) + 1 :]
    fragment_tail = artifact_name.rsplit("-Frag", maxsplit=1)
    if len(fragment_tail) == 2:
        if re.fullmatch(r"[0-9]+(?:\.part)?", fragment_tail[1]) is not None:
            return owned
        return None
    if name.endswith((".part", ".ytdl")):
        return owned
    return None


def _remove_owned_file(path: object, out_dir: str) -> None:
    """Delete one contained regular file, ignoring missing-path races.

    This generic containment helper remains useful for tests and non-video
    cleanup. YouTube production cleanup uses ``_remove_video_owned_file`` so
    directory containment alone never grants current-import deletion authority.
    """
    owned = _owned_file_path(path, out_dir)
    if owned is None:
        return
    try:
        if os.path.isfile(owned):
            os.remove(owned)
    except OSError:
        return


def _remove_video_owned_file(path: object, out_dir: str, video_id: str) -> None:
    """Delete one regular file only when it carries the leased video identity."""
    owned = _owned_video_file_path(path, out_dir, video_id)
    if owned is None:
        return
    try:
        if os.path.isfile(owned):
            os.remove(owned)
    except OSError:
        return


def _video_id_from_status(status: dict[str, Any]) -> str | None:
    """Infer a validated video ID only for compatibility-focused helper tests."""
    for key in ("tmpfilename", "filename"):
        candidate = status.get(key)
        if not isinstance(candidate, str):
            continue
        name = os.path.basename(candidate)
        video_id = name.split(".", maxsplit=1)[0]
        if YOUTUBE_VIDEO_ID_PATTERN.fullmatch(video_id):
            return video_id
    return None


def _cleanup_stem(name: str) -> str:
    """Return the canonical yt-dlp stem shared by one authorized transient path."""
    video_id, separator, artifact_name = name.partition(".")
    if separator and YOUTUBE_VIDEO_ID_PATTERN.fullmatch(video_id):
        fragment_tail = artifact_name.rsplit("-Frag", maxsplit=1)
        if len(fragment_tail) == 2:
            if re.fullmatch(r"[0-9]+(?:\.part)?", fragment_tail[1]) is None:
                return name
            name = f"{video_id}.{fragment_tail[0]}"
    else:
        fragment_match = re.search(r"-Frag[0-9]+(?:\.part)?$", name)
        if fragment_match is not None:
            name = name[: fragment_match.start()]
    for suffix in (".part", ".ytdl"):
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return name


def _remove_download_artifacts(
    status: dict[str, Any],
    out_dir: str,
    video_id: str | None = None,
) -> None:
    """Delete only one leased video's canonical final or explicit transient files."""
    cleanup_video_id = video_id or _video_id_from_status(status)
    if cleanup_video_id is None:
        return

    stems: set[str] = set()
    for key in ("tmpfilename", "filename"):
        candidate = status.get(key)
        owned = _owned_transient_video_file_path(candidate, out_dir, cleanup_video_id)
        if owned is None:
            owned = _owned_completed_video_file_path(candidate, out_dir, cleanup_video_id)
        if owned is None:
            continue
        _remove_video_owned_file(owned, out_dir, cleanup_video_id)
        stems.add(_cleanup_stem(os.path.basename(owned)))
    if not stems:
        return
    try:
        entries = os.listdir(out_dir)
    except OSError:
        return
    for entry in entries:
        transient = _owned_transient_video_file_path(
            os.path.join(out_dir, entry),
            out_dir,
            cleanup_video_id,
        )
        if transient is None:
            continue
        transient_name = os.path.basename(transient)
        if any(_cleanup_stem(transient_name) == stem for stem in stems):
            _remove_video_owned_file(transient, out_dir, cleanup_video_id)


def _abort_over_budget_download(
    status: dict[str, Any],
    out_dir: str,
    video_id: str | None = None,
) -> None:
    """Abort an in-flight leased download once encoded bytes exceed the policy ceiling."""
    if status.get("status") not in {"downloading", "finished"}:
        return
    for key in ("downloaded_bytes", "total_bytes", "total_bytes_estimate"):
        candidate = status.get(key)
        if isinstance(candidate, bool) or not isinstance(candidate, int):
            continue
        if candidate > DEFAULT_MAX_ENCODED_FILE_BYTES:
            _remove_download_artifacts(status, out_dir, video_id)
            raise YoutubeResourceLimitError("size_exceeded", YOUTUBE_SIZE_EXCEEDED_MESSAGE)


def _make_abort_hook(out_dir: str, video_id: str) -> Any:
    """Bind the in-flight abort hook to the currently leased video identity."""

    def _bound_abort_over_budget_download(status: dict[str, Any]) -> None:
        """Abort and delete only this video's partials while its lease is held."""
        _abort_over_budget_download(status, out_dir, video_id)

    return _bound_abort_over_budget_download


def _handle_download_error(e: yt_dlp.utils.DownloadError) -> Dict[str, Any]:
    """Map yt-dlp DownloadError to the public YouTube import error response."""
    msg = str(e).lower()
    if "max-filesize" in msg or "100 mib" in msg:
        return _size_exceeded_result()
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
    """Download one YouTube audio artifact under a same-video exclusive lease."""
    video_id = _youtube_video_id(url)
    if video_id is None:
        return {
            "ok": False,
            "error": {
                "code": "unsupported_url",
                "message": "Only standard YouTube URLs are supported.",
            },
        }

    lease_path = _acquire_import_lease(out_dir, video_id)
    if lease_path is None:
        return _download_error_result()

    try:
        if _preexisting_final_artifact(out_dir, video_id):
            return _download_error_result()

        ydl_opts: Dict[str, Any] = {
            "format": "bestaudio/best",
            "outtmpl": os.path.join(out_dir, "%(id)s.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            "noplaylist": True,
            "postprocessors": [{"key": "FFmpegExtractAudio"}],
            "geo_bypass": False,
            "max_filesize": DEFAULT_MAX_ENCODED_FILE_BYTES,
            "progress_hooks": [_make_abort_hook(out_dir, video_id)],
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if info is None:
                    raise Exception("Failed to extract info")
                if info.get("id") != video_id:
                    return _download_error_result()
                duration_rejection = _reject_invalid_or_oversize_duration(info)
                if duration_rejection is not None:
                    return duration_rejection
                announced_rejection = _reject_announced_oversize(info)
                if announced_rejection is not None:
                    return announced_rejection

                info = ydl.extract_info(url, download=True)
                if info is None:
                    raise Exception("Failed to extract info")
                if info.get("id") != video_id:
                    return _download_error_result()
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

                owned_filepath = _owned_completed_video_file_path(
                    actual_filepath,
                    out_dir,
                    video_id,
                )
                if owned_filepath is None:
                    return _download_error_result()
                actual_filepath = owned_filepath

                duration_rejection = _reject_invalid_or_oversize_duration(info)
                if duration_rejection is not None:
                    _remove_video_owned_file(actual_filepath, out_dir, video_id)
                    return duration_rejection

                try:
                    DEFAULT_AUDIO_RESOURCE_POLICY.validate_encoded_file_bytes(
                        os.path.getsize(actual_filepath)
                    )
                except AudioResourcePolicyError as error:
                    _remove_video_owned_file(actual_filepath, out_dir, video_id)
                    if error.reason == "encoded_file_too_large":
                        return _size_exceeded_result()
                    return _download_error_result()
                return {
                    "ok": True,
                    "metadata": {
                        "id": info.get("id"),
                        "title": info.get("title"),
                        "duration": info.get("duration"),
                        "filepath": actual_filepath,
                    },
                }
        except YoutubeResourceLimitError:
            return _size_exceeded_result()
        except yt_dlp.utils.DownloadError as e:
            return _handle_download_error(e)
        except Exception:
            return _download_error_result()
    finally:
        _release_import_lease(lease_path)


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

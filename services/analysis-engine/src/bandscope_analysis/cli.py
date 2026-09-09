"""CLI entrypoint for the bootstrap analysis orchestration flow."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path

from bandscope_analysis.api import (
    get_analysis_status,
    run_analysis_job,
    run_analysis_job_updates,
    validate_analysis_job_request,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

_SOURCE_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def failed_cli_response(
    message: str,
    *,
    job_id: str = "unknown-job",
    requested_at: str | None = None,
) -> dict[str, object]:
    """Return a typed CLI failure envelope for malformed stdin payloads."""
    timestamp = requested_at or datetime.now(UTC).isoformat().replace("+00:00", "Z")
    return {
        "jobId": job_id,
        "state": "failed",
        "requestedAt": timestamp,
        "updatedAt": timestamp,
        "error": {
            "code": "invalid_request",
            "message": message,
        },
    }


def _bind_verified_source_cache_namespace(
    request: object,
    source_content_sha256: object,
    job_id: object = None,
) -> object:
    """Scope local cache and stem-work paths to verified source and job identities."""
    if not isinstance(request, dict):
        return request

    source_kind = request.get("sourceKind")
    if source_kind != "local_audio":
        if source_content_sha256 is not None:
            raise ValueError("Invalid analysis job request: invalid field 'sourceContentSha256'")
        return request

    bound_request = dict(request)
    job_digest = (
        hashlib.sha256(job_id.encode("utf-8")).hexdigest()
        if isinstance(job_id, str) and job_id.strip()
        else None
    )
    if source_content_sha256 is None:
        if isinstance(bound_request.get("cacheRoot"), str):
            bound_request.pop("cacheRoot", None)
        temp_root = bound_request.get("tempRoot")
        if isinstance(temp_root, str) and temp_root.strip() and job_digest is not None:
            bound_request["tempRoot"] = str(Path(temp_root) / "job-sha256-v1" / job_digest)
        return bound_request
    if not isinstance(source_content_sha256, str) or not _SOURCE_SHA256_PATTERN.fullmatch(
        source_content_sha256
    ):
        raise ValueError("Invalid analysis job request: invalid field 'sourceContentSha256'")

    cache_root = bound_request.get("cacheRoot")
    if isinstance(cache_root, str) and cache_root.strip():
        bound_request["cacheRoot"] = str(
            Path(cache_root) / "source-sha256-v1" / source_content_sha256
        )
    temp_root = bound_request.get("tempRoot")
    if isinstance(temp_root, str) and temp_root.strip():
        scoped_temp_root = Path(temp_root) / "source-sha256-v1" / source_content_sha256
        if job_digest is not None:
            scoped_temp_root = scoped_temp_root / "job-sha256-v1" / job_digest
        bound_request["tempRoot"] = str(scoped_temp_root)
    return bound_request


def _open_anchored_directory_chain(path: Path) -> list[int] | None:
    """Open one absolute directory chain without following mutable symlink components."""
    supports_dir_fd = getattr(os, "supports_dir_fd", set())
    if (
        not path.is_absolute()
        or os.open not in supports_dir_fd
        or not hasattr(os, "O_DIRECTORY")
        or not hasattr(os, "O_NOFOLLOW")
    ):
        return None
    parts = path.parts
    if not parts or parts[0] != path.anchor:
        return None

    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    flags |= getattr(os, "O_CLOEXEC", 0)
    descriptors: list[int] = []
    try:
        current_descriptor = os.open(path.anchor, flags)
        descriptors.append(current_descriptor)
        for component in parts[1:]:
            if component in {"", ".", ".."}:
                raise OSError
            current_descriptor = os.open(
                component,
                flags,
                dir_fd=current_descriptor,
            )
            descriptors.append(current_descriptor)
    except OSError:
        for descriptor in reversed(descriptors):
            try:
                os.close(descriptor)
            except OSError:
                pass
        return None
    return descriptors


def _cleanup_job_temp_namespace(request: object) -> None:
    """Best-effort remove only a descriptor-anchored derived job namespace."""
    if not isinstance(request, dict):
        return
    temp_root = request.get("tempRoot")
    if not isinstance(temp_root, str) or not temp_root.strip():
        return
    path = Path(temp_root)
    parts = path.parts
    if not path.is_absolute() or len(parts) < 2 or parts[-2] != "job-sha256-v1":
        return
    if _SOURCE_SHA256_PATTERN.fullmatch(parts[-1]) is None:
        return

    derived_parents = [path.parent]
    if len(parts) >= 4 and parts[-4] == "source-sha256-v1":
        if _SOURCE_SHA256_PATTERN.fullmatch(parts[-3]) is None:
            return
        derived_parents.extend((path.parents[1], path.parents[2], path.parents[3]))
    else:
        derived_parents.append(path.parents[1])
    if any(candidate.is_symlink() for candidate in derived_parents):
        return
    if not shutil.rmtree.avoids_symlink_attacks:
        return

    parent_descriptors = _open_anchored_directory_chain(path.parent)
    if parent_descriptors is None:
        return
    try:
        shutil.rmtree(
            path.name,
            dir_fd=parent_descriptors[-1],
            ignore_errors=True,
        )
    except (OSError, TypeError):
        return
    finally:
        for descriptor in reversed(parent_descriptors):
            try:
                os.close(descriptor)
            except OSError:
                pass


def main() -> int:
    """Read a job payload from stdin and print a structured job response to stdout."""
    input_data = sys.stdin.read().strip()
    progress_jsonl = "--progress-jsonl" in sys.argv[1:]
    cli_args = [arg for arg in sys.argv[1:] if arg != "--progress-jsonl"]

    if cli_args:
        if cli_args[0] == "--status":
            json.dump(get_analysis_status(), sys.stdout)
            return 0
        if cli_args[0] == "--job" and len(cli_args) > 1:
            input_data = cli_args[1]
            if not input_data.startswith("{"):
                try:
                    with open(input_data, "r", encoding="utf-8") as f:
                        input_data = f.read()
                except Exception:
                    json.dump(failed_cli_response("Failed to read job file"), sys.stdout)
                    return 1

    if not input_data:
        json.dump(failed_cli_response("Empty input"), sys.stdout)
        return 0

    try:
        payload = json.loads(input_data)
    except json.JSONDecodeError as error:
        json.dump(failed_cli_response(f"Invalid analysis job request: {error.msg}"), sys.stdout)
        return 0

    if not isinstance(payload, dict):
        json.dump(
            failed_cli_response("Invalid analysis job request: invalid field 'root'"), sys.stdout
        )
        return 0

    job_id = payload.get("jobId")
    if not isinstance(job_id, str) or not job_id.strip():
        json.dump(
            failed_cli_response("Invalid analysis job request: invalid field 'jobId'"), sys.stdout
        )
        return 0

    requested_at_value = payload.get("requestedAt")
    if requested_at_value is None:
        requested_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    elif not isinstance(requested_at_value, str) or not requested_at_value.strip():
        json.dump(
            failed_cli_response("Invalid analysis job request: invalid field 'requestedAt'"),
            sys.stdout,
        )
        return 0
    else:
        requested_at = requested_at_value

    request = payload.get("request")
    try:
        request = validate_analysis_job_request(request)
        request = _bind_verified_source_cache_namespace(
            request,
            payload.get("sourceContentSha256"),
            job_id,
        )
    except ValueError as error:
        json.dump(
            failed_cli_response(str(error), job_id=job_id, requested_at=requested_at),
            sys.stdout,
        )
        return 0

    try:
        if progress_jsonl:
            for update in run_analysis_job_updates(job_id, request, requested_at):
                json.dump(update, sys.stdout)
                sys.stdout.write("\n")
                sys.stdout.flush()
            return 0

        response = run_analysis_job(job_id, request, requested_at)
        json.dump(response, sys.stdout)
        return 0
    finally:
        _cleanup_job_temp_namespace(request)


if __name__ == "__main__":
    raise SystemExit(main())

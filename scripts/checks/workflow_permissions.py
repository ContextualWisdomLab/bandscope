"""Verify effective GitHub Actions contents permissions for repository backstops."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


def _contents_permission(permissions: Any) -> str | None:
    if permissions == "read-all":
        return "read"
    if permissions == "write-all":
        return "write"
    if isinstance(permissions, dict):
        value = permissions.get("contents")
        return value if isinstance(value, str) else None
    return None


def verify_contents_permissions(workflow_path: str | Path) -> list[str]:
    """Return violations when a workflow can write repository contents.

    The workflow-level permission must be explicit and read-only so repository
    token defaults cannot silently expand authority. A job-level permissions map
    may grant other scopes required by the job, but it must never grant
    ``contents: write`` or ``write-all``. When a job-level map omits ``contents``,
    GitHub assigns no permission for that scope rather than inheriting the
    workflow-level value, which is safe for this guard.
    """
    path = Path(workflow_path)
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        return [f"{path}: workflow YAML root must be a mapping"]

    violations: list[str] = []
    workflow_permissions = document.get("permissions")
    workflow_contents = _contents_permission(workflow_permissions)
    if workflow_contents != "read":
        if workflow_contents == "write":
            violations.append(f"{path}: workflow permissions grant contents: write")
        else:
            violations.append(
                f"{path}: workflow permissions are not explicitly read-only for contents"
            )

    jobs = document.get("jobs", {})
    if not isinstance(jobs, dict):
        return violations + [f"{path}: jobs must be a mapping"]

    for job_name, job in jobs.items():
        if not isinstance(job, dict) or "permissions" not in job:
            continue
        job_permissions = job["permissions"]
        if job_permissions == "write-all" or _contents_permission(job_permissions) == "write":
            violations.append(f"{path}: job {job_name} permissions grant contents: write")

    return violations

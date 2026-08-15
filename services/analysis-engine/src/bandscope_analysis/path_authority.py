"""Fail-closed filesystem path authority helpers for local analysis resources.

The helpers in this module separate two concerns that must not be conflated:
lexical path-shape validation that can reason about POSIX and Windows inputs on
any host, and native filesystem resolution that is performed only immediately
before repository-owned code reads or writes a path. Error messages name the
contract field but never echo the untrusted path value.
"""

from __future__ import annotations

from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Final

_DEVICE_PREFIXES: Final[tuple[str, ...]] = ("\\\\?\\", "\\\\.\\", "//?/", "//./")
_NETWORK_PREFIXES: Final[tuple[str, ...]] = ("\\\\", "//")
_FIXED_CHILD_BY_FIELD: Final[dict[str, str]] = {
    "cacheRoot": "analysis-cache-v1",
    "tempRoot": "stem-work-v1",
}


def _invalid_path(field_name: str) -> ValueError:
    """Build one payload-safe invalid-path error for a request field."""
    return ValueError(f"Invalid analysis job request: invalid field '{field_name}'")


def _preflight_native_path(value: str, field_name: str) -> None:
    """Reject native symlink and containment violations during request validation.

    A fully qualified path for another operating system remains lexically valid
    and is left for the actual I/O boundary to reject. Native paths are resolved
    here so callers receive an actionable ``invalid_request`` before progress is
    emitted when a direct symlink or fixed cache/temp child already escapes its
    authorized root.
    """
    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        return
    if candidate.is_symlink():
        raise _invalid_path(field_name)

    try:
        resolved = candidate.resolve(strict=False)
    except (OSError, RuntimeError) as error:
        raise _invalid_path(field_name) from error

    if field_name == "localSource.sourcePath":
        if resolved.exists() and not resolved.is_file():
            raise _invalid_path(field_name)
        return

    fixed_child = _FIXED_CHILD_BY_FIELD.get(field_name)
    if fixed_child is None:
        return
    try:
        child = resolved.joinpath(fixed_child).resolve(strict=False)
    except (OSError, RuntimeError) as error:
        raise _invalid_path(field_name) from error
    if not child.is_relative_to(resolved):
        raise _invalid_path(field_name)


def validate_local_path_shape(
    value: str,
    field_name: str,
    *,
    preflight_native: bool = True,
) -> None:
    """Reject ambiguous, remote, or traversing path syntax for a local-only field.

    Fully-qualified local POSIX paths and fully-qualified local Windows drive
    paths are accepted lexically even when validation runs on the other OS.
    By default, paths native to the current host are also preflighted for direct
    symlinks and fixed cache/temp child escapes. I/O helpers disable that early
    preflight and repeat the native checks immediately before use.
    """
    if not value or not value.strip() or "\x00" in value:
        raise _invalid_path(field_name)

    if value.startswith(_DEVICE_PREFIXES) or value.startswith(_NETWORK_PREFIXES):
        raise _invalid_path(field_name)

    normalized_parts = value.replace("\\", "/").split("/")
    if any(part in {".", ".."} for part in normalized_parts):
        raise ValueError(f"Invalid analysis job request: path traversal detected in '{field_name}'")

    posix_path = PurePosixPath(value)
    windows_path = PureWindowsPath(value)

    if windows_path.drive:
        if not windows_path.root:
            raise _invalid_path(field_name)
        if preflight_native:
            _preflight_native_path(value, field_name)
        return

    if posix_path.is_absolute():
        if preflight_native:
            _preflight_native_path(value, field_name)
        return

    # A Windows root-relative path such as ``\Music\song.wav`` has no drive and
    # therefore inherits ambient drive authority. All other remaining shapes
    # are ordinary relative paths. Neither is accepted by this local I/O API.
    raise _invalid_path(field_name)


def resolve_local_source_path(value: str, field_name: str = "localSource.sourcePath") -> Path:
    """Return a canonical native source path without following a direct symlink.

    Existing paths must be regular files. A missing but otherwise authorized
    path is returned canonically so the existing separation worker remains the
    single source of the payload-safe ``Audio source file not found`` result.
    This preserves orchestration compatibility while keeping lexical authority
    and direct-symlink checks ahead of decoder access.
    """
    validate_local_path_shape(value, field_name, preflight_native=False)
    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        raise _invalid_path(field_name)
    if candidate.is_symlink():
        raise _invalid_path(field_name)

    try:
        resolved = candidate.resolve(strict=False)
    except (OSError, RuntimeError) as error:
        raise _invalid_path(field_name) from error

    if resolved.exists() and not resolved.is_file():
        raise _invalid_path(field_name)
    return resolved


def resolve_authorized_child_path(
    root_value: str,
    field_name: str,
    *relative_parts: str,
) -> Path:
    """Return a canonical repository-owned child that remains inside its local root.

    Existing symlinks in fixed child directories are resolved before containment
    is checked. This closes the common pre-existing-symlink escape while keeping
    caller-controlled values out of child path components. It is not a claim of
    descriptor-level race freedom: a privileged local actor could still swap a
    path after validation and before a later open, so callers must keep the
    validation-to-I/O interval bounded and treat stronger descriptor-based I/O
    as a separate hardening layer when that threat model is required.
    """
    validate_local_path_shape(root_value, field_name, preflight_native=False)
    root = Path(root_value).expanduser()
    if not root.is_absolute() or root.is_symlink():
        raise _invalid_path(field_name)

    try:
        resolved_root = root.resolve(strict=False)
        candidate = resolved_root.joinpath(*relative_parts).resolve(strict=False)
    except (OSError, RuntimeError) as error:
        raise _invalid_path(field_name) from error

    if not candidate.is_relative_to(resolved_root):
        raise _invalid_path(field_name)
    return candidate

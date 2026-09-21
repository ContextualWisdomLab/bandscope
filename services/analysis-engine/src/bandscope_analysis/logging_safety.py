"""Bounded rendering helpers for untrusted analysis log fields."""

from __future__ import annotations

MAX_LOG_DIAGNOSTIC_CHARS = 1024
MAX_LOG_TYPE_CHARS = 128
_LOG_TRUNCATION_SUFFIX = "...<truncated>"


def _safe_type_name(value: object) -> str:
    """Read a bounded runtime type name without invoking instance or metaclass hooks."""
    value_type = object.__getattribute__(value, "__class__")
    type_name = type.__getattribute__(value_type, "__name__")
    if type(type_name) is not str:
        return "unknown"
    return single_line_log_text(type_name, max_chars=MAX_LOG_TYPE_CHARS)


def single_line_log_text(
    value: str,
    *,
    max_chars: int = MAX_LOG_DIAGNOSTIC_CHARS,
) -> str:
    """Escape controls and cap one untrusted textual log field.

    The function stops reading input once the rendered budget is exhausted, so
    oversized buyer/dependency text cannot force a full-size escaped copy solely
    for routine diagnostics.
    """
    if max_chars < len(_LOG_TRUNCATION_SUFFIX):
        raise ValueError("max_chars is too small for the truncation marker")

    chunks: list[str] = []
    rendered_chars = 0
    truncated = False
    for character in value:
        safe_character = (
            character
            if character.isprintable()
            else character.encode("unicode_escape").decode("ascii")
        )
        if rendered_chars + len(safe_character) > max_chars:
            truncated = True
            break
        chunks.append(safe_character)
        rendered_chars += len(safe_character)

    if truncated:
        while chunks and rendered_chars + len(_LOG_TRUNCATION_SUFFIX) > max_chars:
            rendered_chars -= len(chunks.pop())
        chunks.append(_LOG_TRUNCATION_SUFFIX)

    return "".join(chunks)


def safe_log_value(value: object) -> str:
    """Render an untrusted log value without executing arbitrary representation code."""
    if type(value) is str:
        return single_line_log_text(value)
    return f"<{_safe_type_name(value)}>"


def safe_exception_summary(error: BaseException) -> str:
    """Render a bounded exception summary without calling dependency ``str``/``repr``."""
    error_type = _safe_type_name(error)
    try:
        args = BaseException.args.__get__(error, type(error))
    except Exception:
        return error_type

    if not args or type(args[0]) is not str or not args[0]:
        return error_type

    message_budget = MAX_LOG_DIAGNOSTIC_CHARS - len(error_type) - 2
    if message_budget < len(_LOG_TRUNCATION_SUFFIX):
        return error_type
    return f"{error_type}: {single_line_log_text(args[0], max_chars=message_budget)}"

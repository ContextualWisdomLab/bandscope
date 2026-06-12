"""Utility functions for section processing."""

from __future__ import annotations

import logging
from typing import Any


def validate_section(section: Any, index: int, logger: logging.Logger) -> str:
    """Return a stable section id, warning when section data is malformed."""
    if not isinstance(section, dict):
        logger.warning(
            "Invalid section format at index %d; expected dict, got %s",
            index,
            type(section).__name__,
        )
        return f"section-{index}"
    return str(section.get("id", f"section-{index}"))

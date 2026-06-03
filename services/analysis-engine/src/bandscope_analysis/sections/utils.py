"""Utility functions for section processing."""

import logging
from typing import Any


def validate_section(section: Any, index: int, logger: logging.Logger) -> str:
    """Validates a section dictionary and returns its ID.

    Args:
        section: The section to validate.
        index: The index of the section in the list.
        logger: The logger to use for warnings.

    Returns:
        The section ID.
    """
    if not isinstance(section, dict):
        logger.warning(
            "Invalid section format at index %d; expected dict, got %s",
            index,
            type(section).__name__,
        )
        return f"section-{index}"
    return section.get("id", f"section-{index}")

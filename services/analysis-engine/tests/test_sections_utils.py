"""Tests for the section utils functions."""

from __future__ import annotations

import logging
from unittest.mock import MagicMock

from bandscope_analysis.sections.utils import validate_section


def test_validate_section_valid_with_id() -> None:
    """Test validate_section with a valid section containing an 'id'."""
    logger = MagicMock(spec=logging.Logger)
    section = {"id": "verse-1", "label": "verse"}

    result = validate_section(section, 0, logger)

    assert result == "verse-1"
    logger.warning.assert_not_called()


def test_validate_section_valid_without_id() -> None:
    """Test validate_section with a valid dict but missing an 'id'."""
    logger = MagicMock(spec=logging.Logger)
    section = {"label": "chorus"}

    result = validate_section(section, 5, logger)

    assert result == "section-5"
    logger.warning.assert_not_called()


def test_validate_section_invalid_type() -> None:
    """Test validate_section with an invalid section type (not a dict)."""
    logger = MagicMock(spec=logging.Logger)
    section = "not a dict"

    result = validate_section(section, 2, logger)

    assert result == "section-2"
    logger.warning.assert_called_once_with(
        "Invalid section format at index %d; expected dict, got %s",
        2,
        "str",
    )


def test_validate_section_none_type() -> None:
    """Test validate_section with None."""
    logger = MagicMock(spec=logging.Logger)
    section = None

    result = validate_section(section, 3, logger)

    assert result == "section-3"
    logger.warning.assert_called_once_with(
        "Invalid section format at index %d; expected dict, got %s",
        3,
        "NoneType",
    )

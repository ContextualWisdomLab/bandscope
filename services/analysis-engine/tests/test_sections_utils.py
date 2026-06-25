"""Tests for sections utility functions."""

import logging
from unittest.mock import MagicMock

from bandscope_analysis.sections.utils import validate_section


def test_validate_section_valid_with_id():
    """Test that validate_section returns the id when provided."""
    logger = MagicMock(spec=logging.Logger)
    section = {"id": "verse-1", "name": "Verse 1"}
    result = validate_section(section, 0, logger)
    assert result == "verse-1"
    logger.warning.assert_not_called()


def test_validate_section_valid_without_id():
    """Test that validate_section returns index-based string when no id provided."""
    logger = MagicMock(spec=logging.Logger)
    section = {"name": "Verse 1"}
    result = validate_section(section, 1, logger)
    assert result == "section-1"
    logger.warning.assert_not_called()


def test_validate_section_invalid_type():
    """Test that validate_section logs a warning and returns default when section is not dict."""
    logger = MagicMock(spec=logging.Logger)
    section = ["not", "a", "dict"]
    result = validate_section(section, 2, logger)
    assert result == "section-2"
    logger.warning.assert_called_once_with(
        "Invalid section format at index %d; expected dict, got %s", 2, "list"
    )


def test_validate_section_id_not_string():
    """Test that validate_section converts id to a string if it's not a string."""
    logger = MagicMock(spec=logging.Logger)
    section = {"id": 123}
    result = validate_section(section, 3, logger)
    assert result == "123"
    logger.warning.assert_not_called()

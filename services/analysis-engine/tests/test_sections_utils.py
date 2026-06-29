"""Tests for section utility functions."""

import logging
from unittest.mock import Mock

from bandscope_analysis.sections.utils import validate_section


def test_validate_section_valid_dict_with_id():
    """Verify validate_section returns the id when given a valid dictionary with an id."""
    mock_logger = Mock(spec=logging.Logger)
    section = {"id": "custom-id", "label": "intro"}

    result = validate_section(section, index=1, logger=mock_logger)

    assert result == "custom-id"
    mock_logger.warning.assert_not_called()


def test_validate_section_valid_dict_without_id():
    """Verify validate_section returns a generated id when given a dictionary without an id."""
    mock_logger = Mock(spec=logging.Logger)
    section = {"label": "intro"}

    result = validate_section(section, index=2, logger=mock_logger)

    assert result == "section-2"
    mock_logger.warning.assert_not_called()


def test_validate_section_invalid_type():
    """Verify validate_section logs a warning and returns a generated id for invalid type."""
    mock_logger = Mock(spec=logging.Logger)
    section = ["intro"]

    result = validate_section(section, index=3, logger=mock_logger)

    assert result == "section-3"
    mock_logger.warning.assert_called_once_with(
        "Invalid section format at index %d; expected dict, got %s",
        3,
        "list",
    )

"""Tests for section utility functions."""

import logging
from unittest.mock import Mock

import pytest

from bandscope_analysis.sections.utils import validate_section


@pytest.mark.parametrize(
    ("section", "index", "expected_id"),
    [
        ({"id": "custom-id", "label": "intro"}, 1, "custom-id"),
        ({"label": "intro"}, 2, "section-2"),
    ],
)
def test_validate_section_accepts_dict_sections(
    section: dict[str, str], index: int, expected_id: str
) -> None:
    """Verify valid section dictionaries return stable ids without warnings."""
    mock_logger = Mock(spec=logging.Logger)

    result = validate_section(section, index=index, logger=mock_logger)

    assert result == expected_id
    mock_logger.warning.assert_not_called()


def test_validate_section_warns_for_invalid_section_type() -> None:
    """Verify invalid sections log type context and return a generated id."""
    mock_logger = Mock(spec=logging.Logger)

    result = validate_section(["intro"], index=3, logger=mock_logger)

    assert result == "section-3"
    mock_logger.warning.assert_called_once()
    warning_context = " ".join(str(value) for value in mock_logger.warning.call_args.args)
    assert "3" in warning_context
    assert "list" in warning_context

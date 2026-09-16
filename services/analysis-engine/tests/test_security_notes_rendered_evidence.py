"""Regression coverage for rendered Security Notes evidence admission."""

from pathlib import Path
from runpy import run_path

REPO_ROOT = Path(__file__).resolve().parents[3]
SECURITY_NOTES_CHECK = run_path(str(REPO_ROOT / "scripts" / "checks" / "verify_security_notes.py"))
security_notes_section = SECURITY_NOTES_CHECK["security_notes_section"]


def test_security_notes_section_excludes_example_only_required_evidence() -> None:
    """Non-Markdown example blocks cannot satisfy required Security Notes evidence."""
    document = (
        "# Example\n\n"
        "## Security Notes\n\n"
        "visible-only-token\n\n"
        "```text\n"
        "Attack surface\n"
        "Trust boundary\n"
        "```\n\n"
        "    Mitigations\n"
        "    Test points\n\n"
        "<!--\n"
        "Realistic threats\n"
        "Remaining risk\n"
        "-->\n\n"
        "## Operations\n"
    )

    section = security_notes_section(document)

    assert "visible-only-token" in section
    assert "attack surface" not in section
    assert "trust boundary" not in section
    assert "mitigations" not in section
    assert "test points" not in section
    assert "realistic threats" not in section
    assert "remaining risk" not in section


def test_security_notes_section_preserves_visible_required_evidence() -> None:
    """Ordinary rendered Markdown prose remains admissible policy evidence."""
    document = (
        "# Example\n\n"
        "## Security Notes\n\n"
        "Attack surface and trust boundary are explicit.\n\n"
        "Mitigations and test points are explicit.\n\n"
        "Realistic threats and remaining risk are explicit.\n\n"
        "## Operations\n"
    )

    section = security_notes_section(document)

    assert "attack surface" in section
    assert "trust boundary" in section
    assert "mitigations" in section
    assert "test points" in section
    assert "realistic threats" in section
    assert "remaining risk" in section

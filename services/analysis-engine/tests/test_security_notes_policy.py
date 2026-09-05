"""Regression coverage for the repository Security Notes documentation contract."""

from pathlib import Path
import runpy


REPO_ROOT = Path(__file__).resolve().parents[3]
SECURITY_NOTES_CHECK = runpy.run_path(str(REPO_ROOT / "scripts" / "checks" / "verify_security_notes.py"))
security_notes_section = SECURITY_NOTES_CHECK["security_notes_section"]


def test_security_notes_section_stops_at_next_peer_heading() -> None:
    """Do not let unrelated peer sections satisfy missing Security Notes evidence."""
    document = """# Example\n\n## Security Notes\n\nAttack surface and trust boundary are defined here.\n\n## Operations\n\nMitigations, test points, realistic threats, and remaining risk are documented elsewhere.\n"""

    section = security_notes_section(document)

    assert "attack surface" in section
    assert "trust boundary" in section
    assert "mitigations" not in section
    assert "test points" not in section
    assert "realistic threats" not in section
    assert "remaining risk" not in section


def test_local_project_format_uses_required_security_notes_heading() -> None:
    """Keep the project-format security section under the repository-mandated heading."""
    project_format = (REPO_ROOT / "docs" / "engineering" / "local-project-format.md").read_text(
        encoding="utf-8"
    )

    assert "## Security Notes" in project_format
    assert "## Security Constraints" not in project_format

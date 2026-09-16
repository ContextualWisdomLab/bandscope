"""Regression coverage for the repository Security Notes documentation contract."""

from pathlib import Path
from runpy import run_path

REPO_ROOT = Path(__file__).resolve().parents[3]
SECURITY_NOTES_CHECK = run_path(str(REPO_ROOT / "scripts" / "checks" / "verify_security_notes.py"))
security_notes_section = SECURITY_NOTES_CHECK["security_notes_section"]


def test_security_notes_section_stops_at_next_peer_heading() -> None:
    """Do not let unrelated peer sections satisfy missing Security Notes evidence."""
    document = (
        "# Example\n\n"
        "## Security Notes\n\n"
        "Attack surface and trust boundary are defined here.\n\n"
        "## Operations\n\n"
        "Mitigations, test points, realistic threats, and remaining risk are "
        "documented elsewhere.\n"
    )

    section = security_notes_section(document)

    assert "attack surface" in section
    assert "trust boundary" in section
    assert "mitigations" not in section
    assert "test points" not in section
    assert "realistic threats" not in section
    assert "remaining risk" not in section


def test_security_notes_section_stops_when_parent_section_resumes() -> None:
    """Keep a nested Security Notes section from consuming a later parent section."""
    document = (
        "# Example\n\n"
        "## Design\n\n"
        "### Security Notes\n\n"
        "Attack surface and trust boundary are defined here.\n\n"
        "## Operations\n\n"
        "Mitigations, test points, realistic threats, and remaining risk are "
        "documented elsewhere.\n"
    )

    section = security_notes_section(document)

    assert "attack surface" in section
    assert "trust boundary" in section
    assert "mitigations" not in section
    assert "test points" not in section
    assert "realistic threats" not in section
    assert "remaining risk" not in section


def test_security_notes_section_ignores_fenced_code_headings() -> None:
    """A fenced example cannot impersonate the governed Security Notes section."""
    document = (
        "# Example\n\n"
        "```markdown\n"
        "## Security Notes\n\n"
        "Attack surface, trust boundary, mitigations, test points, realistic threats, "
        "and remaining risk appear only in this example.\n"
        "```\n\n"
        "## Operations\n\n"
        "No governed security section follows.\n"
    )

    assert security_notes_section(document) == ""


def test_security_notes_section_uses_real_heading_after_fenced_example() -> None:
    """Select the real section when a fenced example contains a lookalike heading first."""
    document = (
        "# Example\n\n"
        "~~~markdown\n"
        "## Security Notes\n\n"
        "fenced-only-token\n"
        "~~~\n\n"
        "## Security Notes\n\n"
        "real-only-token\n\n"
        "## Operations\n"
    )

    section = security_notes_section(document)

    assert "real-only-token" in section
    assert "fenced-only-token" not in section


def test_security_notes_section_ignores_indented_code_headings() -> None:
    """Four-space indented code cannot impersonate a governed Markdown heading."""
    document = (
        "# Example\n\n"
        "    ## Security Notes\n\n"
        "    Attack surface, trust boundary, mitigations, test points, realistic threats, "
        "and remaining risk appear only in an indented code sample.\n\n"
        "## Operations\n\n"
        "No governed security section follows.\n"
    )

    assert security_notes_section(document) == ""


def test_security_notes_section_accepts_three_space_atx_heading() -> None:
    """Preserve CommonMark's allowance for up to three leading spaces on ATX headings."""
    document = (
        "# Example\n\n"
        "   ## Security Notes\n\n"
        "real-only-token\n\n"
        "## Operations\n"
    )

    assert "real-only-token" in security_notes_section(document)


def test_security_notes_heading_requires_space_before_closing_hashes() -> None:
    """Do not erase a literal trailing hash that CommonMark treats as heading content."""
    document = (
        "# Example\n\n"
        "## Security Notes#\n\n"
        "Attack surface, trust boundary, mitigations, test points, realistic threats, "
        "and remaining risk appear under a different heading.\n"
    )

    assert security_notes_section(document) == ""


def test_security_notes_heading_accepts_commonmark_closing_hashes() -> None:
    """Accept an optional closing hash sequence when whitespace separates it from text."""
    document = (
        "# Example\n\n"
        "## Security Notes ###\n\n"
        "real-only-token\n\n"
        "## Operations\n"
    )

    assert "real-only-token" in security_notes_section(document)


def test_security_notes_section_ignores_html_comment_headings() -> None:
    """A raw HTML comment cannot impersonate the governed Security Notes section."""
    document = (
        "# Example\n\n"
        "<!--\n"
        "## Security Notes\n\n"
        "Attack surface, trust boundary, mitigations, test points, realistic threats, "
        "and remaining risk appear only inside a comment.\n"
        "-->\n\n"
        "## Operations\n\n"
        "No governed security section follows.\n"
    )

    assert security_notes_section(document) == ""


def test_security_notes_section_uses_real_heading_after_html_comment() -> None:
    """Select the real section after an HTML comment contains a lookalike heading."""
    document = (
        "# Example\n\n"
        "<!--\n"
        "## Security Notes\n\n"
        "comment-only-token\n"
        "-->\n\n"
        "## Security Notes\n\n"
        "real-only-token\n\n"
        "## Operations\n"
    )

    section = security_notes_section(document)

    assert "real-only-token" in section
    assert "comment-only-token" not in section


def test_security_notes_section_ignores_commonmark_raw_html_blocks() -> None:
    """Raw HTML blocks of every CommonMark class cannot impersonate Security Notes."""
    keyword_line = (
        "Attack surface, trust boundary, mitigations, test points, realistic threats, "
        "and remaining risk appear only inside raw HTML."
    )
    raw_blocks = [
        f"<script>\n## Security Notes\n{keyword_line}\n</script>",
        f"<?policy\n## Security Notes\n{keyword_line}\n?>",
        f"<!DOCTYPE policy\n## Security Notes\n{keyword_line}\n>",
        f"<![CDATA[\n## Security Notes\n{keyword_line}\n]]>",
        f"<div>\n## Security Notes\n{keyword_line}",
        f"<security-example>\n## Security Notes\n{keyword_line}",
    ]

    for raw_block in raw_blocks:
        document = f"# Example\n\n{raw_block}\n\n## Operations\nNo governed security section follows.\n"
        assert security_notes_section(document) == "", raw_block


def test_security_notes_section_uses_real_heading_after_raw_html_block() -> None:
    """Resume Markdown heading admission after a blank-terminated raw HTML block."""
    document = (
        "# Example\n\n"
        "<div>\n"
        "## Security Notes\n"
        "html-only-token\n\n"
        "## Security Notes\n\n"
        "real-only-token\n\n"
        "## Operations\n"
    )

    section = security_notes_section(document)

    assert "real-only-token" in section
    assert "html-only-token" not in section


def test_local_project_format_uses_required_security_notes_heading() -> None:
    """Keep the project-format security section under the repository-mandated heading."""
    project_format = (REPO_ROOT / "docs" / "engineering" / "local-project-format.md").read_text(
        encoding="utf-8"
    )

    assert "## Security Notes" in project_format
    assert "## Security Constraints" not in project_format

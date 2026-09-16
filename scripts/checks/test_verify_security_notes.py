"""Regression tests for the repository Security Notes policy."""

import tempfile
import unittest
from pathlib import Path

from verify_security_notes import find_security_notes_violations


class SecurityNotesPolicyTests(unittest.TestCase):
    """Keep plan enforcement strict while doctoring enforcement stays explicitly scoped."""

    def setUp(self) -> None:
        """Create isolated plan and doctoring roots for each policy case."""
        self._temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self._temporary_directory.name)
        self.plan_dir = self.root / "docs" / "plans"
        self.doctoring_dir = self.root / "docs" / "doctoring"
        self.plan_dir.mkdir(parents=True)
        self.doctoring_dir.mkdir(parents=True)

    def tearDown(self) -> None:
        """Release temporary policy fixtures."""
        self._temporary_directory.cleanup()

    def _violations(self) -> list[str]:
        return find_security_notes_violations(self.plan_dir, self.doctoring_dir)

    def test_registered_doctoring_security_boundary_is_machine_enforced(self) -> None:
        """Deleting or emptying reviewed doctoring trust-boundary evidence must turn RED."""
        path = self.doctoring_dir / "sidebar-disabled-tooltips.md"
        path.write_text(
            "# Tooltip evidence\n\n"
            "Security Notes were reviewed, but this is not the governed heading.\n"
            "A runtime trust-boundary claim outside that section cannot satisfy the gate.\n\n"
            "## References\n\n"
            "https://developer.mozilla.org/example\n",
            encoding="utf-8",
        )
        self.assertEqual(self._violations(), [str(path)])

        for invalid_section in [
            "The external URL creates no runtime trust-boundary path.\n",
            "### Trust boundary\n",
            "### Trust boundary\n\ntrust boundary\n",
            "### Trust boundary\n\nThe trust boundary.\n",
        ]:
            with self.subTest(invalid_section=invalid_section):
                path.write_text(
                    "# Tooltip evidence\n\n"
                    "## Security Notes\n\n"
                    f"{invalid_section}\n"
                    "## References\n\n"
                    "https://developer.mozilla.org/example\n",
                    encoding="utf-8",
                )
                self.assertEqual(
                    self._violations(),
                    [f"{path} missing Security Notes trust-boundary statement"],
                )

        path.write_text(
            "# Tooltip evidence\n\n"
            "## Security Notes\n\n"
            "### Trust boundary\n\n"
            "A documentation URL creates no runtime trust-boundary path.\n\n"
            "## References\n\n"
            "https://developer.mozilla.org/example\n",
            encoding="utf-8",
        )
        self.assertEqual(self._violations(), [])

    def test_doctoring_code_blocks_cannot_satisfy_security_evidence(self) -> None:
        """Fenced and indented code must not impersonate governed Markdown evidence."""
        path = self.doctoring_dir / "sidebar-disabled-tooltips.md"
        valid_looking_evidence = (
            "## Security Notes\n\n"
            "### Trust boundary\n\n"
            "A documentation URL creates no runtime trust-boundary path.\n"
        )

        path.write_text(
            "# Tooltip evidence\n\n```markdown\n"
            f"{valid_looking_evidence}```\n",
            encoding="utf-8",
        )
        self.assertEqual(self._violations(), [str(path)])

        indented = "\n".join(f"    {line}" for line in valid_looking_evidence.splitlines())
        path.write_text(
            f"# Tooltip evidence\n\n{indented}\n",
            encoding="utf-8",
        )
        self.assertEqual(self._violations(), [str(path)])

    def test_doctoring_html_comments_cannot_satisfy_security_evidence(self) -> None:
        """A hidden HTML comment must not impersonate rendered governance evidence."""
        path = self.doctoring_dir / "sidebar-disabled-tooltips.md"
        path.write_text(
            "# Tooltip evidence\n\n"
            "<!--\n"
            "## Security Notes\n\n"
            "### Trust boundary\n\n"
            "A documentation URL creates no runtime trust-boundary path.\n"
            "-->\n",
            encoding="utf-8",
        )
        self.assertEqual(self._violations(), [str(path)])

    def test_html_comment_block_terminator_cannot_expose_policy_heading(self) -> None:
        """Trailing text on an HTML-comment block line must remain raw HTML, not policy."""
        path = self.doctoring_dir / "sidebar-disabled-tooltips.md"
        valid_tail = (
            "## Security Notes\n\n"
            "### Trust boundary\n\n"
            "A documentation URL creates no runtime trust-boundary path.\n"
        )
        comment_forms = [
            f"<!-- -->{valid_tail}",
            f"<!--\n-->{valid_tail}",
        ]

        for comment_form in comment_forms:
            with self.subTest(comment_form=comment_form.splitlines()[0]):
                path.write_text(
                    f"# Tooltip evidence\n\n{comment_form}",
                    encoding="utf-8",
                )
                self.assertEqual(self._violations(), [str(path)])

    def test_inline_multiline_comment_closing_line_cannot_promote_policy_heading(self) -> None:
        """An inline comment continuation cannot turn its closing-line suffix into a heading."""
        path = self.doctoring_dir / "sidebar-disabled-tooltips.md"
        path.write_text(
            "# Tooltip evidence\n\n"
            "Visible introduction <!--\n"
            "-->## Security Notes\n\n"
            "### Trust boundary\n\n"
            "A documentation URL creates no runtime trust-boundary path.\n",
            encoding="utf-8",
        )
        self.assertEqual(self._violations(), [str(path)])

    def test_doctoring_raw_html_blocks_cannot_satisfy_security_evidence(self) -> None:
        """CommonMark raw-HTML blocks must not impersonate doctoring policy evidence."""
        path = self.doctoring_dir / "sidebar-disabled-tooltips.md"
        evidence = (
            "## Security Notes\n\n"
            "### Trust boundary\n\n"
            "A documentation URL creates no runtime trust-boundary path."
        )
        raw_blocks = [
            f"<script>\n{evidence}\n</script>",
            f"<?policy\n{evidence}\n?>",
            f"<!DOCTYPE policy\n{evidence}\n>",
            f"<![CDATA[\n{evidence}\n]]>",
            f"<div>\n{evidence}",
            f"<security-example>\n{evidence}",
        ]

        for raw_block in raw_blocks:
            with self.subTest(raw_block=raw_block.splitlines()[0]):
                path.write_text(f"# Tooltip evidence\n\n{raw_block}\n", encoding="utf-8")
                self.assertEqual(self._violations(), [str(path)])

    def test_unregistered_doctoring_reference_does_not_gain_boilerplate(self) -> None:
        """An ordinary research citation stays outside the opt-in doctoring policy."""
        path = self.doctoring_dir / "ordinary-reference.md"
        path.write_text(
            "# Research note\n\nReference: https://example.com/paper\n",
            encoding="utf-8",
        )
        self.assertEqual(self._violations(), [])

    def test_plan_six_subsection_policy_remains_unchanged(self) -> None:
        """Plans still require every existing Security Notes subsection."""
        path = self.plan_dir / "example.md"
        path.write_text(
            "# Plan\n\n"
            "## Security Notes\n\n"
            "### Attack surface\nA\n"
            "### Trust boundary\nB\n"
            "### Mitigations\nC\n"
            "### Test points\nD\n"
            "### Realistic threats\nE\n",
            encoding="utf-8",
        )
        self.assertEqual(
            self._violations(),
            [f"{path} missing subsection: remaining risk"],
        )

        with path.open("a", encoding="utf-8") as handle:
            handle.write("### Remaining risk\nF\n")
        self.assertEqual(self._violations(), [])

    def test_plan_example_blocks_cannot_supply_required_security_evidence(self) -> None:
        """Required plan evidence must remain visible Markdown, not example or hidden content."""
        path = self.plan_dir / "example.md"
        path.write_text(
            "# Plan\n\n"
            "## Security Notes\n\n"
            "Visible policy prose intentionally omits the six required terms.\n\n"
            "```text\n"
            "Attack surface\n"
            "Trust boundary\n"
            "```\n\n"
            "    Mitigations\n"
            "    Test points\n\n"
            "<!--\n"
            "Realistic threats\n"
            "Remaining risk\n"
            "-->\n",
            encoding="utf-8",
        )

        self.assertEqual(
            self._violations(),
            [
                f"{path} missing subsection: attack surface",
                f"{path} missing subsection: trust boundary",
                f"{path} missing subsection: mitigations",
                f"{path} missing subsection: test points",
                f"{path} missing subsection: realistic threats",
                f"{path} missing subsection: remaining risk",
            ],
        )

    def test_plan_hidden_security_heading_cannot_satisfy_policy(self) -> None:
        """A Security Notes heading inside non-rendered content cannot admit plan evidence."""
        path = self.plan_dir / "example.md"
        path.write_text(
            "# Plan\n\n"
            "```markdown\n"
            "## Security Notes\n"
            "Attack surface, trust boundary, mitigations, test points, realistic threats, "
            "and remaining risk.\n"
            "```\n",
            encoding="utf-8",
        )
        self.assertEqual(
            self._violations(),
            [
                f"{path} missing subsection: attack surface",
                f"{path} missing subsection: trust boundary",
                f"{path} missing subsection: mitigations",
                f"{path} missing subsection: test points",
                f"{path} missing subsection: realistic threats",
                f"{path} missing subsection: remaining risk",
            ],
        )

    def test_plan_security_notes_stop_at_next_peer_heading(self) -> None:
        """Later peer sections cannot backfill missing Security Notes evidence."""
        path = self.plan_dir / "example.md"
        path.write_text(
            "# Plan\n\n"
            "## Security Notes\n\n"
            "Attack surface and trust boundary are explicit.\n\n"
            "## Operations\n\n"
            "Mitigations, test points, realistic threats, and remaining risk are here.\n",
            encoding="utf-8",
        )
        self.assertEqual(
            self._violations(),
            [
                f"{path} missing subsection: mitigations",
                f"{path} missing subsection: test points",
                f"{path} missing subsection: realistic threats",
                f"{path} missing subsection: remaining risk",
            ],
        )

    def test_plan_heading_follows_commonmark_atx_boundaries(self) -> None:
        """Preserve three-space ATX headings and whitespace-delimited closing hashes."""
        path = self.plan_dir / "example.md"
        path.write_text(
            "# Plan\n\n"
            "   ## Security Notes ###\n\n"
            "Attack surface, trust boundary, mitigations, test points, realistic threats, "
            "and remaining risk are explicit.\n",
            encoding="utf-8",
        )
        self.assertEqual(self._violations(), [])

        path.write_text(
            "# Plan\n\n"
            "## Security Notes#\n\n"
            "Attack surface, trust boundary, mitigations, test points, realistic threats, "
            "and remaining risk are under a different heading.\n",
            encoding="utf-8",
        )
        self.assertEqual(
            self._violations(),
            [
                f"{path} missing subsection: attack surface",
                f"{path} missing subsection: trust boundary",
                f"{path} missing subsection: mitigations",
                f"{path} missing subsection: test points",
                f"{path} missing subsection: realistic threats",
                f"{path} missing subsection: remaining risk",
            ],
        )

    def test_plan_raw_html_blocks_and_inline_comments_are_not_policy_evidence(self) -> None:
        """Raw HTML and inline comments cannot impersonate headings or required prose."""
        path = self.plan_dir / "example.md"
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
            with self.subTest(raw_block=raw_block.splitlines()[0]):
                path.write_text(f"# Plan\n\n{raw_block}\n", encoding="utf-8")
                self.assertTrue(self._violations())

        path.write_text(
            "# Plan\n\n"
            "## Security Notes\n\n"
            "Attack surface and trust boundary are explicit.\n"
            "<!-- mitigations, test points, realistic threats, remaining risk -->\n",
            encoding="utf-8",
        )
        self.assertEqual(
            self._violations(),
            [
                f"{path} missing subsection: mitigations",
                f"{path} missing subsection: test points",
                f"{path} missing subsection: realistic threats",
                f"{path} missing subsection: remaining risk",
            ],
        )


if __name__ == "__main__":
    unittest.main()

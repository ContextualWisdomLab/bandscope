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
        """Deleting reviewed doctoring trust-boundary evidence must turn the gate RED."""
        path = self.doctoring_dir / "sidebar-disabled-tooltips.md"
        path.write_text(
            "# Tooltip evidence\n\n## References\n\nhttps://developer.mozilla.org/example\n",
            encoding="utf-8",
        )
        self.assertEqual(self._violations(), [str(path)])

        path.write_text(
            "# Tooltip evidence\n\n"
            "## Security Notes\n\n"
            "The external URL is documentation-only and creates no runtime trust-boundary path.\n\n"
            "## References\n\n"
            "https://developer.mozilla.org/example\n",
            encoding="utf-8",
        )
        self.assertEqual(self._violations(), [])

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


if __name__ == "__main__":
    unittest.main()

"""Regression tests for structured documentation verification."""

import importlib.util
from pathlib import Path
import unittest

MODULE_PATH = Path(__file__).with_name("verify_docs.py")
SPEC = importlib.util.spec_from_file_location("verify_docs", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load {MODULE_PATH}")
VERIFY_DOCS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY_DOCS)

RECOVERY_TRANSITIONS = (
    "NoSource --> RecoveringWithoutSource: project recovery requested",
    "Ready --> RecoveringWithSource: project recovery requested",
    "RecoveryFailedWithoutSource --> NoSource: recovery failure acknowledged",
    "RecoveryFailedWithSource --> Ready: recovery failure acknowledged / keep prior source",
)


class StateDiagramReferenceTests(unittest.TestCase):
    """Keep recovery transitions inside the executable Mermaid state model."""

    def test_rejects_transition_text_that_only_exists_in_prose(self) -> None:
        """Prose copies must not satisfy state-diagram structural requirements."""
        prose_only = "\n".join(RECOVERY_TRANSITIONS)

        missing = VERIFY_DOCS.missing_state_diagram_references(
            prose_only,
            RECOVERY_TRANSITIONS,
        )

        self.assertEqual(missing, list(RECOVERY_TRANSITIONS))

    def test_rejects_required_transition_that_only_exists_in_mermaid_comment(self) -> None:
        """Commented-out transitions must not satisfy the executable diagram gate."""
        diagram = "\n".join(
            (
                "```mermaid",
                "stateDiagram-v2",
                *(f"    {transition}" for transition in RECOVERY_TRANSITIONS[:-1]),
                f"    %% {RECOVERY_TRANSITIONS[-1]}",
                "```",
            )
        )

        missing = VERIFY_DOCS.missing_state_diagram_references(
            diagram,
            RECOVERY_TRANSITIONS,
        )

        self.assertEqual(missing, list(RECOVERY_TRANSITIONS))

    def test_rejects_required_transition_embedded_in_another_statement(self) -> None:
        """A required transition must be a complete statement, not label text."""
        diagram = "\n".join(
            (
                "```mermaid",
                "stateDiagram-v2",
                *(f"    {transition}" for transition in RECOVERY_TRANSITIONS[:-1]),
                f"    OtherState --> Ready: notes {RECOVERY_TRANSITIONS[-1]}",
                "```",
            )
        )

        missing = VERIFY_DOCS.missing_state_diagram_references(
            diagram,
            RECOVERY_TRANSITIONS,
        )

        self.assertEqual(missing, list(RECOVERY_TRANSITIONS))

    def test_ignores_note_text_with_colon_and_arrow(self) -> None:
        """Mermaid notes containing arrow-like text must not crash transition parsing."""
        diagram = "\n".join(
            (
                "stateDiagram-v2",
                "    note right of Ready: keep source --> after cancel",
                *(f"    {transition}" for transition in RECOVERY_TRANSITIONS),
            )
        )

        transitions = VERIFY_DOCS.mermaid_transition_statements(diagram)

        self.assertEqual(transitions, set(RECOVERY_TRANSITIONS))

    def test_accepts_transitions_in_state_diagram(self) -> None:
        """A Mermaid stateDiagram-v2 containing every transition satisfies the gate."""
        diagram = "\n".join(
            (
                "```mermaid",
                "stateDiagram-v2",
                *(f"    {transition}" for transition in RECOVERY_TRANSITIONS),
                "```",
            )
        )

        missing = VERIFY_DOCS.missing_state_diagram_references(
            diagram,
            RECOVERY_TRANSITIONS,
        )

        self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()

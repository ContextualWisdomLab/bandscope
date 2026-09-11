"""Verify Security Notes requirements for plans and selected doctoring evidence."""

from pathlib import Path

SECURITY_NOTES_TEXT = "Security Notes"
DOCTORING_SECURITY_NOTES_HEADING = "## Security Notes"
PLAN_DIR = Path("docs/plans")
DOCTORING_DIR = Path("docs/doctoring")
REQUIRED_SUBSECTIONS = [
    "attack surface",
    "trust boundary",
    "mitigations",
    "test points",
    "realistic threats",
    "remaining risk",
]

# Doctoring documents are opt-in because the six-subsection design-plan template is
# not meaningful for every research or implementation note. A registry entry is the
# machine-readable marker that a reviewed external-reference/trust-boundary claim
# must keep a Security Notes section. Entries may precede the dependent document's
# protected integration; absent files are therefore ignored until they exist.
DOCTORING_SECURITY_NOTES_REQUIRED = frozenset(
    {
        "sidebar-disabled-tooltips.md",
    }
)


def security_notes_section(content: str) -> str:
    """Extract the lowercased Security Notes section from a plan document."""
    lowered = content.lower()
    marker = SECURITY_NOTES_TEXT.lower()
    start = lowered.find(marker)
    if start == -1:
        return ""

    end_candidates = []
    for delimiter in ["\n---", "\n## approaches considered", "\n## decision"]:
        end = lowered.find(delimiter, start + len(marker))
        if end != -1:
            end_candidates.append(end)

    if not end_candidates:
        return lowered[start:]

    return lowered[start : min(end_candidates)]


def doctoring_security_notes_section(content: str) -> str:
    """Return only the body of an explicit level-two doctoring Security Notes heading."""
    lines = content.splitlines()
    heading = DOCTORING_SECURITY_NOTES_HEADING.casefold()
    for index, line in enumerate(lines):
        if line.strip().casefold() != heading:
            continue
        section_lines: list[str] = []
        for candidate in lines[index + 1 :]:
            if candidate.strip().startswith("## "):
                break
            section_lines.append(candidate)
        return "\n".join(section_lines).casefold()
    return ""


def _normalized_trust_boundary_text(content: str) -> str:
    """Normalize punctuation needed by doctoring trust-boundary assertions."""
    return doctoring_security_notes_section(content).replace("-", " ")


def find_security_notes_violations(
    plan_dir: Path = PLAN_DIR,
    doctoring_dir: Path = DOCTORING_DIR,
) -> list[str]:
    """Return deterministic plan and registered-doctoring Security Notes violations."""
    missing: list[str] = []

    for path in sorted(plan_dir.glob("*.md")):
        content = path.read_text(encoding="utf-8")
        if SECURITY_NOTES_TEXT not in content:
            missing.append(str(path))
            continue
        lowered = security_notes_section(content)
        for subsection in REQUIRED_SUBSECTIONS:
            if subsection not in lowered:
                missing.append(f"{path} missing subsection: {subsection}")

    for file_name in sorted(DOCTORING_SECURITY_NOTES_REQUIRED):
        path = doctoring_dir / file_name
        if not path.exists():
            continue
        content = path.read_text(encoding="utf-8")
        section = doctoring_security_notes_section(content)
        if not section:
            missing.append(str(path))
            continue
        if "trust boundary" not in _normalized_trust_boundary_text(content):
            missing.append(f"{path} missing Security Notes trust-boundary statement")

    return missing


def main() -> int:
    """Return a failing exit code when governed Security Notes evidence is incomplete."""
    missing = find_security_notes_violations()
    if missing:
        print("Missing or incomplete Security Notes evidence in:")
        for path in missing:
            print(f"- {path}")
        return 1

    print("Security Notes check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

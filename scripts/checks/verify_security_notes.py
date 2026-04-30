"""Verify that design-plan documents include a complete Security Notes section."""

from pathlib import Path

SECURITY_NOTES_TEXT = "Security Notes"
PLAN_DIR = Path("docs/plans")
REQUIRED_SUBSECTIONS = [
    "attack surface",
    "trust boundary",
    "mitigations",
    "test points",
    "realistic threats",
    "remaining risk",
]


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


def main() -> int:
    """Return a failing exit code when Security Notes or required subsections are missing."""
    missing: list[str] = []
    for path in sorted(PLAN_DIR.glob("*.md")):
        content = path.read_text(encoding="utf-8")
        if SECURITY_NOTES_TEXT not in content:
            missing.append(str(path))
            continue
        lowered = security_notes_section(content)
        for subsection in REQUIRED_SUBSECTIONS:
            if subsection not in lowered:
                missing.append(f"{path} missing subsection: {subsection}")

    if missing:
        print("Missing Security Notes section in:")
        for path in missing:
            print(f"- {path}")
        return 1

    print("Security Notes check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

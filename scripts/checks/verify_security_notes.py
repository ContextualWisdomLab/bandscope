"""Verify that security-sensitive design and traceability documents include Security Notes."""

from pathlib import Path

SECURITY_NOTES_TEXT = "Security Notes"
SECURITY_NOTE_DIRS = (Path("docs/plans"), Path("docs/traceability"))
REQUIRED_SUBSECTIONS = [
    "attack surface",
    "trust boundary",
    "mitigations",
    "test points",
    "realistic threats",
    "remaining risk",
]


def security_notes_section(content: str) -> str:
    """Extract the lowercased Security Notes section from a governed document."""
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


def governed_documents() -> list[Path]:
    """Return plan and traceability documents governed by the Security Notes contract."""
    return [
        path
        for directory in SECURITY_NOTE_DIRS
        for path in sorted(directory.glob("*.md"))
    ]


def main() -> int:
    """Return a failing exit code when Security Notes or required subsections are missing."""
    missing: list[str] = []
    for path in governed_documents():
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

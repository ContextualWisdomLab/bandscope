from pathlib import Path
import sys


SECURITY_NOTES_TEXT = "Security Notes"
PLAN_DIR = Path("docs/plans")
REQUIRED_SUBSECTIONS = [
    "attack surface",
    "trust boundary",
    "mitigations",
    "test points",
]


def main() -> int:
    missing: list[str] = []
    for path in sorted(PLAN_DIR.glob("*.md")):
        content = path.read_text(encoding="utf-8")
        if SECURITY_NOTES_TEXT not in content:
            missing.append(str(path))
            continue
        lowered = content.lower()
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

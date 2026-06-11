"""Verify that GitHub bootstrap policy docs are present and referenced."""

from pathlib import Path

REQUIRED_PATH = Path("docs/workflow/github-bootstrap-execution-policy.md")
REQUIRED_REFERENCES = {
    Path("README.md"): ["docs/workflow/github-bootstrap-execution-policy.md"],
    Path("AGENTS.md"): ["docs/workflow/github-bootstrap-execution-policy.md"],
    Path("ARCHITECTURE.md"): ["docs/workflow/github-bootstrap-execution-policy.md"],
}
REQUIRED_POLICY_TEXT = [
    "not a default blocker",
    "bootstrap condition",
    "Disallowed blockers",
    "Allowed blockers",
]


def main() -> int:
    """Return a failing exit code when bootstrap policy docs drift out of sync."""
    if not REQUIRED_PATH.exists():
        print(f"Missing GitHub bootstrap policy: {REQUIRED_PATH}")
        return 1

    content = REQUIRED_PATH.read_text(encoding="utf-8")
    missing_policy_text = [item for item in REQUIRED_POLICY_TEXT if item not in content]
    if missing_policy_text:
        print("GitHub bootstrap policy is missing required text:")
        for item in missing_policy_text:
            print(f"- {item}")
        return 1

    missing_refs: list[str] = []
    for path, refs in REQUIRED_REFERENCES.items():
        if not path.exists():
            missing_refs.append(f"missing referenced file: {path}")
            continue
        body = path.read_text(encoding="utf-8")
        for ref in refs:
            if ref not in body:
                missing_refs.append(f"{path} missing reference: {ref}")

    if missing_refs:
        print("GitHub bootstrap references missing:")
        for item in missing_refs:
            print(f"- {item}")
        return 1

    print("GitHub bootstrap policy check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

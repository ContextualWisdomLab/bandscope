from pathlib import Path
import re
import sys


RULES = [
    (
        re.compile(r"shell\s*=\s*True"),
        "Use shell=False-style subprocess execution only.",
    ),
    (
        re.compile(r"subprocess\.(run|Popen|call)\(\s*[\"']"),
        "Use argument arrays, not string commands, for subprocess calls.",
    ),
    (
        re.compile(r"pickle\.load\(|torch\.load\("),
        "Do not load untrusted pickle-style artifacts without a documented trust boundary.",
    ),
    (
        re.compile(r"curl\s+[^\n|]*\|\s*(sh|bash)"),
        "Do not add remote script piping patterns.",
    ),
    (
        re.compile(r"dangerouslySetInnerHTML|innerHTML\s*="),
        "Do not inject untrusted HTML into UI or WebView surfaces.",
    ),
]

TARGET_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx", ".sh", ".yml", ".yaml"}
EXCLUDED_PARTS = {"node_modules", ".venv", "dist", "coverage", "target"}
SELF_PATH = Path("scripts/checks/security_gates.py")


def should_scan(path: Path) -> bool:
    return path.suffix in TARGET_EXTENSIONS and not any(
        part in EXCLUDED_PARTS for part in path.parts
    )


def main() -> int:
    violations: list[str] = []

    for path in Path(".").rglob("*"):
        if not path.is_file() or not should_scan(path):
            continue
        if path == SELF_PATH:
            continue
        content = path.read_text(encoding="utf-8", errors="ignore")
        for pattern, message in RULES:
            if pattern.search(content):
                violations.append(f"{path}: {message}")

    if violations:
        print("Security gate violations:")
        for violation in violations:
            print(f"- {violation}")
        return 1

    print("Security pattern gate passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

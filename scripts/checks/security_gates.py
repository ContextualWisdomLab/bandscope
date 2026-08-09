"""Scan repository workspace source files for disallowed security patterns."""

import re
from pathlib import Path

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
        re.compile(
            r"\b(?:pickle|torch)\.load\b|"
            r"from\s+(?:torch|pickle)\s+import\s+load\b"
        ),
        "Do not load untrusted pickle-style artifacts without a documented trust boundary.",
    ),
    (
        re.compile(
            r"\btorch\.serialization\b|"
            r"from\s+torch\s+import\s+serialization\b"
        ),
        "Do not add or mutate PyTorch checkpoint reconstruction globals.",
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
EXCLUDED_PARTS = {"node_modules", ".venv", "dist", "coverage", "target", ".worktrees"}
SELF_PATH = Path("scripts/checks/security_gates.py")
VERIFIED_MODEL_LOADER_PATH = Path(
    "services/analysis-engine/src/bandscope_analysis/separation/audio_separator.py"
)
VERIFIED_MODEL_SAFE_GLOBALS_DEFINITION = (
    "def _trusted_checkpoint_globals(model_class: type[Any]) -> list[Any]:\n"
    '    """Return the minimal globals required by the exact htdemucs checkpoint."""\n'
    "    return [\n"
    "        model_class,\n"
    '        (_numpy_scalar, "numpy.core.multiarray.scalar"),\n'
    '        (np.dtype, "numpy.dtype"),\n'
    "        type(np.dtype(np.float64)),\n"
    "        Fraction,\n"
    "    ]\n"
)
VERIFIED_TORCH_LOAD_CALL = re.compile(
    r"with\s+torch\.serialization\.safe_globals\(\s*"
    r"_trusted_checkpoint_globals\(HTDemucs\)\s*\):\s*"
    r"# Exact full-SHA/size-verified bytes use a minimal restricted allowlist;\s*\n\s*"
    r"# ADR-0001 treats any future artifact hash as executable-code review\.\s*\n\s*"
    r"# nosemgrep: trailofbits\.python\.pickles-in-pytorch\.pickles-in-pytorch\s*\n\s*"
    r"package\s*=\s*torch\.load\(\s*# nosec B614\s*\n\s*"
    r"io\.BytesIO\(payload\),\s*"
    r"map_location=[\"']cpu[\"'],\s*"
    r"weights_only=True,?\s*"
    r"\)",
    re.MULTILINE,
)
VERIFIED_MODEL_LOADER_PREREQUISITES = (
    "payload = _read_verified_model_artifact(",
    "hashlib.sha256(payload).hexdigest()",
    "artifact.size_bytes",
    "stat.S_ISREG",
    '(_numpy_scalar, "numpy.core.multiarray.scalar")',
    '(np.dtype, "numpy.dtype")',
    "# nosemgrep: trailofbits.python.pickles-in-pytorch.pickles-in-pytorch",
)


def should_scan(path: Path) -> bool:
    """Return whether a path should be scanned for security-pattern violations."""
    return path.suffix in TARGET_EXTENSIONS and not any(
        part in EXCLUDED_PARTS for part in path.parts
    )


def _content_for_pattern_scan(relative_path: Path, content: str) -> str:
    """Remove only the one fully constrained checkpoint-deserialization call."""
    if relative_path != VERIFIED_MODEL_LOADER_PATH:
        return content
    if not all(token in content for token in VERIFIED_MODEL_LOADER_PREREQUISITES):
        return content
    if content.count("# nosemgrep") != 1 or content.count("# nosec") != 1:
        return content
    if content.count(VERIFIED_MODEL_SAFE_GLOBALS_DEFINITION) != 1:
        return content
    if len(VERIFIED_TORCH_LOAD_CALL.findall(content)) != 1:
        return content
    return VERIFIED_TORCH_LOAD_CALL.sub("verified_checkpoint_load()", content, count=1)


def security_pattern_violations(repo_root: Path = Path(".")) -> list[str]:
    """Return forbidden-pattern violations below ``repo_root``."""
    violations: list[str] = []

    for path in repo_root.rglob("*"):
        if not path.is_file() or not should_scan(path):
            continue
        relative_path = path.relative_to(repo_root)
        if relative_path == SELF_PATH:
            continue
        content = path.read_text(encoding="utf-8", errors="ignore")
        content = _content_for_pattern_scan(relative_path, content)
        for pattern, message in RULES:
            if pattern.search(content):
                violations.append(f"{relative_path}: {message}")
    return violations


def main() -> int:
    """Return a failing exit code when a forbidden security pattern is found."""
    violations = security_pattern_violations()

    if violations:
        print("Security gate violations:")
        for violation in violations:
            print(f"- {violation}")
        return 1

    print("Security pattern gate passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

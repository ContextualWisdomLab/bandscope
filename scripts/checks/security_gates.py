"""Scan repository workspace source files for disallowed security patterns."""

import ast
import hashlib
import os
import re
import sys
from pathlib import Path

CHECKPOINT_LOAD_MESSAGE = (
    "Do not load untrusted pickle-style artifacts without a documented trust boundary."
)
CHECKPOINT_GLOBALS_MESSAGE = (
    "Do not add or mutate PyTorch checkpoint reconstruction globals."
)
PICKLE_LOAD_PATTERN = re.compile(r"\bpickle\.load\b|from\s+pickle\s+import\s+load\b")

# Complete source-review anchors, not checkpoint provenance or production admission.
# Semantic edits (including docstrings) require renewed independent source-trust
# review and an explicit checked-in pin update; never derive trust at scan time.
UMX_REFERENCE_AST_SHA256 = {
    Path(
        "services/analysis-engine/tests/open_unmix_candidate.py"
    ): "1e378c81941b98596ee0549374c9ea1a89602601f47feb190e00babf1ee15085",
    Path(
        "services/analysis-engine/tests/test_open_unmix_candidate.py"
    ): "a4b833d67da3b10bc38ce974e2e60195e03a21c91f04aeabdb4952cde01bc482",
    Path(
        "services/analysis-engine/tests/run_open_unmix_candidate_smoke.py"
    ): "fb53a60706dcd68f3d2b85cc6060e8f992127137011342c379218d0d374a0745",
}

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
        CHECKPOINT_LOAD_MESSAGE,
    ),
    (
        re.compile(
            r"\btorch\.serialization\b|"
            r"from\s+torch\s+import\s+serialization\b"
        ),
        CHECKPOINT_GLOBALS_MESSAGE,
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
    "from numpy._core.multiarray import scalar as _numpy_scalar",
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


def _workspace_files(repo_root: Path) -> list[Path]:
    """Return repository files without descending into excluded dependency trees."""
    files: list[Path] = []
    for directory, dirnames, filenames in os.walk(repo_root):
        dirnames[:] = sorted(name for name in dirnames if name not in EXCLUDED_PARTS)
        directory_path = Path(directory)
        files.extend(directory_path / name for name in sorted(filenames))
    return files


def _is_reviewed_umx_reference(relative_path: Path, content: str) -> bool:
    """Recognize only fixed exact-path/full-AST reference source, never model bytes."""
    expected = UMX_REFERENCE_AST_SHA256.get(relative_path)
    if expected is None:
        return False
    try:
        tree = ast.parse(content)
        # Python 3.13+ omits empty fields by default; retain the complete 3.12
        # representation rather than accepting version-dependent source pins.
        dumped = (
            ast.dump(tree, include_attributes=False, **{"show_empty": True})
            if sys.version_info >= (3, 13)
            else ast.dump(tree, include_attributes=False)
        )
        fingerprint = hashlib.sha256(dumped.encode("utf-8")).hexdigest()
    except (SyntaxError, ValueError, RecursionError):
        return False
    return fingerprint == expected


def security_pattern_violations(repo_root: Path = Path(".")) -> list[str]:
    """Return forbidden-pattern violations below ``repo_root``."""
    violations: list[str] = []

    for path in _workspace_files(repo_root):
        relative_path = path.relative_to(repo_root)
        if not path.is_file() or not should_scan(relative_path):
            continue
        if relative_path == SELF_PATH:
            continue
        content = path.read_text(encoding="utf-8", errors="ignore")
        reviewed_umx = _is_reviewed_umx_reference(relative_path, content)
        content = _content_for_pattern_scan(relative_path, content)
        for pattern, message in RULES:
            if reviewed_umx and message == CHECKPOINT_GLOBALS_MESSAGE:
                continue
            if reviewed_umx and message == CHECKPOINT_LOAD_MESSAGE:
                # Recognizing the torch reference must never exempt pickle, even
                # when a dangerous marker is added only in an AST-neutral comment.
                pattern = PICKLE_LOAD_PATTERN
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

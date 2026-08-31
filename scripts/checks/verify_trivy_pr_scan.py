"""Fail closed when Trivy code scanning cannot run on pull-request heads."""

from pathlib import Path

TRIVY_WORKFLOW = Path(".github/workflows/trivy.yml")


def _indented_block(lines: list[str], header: str, indent: int) -> list[str]:
    """Return the YAML-like block nested under an exact-indentation mapping key."""
    prefix = " " * indent
    target = f"{prefix}{header}:"
    for index, line in enumerate(lines):
        if line != target:
            continue
        block: list[str] = []
        for candidate in lines[index + 1 :]:
            stripped = candidate.strip()
            if not stripped or stripped.startswith("#"):
                block.append(candidate)
                continue
            candidate_indent = len(candidate) - len(candidate.lstrip(" "))
            if candidate_indent <= indent:
                break
            block.append(candidate)
        return block
    return []


def _list_values(lines: list[str], header: str, indent: int) -> set[str]:
    """Return literal scalar list items nested under the requested mapping key."""
    block = _indented_block(lines, header, indent)
    item_prefix = " " * (indent + 2) + "- "
    return {
        line[len(item_prefix) :].strip()
        for line in block
        if line.startswith(item_prefix) and line[len(item_prefix) :].strip()
    }


def main() -> int:
    """Require the Trivy workflow to cover PRs targeting protected branches."""
    lines = TRIVY_WORKFLOW.read_text(encoding="utf-8").splitlines()
    pull_request_block = _indented_block(lines, "pull_request", 2)
    pr_targets = _list_values(pull_request_block, "branches", 4)
    jobs_block = _indented_block(lines, "jobs", 0)
    trivy_job = _indented_block(jobs_block, "trivy-fs-scan", 2)

    missing: list[str] = []
    if not pull_request_block:
        missing.append("pull_request event")
    for branch in ("develop", "main"):
        if branch not in pr_targets:
            missing.append(f"pull_request branch {branch!r}")
    if not trivy_job:
        missing.append("jobs.trivy-fs-scan")
    if not any(line.strip() == "format: sarif" for line in trivy_job):
        missing.append("SARIF output in jobs.trivy-fs-scan")
    if not any("uses: github/codeql-action/upload-sarif@" in line for line in trivy_job):
        missing.append("CodeQL SARIF upload in jobs.trivy-fs-scan")

    if missing:
        print("Trivy PR code-scanning contract is incomplete:")
        for item in missing:
            print(f"- missing {item}")
        return 1
    print("Trivy PR code-scanning contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

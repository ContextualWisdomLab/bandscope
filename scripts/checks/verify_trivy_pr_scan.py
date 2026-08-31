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


def _list_item_blocks(lines: list[str], header: str, indent: int) -> list[list[str]]:
    """Split one YAML-like sequence block into its top-level item blocks."""
    block = _indented_block(lines, header, indent)
    item_prefix = " " * (indent + 2) + "- "
    items: list[list[str]] = []
    current: list[str] = []
    for line in block:
        if line.startswith(item_prefix):
            if current:
                items.append(current)
            current = [line]
        elif current:
            current.append(line)
    if current:
        items.append(current)
    return items


def _step_action(step: list[str]) -> str | None:
    """Return the action reference from a workflow step, if the step uses one."""
    for line in step:
        stripped = line.strip()
        if stripped.startswith("- uses:"):
            return stripped.removeprefix("- uses:").strip()
        if stripped.startswith("uses:"):
            return stripped.removeprefix("uses:").strip()
    return None


def _mapping_value(lines: list[str], header: str, key: str) -> str | None:
    """Return a scalar from a nested mapping without borrowing sibling evidence."""
    target = f"{header}:"
    for index, line in enumerate(lines):
        if line.strip() != target:
            continue
        header_indent = len(line) - len(line.lstrip(" "))
        for candidate in lines[index + 1 :]:
            stripped = candidate.strip()
            if not stripped or stripped.startswith("#"):
                continue
            candidate_indent = len(candidate) - len(candidate.lstrip(" "))
            if candidate_indent <= header_indent:
                break
            key_prefix = f"{key}:"
            if stripped.startswith(key_prefix):
                value = stripped[len(key_prefix) :].strip()
                return value.strip("'\"") if value else None
        return None
    return None


def main() -> int:
    """Require the Trivy workflow to cover PRs targeting protected branches."""
    lines = TRIVY_WORKFLOW.read_text(encoding="utf-8").splitlines()
    pull_request_block = _indented_block(lines, "pull_request", 2)
    pr_targets = _list_values(pull_request_block, "branches", 4)
    jobs_block = _indented_block(lines, "jobs", 0)
    trivy_job = _indented_block(jobs_block, "trivy-fs-scan", 2)
    steps = _list_item_blocks(trivy_job, "steps", 4)

    trivy_outputs = {
        output
        for step in steps
        if (_step_action(step) or "").startswith("aquasecurity/trivy-action@")
        and _mapping_value(step, "with", "format") == "sarif"
        if (output := _mapping_value(step, "with", "output"))
    }
    uploaded_sarif = {
        sarif_file
        for step in steps
        if (_step_action(step) or "").startswith("github/codeql-action/upload-sarif@")
        if (sarif_file := _mapping_value(step, "with", "sarif_file"))
    }

    missing: list[str] = []
    if not pull_request_block:
        missing.append("pull_request event")
    for branch in ("develop", "main"):
        if branch not in pr_targets:
            missing.append(f"pull_request branch {branch!r}")
    if not trivy_job:
        missing.append("jobs.trivy-fs-scan")
    if not trivy_outputs:
        missing.append("Trivy SARIF-producing action step with an output file")
    if not uploaded_sarif:
        missing.append("CodeQL SARIF upload step with sarif_file")
    if trivy_outputs and uploaded_sarif and trivy_outputs.isdisjoint(uploaded_sarif):
        missing.append("matching Trivy output and CodeQL sarif_file")

    if missing:
        print("Trivy PR code-scanning contract is incomplete:")
        for item in missing:
            print(f"- missing {item}")
        return 1
    print("Trivy PR code-scanning contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

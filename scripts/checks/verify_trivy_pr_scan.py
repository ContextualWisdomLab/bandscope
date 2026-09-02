"""Fail closed when Trivy code scanning cannot run on pull-request heads."""

from fnmatch import fnmatchcase
from pathlib import Path

TRIVY_WORKFLOW = Path(".github/workflows/trivy.yml")


def _indented_block(workflow_lines: list[str], mapping_header: str, mapping_indent: int) -> list[str]:
    """Return the YAML-like block nested under an exact-indentation mapping key."""
    indent_prefix = " " * mapping_indent
    mapping_target = f"{indent_prefix}{mapping_header}:"
    for line_index, workflow_line in enumerate(workflow_lines):
        mapping_suffix = (
            workflow_line[len(mapping_target) :]
            if workflow_line.startswith(mapping_target)
            else ""
        )
        has_inline_comment = (
            bool(mapping_suffix)
            and mapping_suffix[0].isspace()
            and mapping_suffix.lstrip().startswith("#")
        )
        if workflow_line != mapping_target and not has_inline_comment:
            continue
        nested_block: list[str] = []
        for candidate_line in workflow_lines[line_index + 1 :]:
            candidate_text = candidate_line.strip()
            if not candidate_text or candidate_text.startswith("#"):
                nested_block.append(candidate_line)
                continue
            candidate_indent = len(candidate_line) - len(candidate_line.lstrip(" "))
            if candidate_indent <= mapping_indent:
                break
            nested_block.append(candidate_line)
        return nested_block
    return []


def _has_mapping_key(workflow_lines: list[str], mapping_header: str, mapping_indent: int) -> bool:
    """Return whether ``mapping_header`` is a key at exactly ``mapping_indent``."""
    mapping_prefix = f"{' ' * mapping_indent}{mapping_header}:"
    return any(workflow_line.startswith(mapping_prefix) for workflow_line in workflow_lines)


def _list_sequence(workflow_lines: list[str], mapping_header: str, mapping_indent: int) -> list[str]:
    """Return normalized YAML scalar list items in source order."""
    nested_block = _indented_block(workflow_lines, mapping_header, mapping_indent)
    item_prefix = " " * (mapping_indent + 2) + "- "
    normalized_items: list[str] = []
    for workflow_line in nested_block:
        if not workflow_line.startswith(item_prefix):
            continue
        raw_list_item = workflow_line[len(item_prefix) :].strip()
        if raw_list_item and (normalized_item := _yaml_scalar(raw_list_item)):
            normalized_items.append(normalized_item)
    return normalized_items


def _list_values(workflow_lines: list[str], mapping_header: str, mapping_indent: int) -> set[str]:
    """Return normalized YAML scalar list items under the requested mapping key."""
    return set(_list_sequence(workflow_lines, mapping_header, mapping_indent))


def _mapping_list_sequence(workflow_lines: list[str], mapping_header: str, mapping_indent: int) -> list[str]:
    """Return block- or inline-list scalar values in YAML source order."""
    mapping_prefix = f"{' ' * mapping_indent}{mapping_header}:"
    for workflow_line in workflow_lines:
        if not workflow_line.startswith(mapping_prefix):
            continue
        scalar_value = _yaml_scalar(workflow_line[len(mapping_prefix) :].strip())
        if not scalar_value:
            return _list_sequence(workflow_lines, mapping_header, mapping_indent)
        if scalar_value.startswith("[") and scalar_value.endswith("]"):
            return [
                normalized_item
                for item in scalar_value[1:-1].split(",")
                if (normalized_item := _yaml_scalar(item.strip()))
            ]
        return [scalar_value]
    return []


def _mapping_list_values(workflow_lines: list[str], mapping_header: str, mapping_indent: int) -> set[str]:
    """Return block- or inline-list scalar values for one mapping key."""
    return set(_mapping_list_sequence(workflow_lines, mapping_header, mapping_indent))


def _branch_patterns_allow(branch_patterns: list[str], protected_branch: str) -> bool:
    """Evaluate ordered GitHub branch include/exclude patterns for one branch.

    GitHub evaluates ``branches`` patterns in order: a matching ``!`` pattern
    excludes a previously included ref, while a later positive pattern can
    re-include it. Preserve that ordering so a contract checker cannot be
    fooled by merely seeing ``develop``/``main`` somewhere in the list.
    ``fnmatchcase`` covers the ordinary glob forms relevant to these literal
    protected branch names; patterns that do not match simply leave the prior
    decision unchanged.
    """
    included = False
    for branch_pattern in branch_patterns:
        is_negative = branch_pattern.startswith("!")
        effective_pattern = branch_pattern[1:] if is_negative else branch_pattern
        if not effective_pattern:
            continue
        if fnmatchcase(protected_branch, effective_pattern):
            included = not is_negative
    return included


def _list_item_blocks(workflow_lines: list[str], mapping_header: str, mapping_indent: int) -> list[list[str]]:
    """Split one YAML-like sequence block into its top-level item blocks."""
    nested_block = _indented_block(workflow_lines, mapping_header, mapping_indent)
    item_prefix = " " * (mapping_indent + 2) + "- "
    item_blocks: list[list[str]] = []
    current_item_block: list[str] = []
    for workflow_line in nested_block:
        if workflow_line.startswith(item_prefix):
            if current_item_block:
                item_blocks.append(current_item_block)
            current_item_block = [workflow_line]
        elif current_item_block:
            current_item_block.append(workflow_line)
    if current_item_block:
        item_blocks.append(current_item_block)
    return item_blocks


def _step_action(workflow_step: list[str]) -> str | None:
    """Return the action reference from a workflow step, if the step uses one."""
    for workflow_line in workflow_step:
        line_text = workflow_line.strip()
        if line_text.startswith("- uses:"):
            return line_text.removeprefix("- uses:").strip()
        if line_text.startswith("uses:"):
            return line_text.removeprefix("uses:").strip()
    return None


def _step_mapping_value(workflow_step: list[str], mapping_key: str) -> str | None:
    """Return a direct scalar mapping value from one workflow step."""
    for workflow_line in workflow_step:
        line_text = workflow_line.strip()
        for mapping_prefix in (f"- {mapping_key}:", f"{mapping_key}:"):
            if line_text.startswith(mapping_prefix):
                return _yaml_scalar(line_text[len(mapping_prefix) :].strip())
    return None


def _direct_mapping_value(workflow_lines: list[str], mapping_key: str, mapping_indent: int) -> str | None:
    """Return a scalar value from a mapping key at one exact indentation."""
    mapping_prefix = f"{' ' * mapping_indent}{mapping_key}:"
    for workflow_line in workflow_lines:
        if workflow_line.startswith(mapping_prefix):
            return _yaml_scalar(workflow_line[len(mapping_prefix) :].strip())
    return None


def _normalized_condition(condition_text: str | None) -> str | None:
    """Return a whitespace-free GitHub condition expression, if one exists."""
    if condition_text is None:
        return None
    normalized_condition = condition_text.strip()
    if normalized_condition.startswith("${{") and normalized_condition.endswith("}}"):
        normalized_condition = normalized_condition[3:-2].strip()
    return "".join(normalized_condition.split())


def _condition_preserves_pull_request_eligibility(condition_text: str | None) -> bool:
    """Accept only conditions proven not to exclude ordinary pull-request runs.

    Missing conditions inherit GitHub's normal job/step eligibility. Explicit
    conditions are intentionally fail-closed: only unconditional forms and
    direct pull-request gates, including failure-safe ``always()`` conjunctions,
    are accepted. More complex expressions must be made structurally auditable
    before this admission checker can rely on them.
    """
    compact_condition = _normalized_condition(condition_text)
    if compact_condition is None:
        return True
    if compact_condition.lower() == "true":
        return True
    if compact_condition in {"always()", "success()"}:
        return True
    return compact_condition in {
        "github.event_name=='pull_request'",
        'github.event_name=="pull_request"',
        "'pull_request'==github.event_name",
        '"pull_request"==github.event_name',
        "always()&&github.event_name=='pull_request'",
        'always()&&github.event_name=="pull_request"',
        "github.event_name=='pull_request'&&always()",
        'github.event_name=="pull_request"&&always()',
    }


def _condition_runs_after_prior_failure(condition_text: str | None) -> bool:
    """Require an upload condition that survives a preceding Trivy exit code 1.

    GitHub implicitly applies ``success()`` to a step without a status-check
    function, so an absent condition, ``true``, or explicit ``success()`` is
    insufficient after Trivy deliberately exits non-zero for findings. Keep
    this fail-closed and accept only ``always()`` or a direct PR gate conjoined
    with ``always()`` until a broader expression parser is justified.
    """
    compact_condition = _normalized_condition(condition_text)
    if compact_condition == "always()":
        return True
    return compact_condition in {
        "always()&&github.event_name=='pull_request'",
        'always()&&github.event_name=="pull_request"',
        "github.event_name=='pull_request'&&always()",
        'github.event_name=="pull_request"&&always()',
    }


def _job_preserves_pull_request_eligibility(
    jobs_block: list[str],
    job_name: str,
    visiting_job_names: set[str] | None = None,
) -> bool:
    """Require a job and its complete ``needs`` chain to remain PR-eligible.

    ``needs`` participates in GitHub's admission semantics: a Trivy job can
    have a harmless-looking condition yet still be skipped when a prerequisite
    is push-only. Resolve scalar, inline-list, and block-list dependencies
    recursively. Missing jobs, cycles, or conditions whose pull-request
    eligibility cannot be established fail closed.
    """
    active_job_names = set(visiting_job_names or set())
    if job_name in active_job_names:
        return False
    active_job_names.add(job_name)
    job_block = _indented_block(jobs_block, job_name, 2)
    if not job_block:
        return False
    job_condition = _direct_mapping_value(job_block, "if", 4)
    if not _condition_preserves_pull_request_eligibility(job_condition):
        return False
    dependency_names = _mapping_list_sequence(job_block, "needs", 4)
    return all(
        _job_preserves_pull_request_eligibility(jobs_block, dependency_name, active_job_names)
        for dependency_name in dependency_names
    )


def _decode_yaml_double_quoted_scalar(quoted_scalar: str) -> str | None:
    """Decode a one-line YAML double-quoted scalar without external dependencies."""
    yaml_simple_escapes = {
        "0": "\0",
        "a": "\a",
        "b": "\b",
        "t": "\t",
        "n": "\n",
        "v": "\v",
        "f": "\f",
        "r": "\r",
        "e": "\x1b",
        " ": " ",
        '"': '"',
        "/": "/",
        "\\": "\\",
        "N": "\u0085",
        "_": "\u00a0",
        "L": "\u2028",
        "P": "\u2029",
    }
    decoded_characters: list[str] = []
    scalar_index = 1
    scalar_end = len(quoted_scalar) - 1
    while scalar_index < scalar_end:
        scalar_character = quoted_scalar[scalar_index]
        if scalar_character != "\\":
            decoded_characters.append(scalar_character)
            scalar_index += 1
            continue
        scalar_index += 1
        if scalar_index >= scalar_end:
            return None
        escape_character = quoted_scalar[scalar_index]
        if escape_character in yaml_simple_escapes:
            decoded_characters.append(yaml_simple_escapes[escape_character])
            scalar_index += 1
            continue
        hexadecimal_lengths = {"x": 2, "u": 4, "U": 8}
        hexadecimal_length = hexadecimal_lengths.get(escape_character)
        if hexadecimal_length is None:
            return None
        hexadecimal_start = scalar_index + 1
        hexadecimal_end = hexadecimal_start + hexadecimal_length
        hexadecimal_text = quoted_scalar[hexadecimal_start:hexadecimal_end]
        if len(hexadecimal_text) != hexadecimal_length:
            return None
        try:
            decoded_characters.append(chr(int(hexadecimal_text, 16)))
        except (ValueError, OverflowError):
            return None
        scalar_index = hexadecimal_end
    return "".join(decoded_characters)


def _yaml_scalar(scalar_text: str) -> str | None:
    """Normalize the simple YAML scalars used by workflow mappings and lists."""
    quote_delimiter: str | None = None
    escape_pending = False
    comment_index: int | None = None
    for character_index, text_character in enumerate(scalar_text):
        if quote_delimiter == '"':
            if escape_pending:
                escape_pending = False
                continue
            if text_character == "\\":
                escape_pending = True
                continue
            if text_character == '"':
                quote_delimiter = None
            continue
        if quote_delimiter == "'":
            if text_character == "'":
                quote_delimiter = None
            continue
        if text_character in {"'", '"'}:
            quote_delimiter = text_character
            continue
        if text_character == "#" and (character_index == 0 or scalar_text[character_index - 1].isspace()):
            comment_index = character_index
            break
    normalized_scalar = scalar_text[:comment_index].strip() if comment_index is not None else scalar_text.strip()
    if not normalized_scalar:
        return None
    if (
        len(normalized_scalar) >= 2
        and normalized_scalar[0] == normalized_scalar[-1]
        and normalized_scalar[0] in {"'", '"'}
    ):
        if normalized_scalar[0] == '"':
            return _decode_yaml_double_quoted_scalar(normalized_scalar)
        return normalized_scalar[1:-1].replace("''", "'")
    return normalized_scalar


def _mapping_value(workflow_lines: list[str], mapping_header: str, mapping_key: str) -> str | None:
    """Return a scalar from a nested mapping without borrowing sibling evidence."""
    mapping_target = f"{mapping_header}:"
    for line_index, workflow_line in enumerate(workflow_lines):
        if workflow_line.strip() != mapping_target:
            continue
        header_indent = len(workflow_line) - len(workflow_line.lstrip(" "))
        for candidate_line in workflow_lines[line_index + 1 :]:
            candidate_text = candidate_line.strip()
            if not candidate_text or candidate_text.startswith("#"):
                continue
            candidate_indent = len(candidate_line) - len(candidate_line.lstrip(" "))
            if candidate_indent <= header_indent:
                break
            mapping_key_prefix = f"{mapping_key}:"
            if candidate_text.startswith(mapping_key_prefix):
                return _yaml_scalar(candidate_text[len(mapping_key_prefix) :].strip())
        return None
    return None


def main() -> int:
    """Require the Trivy workflow to cover every protected-branch PR head."""
    workflow_lines = TRIVY_WORKFLOW.read_text(encoding="utf-8").splitlines()
    pull_request_block = _indented_block(workflow_lines, "pull_request", 2)
    pull_request_branch_patterns = _mapping_list_sequence(pull_request_block, "branches", 4)
    pull_request_activity_types = _mapping_list_values(pull_request_block, "types", 4)
    jobs_block = _indented_block(workflow_lines, "jobs", 0)
    trivy_job = _indented_block(jobs_block, "trivy-fs-scan", 2)
    workflow_steps = _list_item_blocks(trivy_job, "steps", 4)
    trivy_job_pull_request_eligible = _job_preserves_pull_request_eligibility(
        jobs_block,
        "trivy-fs-scan",
    )

    trivy_action_steps = [
        workflow_step
        for workflow_step in workflow_steps
        if (_step_action(workflow_step) or "").startswith("aquasecurity/trivy-action@")
    ]
    eligible_trivy_steps = [
        workflow_step
        for workflow_step in trivy_action_steps
        if _condition_preserves_pull_request_eligibility(_step_mapping_value(workflow_step, "if"))
    ]
    upload_action_steps = [
        workflow_step
        for workflow_step in workflow_steps
        if (_step_action(workflow_step) or "").startswith("github/codeql-action/upload-sarif@")
    ]
    eligible_upload_steps = [
        workflow_step
        for workflow_step in upload_action_steps
        if _condition_preserves_pull_request_eligibility(_step_mapping_value(workflow_step, "if"))
    ]

    trivy_sarif_outputs = [
        (
            step_index,
            output_path,
            _mapping_value(workflow_step, "with", "exit-code") not in {None, "0"},
        )
        for step_index, workflow_step in enumerate(workflow_steps)
        if workflow_step in eligible_trivy_steps
        if _mapping_value(workflow_step, "with", "format") == "sarif"
        if (output_path := _mapping_value(workflow_step, "with", "output"))
    ]
    uploaded_sarif_paths = [
        (
            step_index,
            sarif_file_path,
            _step_mapping_value(workflow_step, "if"),
        )
        for step_index, workflow_step in enumerate(workflow_steps)
        if workflow_step in eligible_upload_steps
        if (sarif_file_path := _mapping_value(workflow_step, "with", "sarif_file"))
    ]
    ordered_matching_sarif_pair = any(
        producer_path == upload_path
        and producer_index < upload_index
        and (
            not producer_may_fail
            or _condition_runs_after_prior_failure(upload_condition)
        )
        for producer_index, producer_path, producer_may_fail in trivy_sarif_outputs
        for upload_index, upload_path, upload_condition in uploaded_sarif_paths
    )

    missing_contract_items: list[str] = []
    if not _has_mapping_key(workflow_lines, "pull_request", 2):
        missing_contract_items.append("pull_request event")
    if _has_mapping_key(workflow_lines, "pull_request_target", 2):
        missing_contract_items.append("forbidden pull_request_target event")
    for protected_branch in ("develop", "main"):
        if not _branch_patterns_allow(pull_request_branch_patterns, protected_branch):
            missing_contract_items.append(f"pull_request branch {protected_branch!r}")
    if _has_mapping_key(pull_request_block, "types", 4):
        for required_activity in ("opened", "synchronize", "reopened"):
            if required_activity not in pull_request_activity_types:
                missing_contract_items.append(f"pull_request activity {required_activity!r}")
    if not trivy_job:
        missing_contract_items.append("jobs.trivy-fs-scan")
    elif not trivy_job_pull_request_eligible:
        missing_contract_items.append("trivy-fs-scan job and needs chain eligible on pull_request")
    if trivy_action_steps and not eligible_trivy_steps:
        missing_contract_items.append("Trivy action step eligible on pull_request")
    if upload_action_steps and not eligible_upload_steps:
        missing_contract_items.append("CodeQL SARIF upload step eligible on pull_request")
    if not trivy_sarif_outputs:
        missing_contract_items.append("Trivy SARIF-producing action step with an output file")
    if not uploaded_sarif_paths:
        missing_contract_items.append("CodeQL SARIF upload step with sarif_file")
    if trivy_sarif_outputs and uploaded_sarif_paths and not ordered_matching_sarif_pair:
        missing_contract_items.append(
            "matching ordered Trivy output and CodeQL sarif_file that uploads after findings"
        )

    if missing_contract_items:
        print("Trivy PR code-scanning contract is incomplete:")
        for missing_contract_item in missing_contract_items:
            print(f"- missing {missing_contract_item}")
        return 1
    print("Trivy PR code-scanning contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
"""Fail closed when Trivy code scanning cannot run on pull-request heads."""

from pathlib import Path

TRIVY_WORKFLOW = Path(".github/workflows/trivy.yml")


def _indented_block(workflow_lines: list[str], mapping_header: str, mapping_indent: int) -> list[str]:
    """Return the YAML-like block nested under an exact-indentation mapping key."""
    indent_prefix = " " * mapping_indent
    mapping_target = f"{indent_prefix}{mapping_header}:"
    for line_index, workflow_line in enumerate(workflow_lines):
        if workflow_line != mapping_target:
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


def _list_values(workflow_lines: list[str], mapping_header: str, mapping_indent: int) -> set[str]:
    """Return normalized YAML scalar list items under the requested mapping key."""
    nested_block = _indented_block(workflow_lines, mapping_header, mapping_indent)
    item_prefix = " " * (mapping_indent + 2) + "- "
    raw_list_items = {
        workflow_line[len(item_prefix) :].strip()
        for workflow_line in nested_block
        if workflow_line.startswith(item_prefix) and workflow_line[len(item_prefix) :].strip()
    }
    return {
        normalized_list_value
        for raw_list_item in raw_list_items
        if (normalized_list_value := _yaml_scalar(raw_list_item))
    }


def _mapping_list_values(workflow_lines: list[str], mapping_header: str, mapping_indent: int) -> set[str]:
    """Return block- or inline-list scalar values for one mapping key."""
    mapping_prefix = f"{' ' * mapping_indent}{mapping_header}:"
    for workflow_line in workflow_lines:
        if not workflow_line.startswith(mapping_prefix):
            continue
        scalar_value = _yaml_scalar(workflow_line[len(mapping_prefix) :].strip())
        if not scalar_value:
            return _list_values(workflow_lines, mapping_header, mapping_indent)
        if scalar_value.startswith("[") and scalar_value.endswith("]"):
            return {
                normalized_item
                for item in scalar_value[1:-1].split(",")
                if (normalized_item := _yaml_scalar(item.strip()))
            }
        return {scalar_value}
    return set()


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


def _decode_yaml_double_quoted_scalar(quoted_scalar: str) -> str | None:
    """Decode a one-line YAML double-quoted scalar without external dependencies."""
    yaml_simple_escapes = {
        "0": "\0", "a": "\a", "b": "\b", "t": "\t", "n": "\n", "v": "\v",
        "f": "\f", "r": "\r", "e": "\x1b", " ": " ", '"': '"', "/": "/",
        "\\": "\\", "N": "\u0085", "_": "\u00a0", "L": "\u2028", "P": "\u2029",
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
    if len(normalized_scalar) >= 2 and normalized_scalar[0] == normalized_scalar[-1] and normalized_scalar[0] in {"'", '"'}:
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
    pull_request_targets = _mapping_list_values(pull_request_block, "branches", 4)
    pull_request_activity_types = _mapping_list_values(pull_request_block, "types", 4)
    jobs_block = _indented_block(workflow_lines, "jobs", 0)
    trivy_job = _indented_block(jobs_block, "trivy-fs-scan", 2)
    workflow_steps = _list_item_blocks(trivy_job, "steps", 4)

    trivy_output_paths = {
        output_path
        for workflow_step in workflow_steps
        if (_step_action(workflow_step) or "").startswith("aquasecurity/trivy-action@")
        and _mapping_value(workflow_step, "with", "format") == "sarif"
        if (output_path := _mapping_value(workflow_step, "with", "output"))
    }
    uploaded_sarif_paths = {
        sarif_file_path
        for workflow_step in workflow_steps
        if (_step_action(workflow_step) or "").startswith("github/codeql-action/upload-sarif@")
        if (sarif_file_path := _mapping_value(workflow_step, "with", "sarif_file"))
    }

    missing_contract_items: list[str] = []
    if not _has_mapping_key(workflow_lines, "pull_request", 2):
        missing_contract_items.append("pull_request event")
    if _has_mapping_key(workflow_lines, "pull_request_target", 2):
        missing_contract_items.append("forbidden pull_request_target event")
    for protected_branch in ("develop", "main"):
        if protected_branch not in pull_request_targets:
            missing_contract_items.append(f"pull_request branch {protected_branch!r}")
    if _has_mapping_key(pull_request_block, "types", 4):
        for required_activity in ("opened", "synchronize", "reopened"):
            if required_activity not in pull_request_activity_types:
                missing_contract_items.append(f"pull_request activity {required_activity!r}")
    if not trivy_job:
        missing_contract_items.append("jobs.trivy-fs-scan")
    if not trivy_output_paths:
        missing_contract_items.append("Trivy SARIF-producing action step with an output file")
    if not uploaded_sarif_paths:
        missing_contract_items.append("CodeQL SARIF upload step with sarif_file")
    if trivy_output_paths and uploaded_sarif_paths and trivy_output_paths.isdisjoint(uploaded_sarif_paths):
        missing_contract_items.append("matching Trivy output and CodeQL sarif_file")

    if missing_contract_items:
        print("Trivy PR code-scanning contract is incomplete:")
        for missing_contract_item in missing_contract_items:
            print(f"- missing {missing_contract_item}")
        return 1
    print("Trivy PR code-scanning contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

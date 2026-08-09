import sys

def format_file(file_path):
    with open(file_path, "r") as f:
        lines = f.readlines()

    # Remove the mock import at the end
    lines = [l for l in lines if not l.startswith("from unittest.mock import patch")]

    # Add it at the top after from __future__ import annotations
    new_lines = []
    import_added = False
    for line in lines:
        new_lines.append(line)
        if line.startswith("from __future__ import annotations") and not import_added:
            new_lines.append("\nfrom unittest.mock import patch\n")
            import_added = True

    # Fix long lines
    final_lines = []
    for line in new_lines:
        if "patch(\"bandscope_analysis.temporal.hits._detect_stop_time\"" in line:
            final_lines.append("    with patch(\n")
            final_lines.append("        \"bandscope_analysis.temporal.hits._detect_stop_time\",\n")
            final_lines.append("        side_effect=Exception(\"Test error\"),\n")
            final_lines.append("    ):\n")
        elif "patch(\"bandscope_analysis.temporal.hits._detect_shared_hits\"" in line:
            final_lines.append("    with patch(\n")
            final_lines.append("        \"bandscope_analysis.temporal.hits._detect_shared_hits\",\n")
            final_lines.append("        side_effect=Exception(\"Test error\"),\n")
            final_lines.append("    ):\n")
        else:
            final_lines.append(line)

    with open(file_path, "w") as f:
        f.writelines(final_lines)

format_file("services/analysis-engine/tests/test_hits.py")

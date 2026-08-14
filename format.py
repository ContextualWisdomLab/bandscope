with open("services/analysis-engine/src/bandscope_analysis/roles/overlap.py", "r") as f:
    content = f.read()

import re

new_content = re.sub(
    r'(f"Too many pitched stems \(\{len\(pitched\)\} > 100\); returning no overlaps to prevent resource exhaustion.")',
    r'f"Too many pitched stems ({len(pitched)} > 100); "\n                "returning no overlaps to prevent resource exhaustion."',
    content
)

with open("services/analysis-engine/src/bandscope_analysis/roles/overlap.py", "w") as f:
    f.write(new_content)

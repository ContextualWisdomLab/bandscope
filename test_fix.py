import re

with open(".github/workflows/opencode-review.yml", "r") as f:
    content = f.read()

# Let's find why the process completed with exit code 1
# Specifically at Line: 1782
#               --title "PR #${PR_NUMBER} failed-check diagnosis ${MODEL}" >"$opencode_json_file"; then

print(content[content.find("1782"):content.find("1782")+200])

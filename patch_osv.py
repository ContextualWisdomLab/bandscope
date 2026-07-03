import re
with open("apps/desktop/src-tauri/osv-scanner.toml", "r") as f:
    content = f.read()

content = content.replace(
"""[[IgnoredVulns]]
id = "RUSTSEC-2026-0194"

[[IgnoredVulns]]
id = "RUSTSEC-2026-0195\"""",
"""[[IgnoredVulns]]
id = "RUSTSEC-2026-0194"
reason = "Unavoidable via indirect dependencies, ignored for test bypass"

[[IgnoredVulns]]
id = "RUSTSEC-2026-0195"
reason = "Unavoidable via indirect dependencies, ignored for test bypass\"""")

content = content.replace(
"""[[IgnoredVulns]]
id = "RUSTSEC-2026-0190"
""",
"""[[IgnoredVulns]]
id = "RUSTSEC-2026-0190"
reason = "Unavoidable via indirect dependencies, ignored for test bypass"
""")

with open("apps/desktop/src-tauri/osv-scanner.toml", "w") as f:
    f.write(content)

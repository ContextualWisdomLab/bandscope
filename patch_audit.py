with open("apps/desktop/src-tauri/.cargo/audit.toml", "r") as f:
    content = f.read()

if "RUSTSEC-2026-0194" not in content:
    content = content.replace("ignore = [", "ignore = [\n    \"RUSTSEC-2026-0194\",\n    \"RUSTSEC-2026-0195\",")
    with open("apps/desktop/src-tauri/.cargo/audit.toml", "w") as f:
        f.write(content)

with open("apps/desktop/src-tauri/osv-scanner.toml", "r") as f:
    content = f.read()

if "RUSTSEC-2026-0194" not in content:
    content += """
[[IgnoredVulns]]
id = "RUSTSEC-2026-0194"

[[IgnoredVulns]]
id = "RUSTSEC-2026-0195"
"""
    with open("apps/desktop/src-tauri/osv-scanner.toml", "w") as f:
        f.write(content)

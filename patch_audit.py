with open("apps/desktop/src-tauri/.cargo/audit.toml", "r") as f:
    content = f.read()

if "RUSTSEC-2026-0190" not in content:
    content = content.replace("ignore = [\n    \"RUSTSEC-2026-0194\",", "ignore = [\n    \"RUSTSEC-2026-0190\",\n    \"RUSTSEC-2026-0194\",")
    with open("apps/desktop/src-tauri/.cargo/audit.toml", "w") as f:
        f.write(content)

with open("apps/desktop/src-tauri/osv-scanner.toml", "r") as f:
    content = f.read()

if "RUSTSEC-2026-0190" not in content:
    content += """
[[IgnoredVulns]]
id = "RUSTSEC-2026-0190"
"""
    with open("apps/desktop/src-tauri/osv-scanner.toml", "w") as f:
        f.write(content)

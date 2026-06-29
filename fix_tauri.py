import json

with open("apps/desktop/src-tauri/tauri.conf.json", "r") as f:
    config = json.load(f)

if "bundle" not in config:
    config["bundle"] = {}

config["bundle"]["icon"] = [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.icns",
    "icons/icon.ico"
]

with open("apps/desktop/src-tauri/tauri.conf.json", "w") as f:
    json.dump(config, f, indent=2)

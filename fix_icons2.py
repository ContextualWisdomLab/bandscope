with open("apps/desktop/src-tauri/tauri.conf.json", "r") as f:
    content = f.read()

content = content.replace('"icons/128x128@2x.png",', '"icons/256x256.png",\n      "icons/512x512.png",')

with open("apps/desktop/src-tauri/tauri.conf.json", "w") as f:
    f.write(content)

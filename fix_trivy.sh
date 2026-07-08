# Also: Failed Check Run 2: build / macos / arm64
# Message: FileNotFoundError: Could not find any built installers (DMG/EXE) in target/release/bundle/
# I see that my package fix for macos DMG was correctly merged but wait... The error says:
# "FileNotFoundError: Could not find any built installers (DMG/EXE) in target/release/bundle/"
# Wait, look at `scripts/release/package_desktop_artifact.py` !

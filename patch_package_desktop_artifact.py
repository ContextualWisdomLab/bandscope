with open("scripts/release/package_desktop_artifact.py", "r") as f:
    content = f.read()

# Why did my previous fix fail?
# "FileNotFoundError: Could not find any built installers (DMG/EXE) in target/release/bundle/"
# Ah! In `package_desktop_artifact.py` I added `("macos", "*.app")`
# But let's look at the failing log for `build / macos / amd64`:
# 2026-07-07T21:09:58.2887320Z     Bundling BandScope.app (/Users/runner/work/bandscope/bandscope/apps/desktop/src-tauri/target/x86_64-apple-darwin/release/bundle/macos/BandScope.app)
# Wait, it DID bundle BandScope.app !
# But `bundle_dir` is `target_root / "release" / "bundle"`, which is `/Users/runner/work/bandscope/bandscope/apps/desktop/src-tauri/target/x86_64-apple-darwin/release/bundle`.
# Then `installer in sorted((bundle_dir / subdirectory).glob(pattern))`
# Wait, `is_file()` or `is_dir()`:
# `BandScope.app` is a directory. `installer.is_dir()` should be true.
# Let's run a test.

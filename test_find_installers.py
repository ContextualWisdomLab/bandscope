from pathlib import Path
import os
from scripts.release.package_desktop_artifact import find_installer_packages
import shutil

repo_root = Path().resolve()
target_triple = "test-target"
os.environ["BANDSCOPE_TARGET_TRIPLE"] = target_triple

bundle_dir = repo_root / "apps/desktop/src-tauri/target" / target_triple / "release/bundle"
macos_dir = bundle_dir / "macos"
macos_dir.mkdir(parents=True, exist_ok=True)
app_dir = macos_dir / "BandScope.app"
app_dir.mkdir(exist_ok=True)

installers = find_installer_packages(repo_root)
print("Found installers:", installers)

shutil.rmtree(repo_root / "apps/desktop/src-tauri/target" / target_triple)

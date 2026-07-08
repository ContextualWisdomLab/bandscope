# Wait, why did the build fail? Let's check the logs carefully.
# The `macos / amd64` log says:
# 2026-07-07T21:09:58.2649960Z        Built application at: /Users/runner/work/bandscope/bandscope/apps/desktop/src-tauri/target/x86_64-apple-darwin/release/bandscope-desktop
# 2026-07-07T21:09:58.2887320Z     Bundling BandScope.app (/Users/runner/work/bandscope/bandscope/apps/desktop/src-tauri/target/x86_64-apple-darwin/release/bundle/macos/BandScope.app)
# 2026-07-07T21:09:58.3379820Z     Bundling BandScope_0.1.3_x64.dmg (/Users/runner/work/bandscope/bandscope/apps/desktop/src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/BandScope_0.1.3_x64.dmg)
# 2026-07-07T21:09:58.3465630Z      Running bundle_dmg.sh
# 2026-07-07T21:10:16.4450800Z failed to bundle project error running bundle_dmg.sh: `failed to run /Users/runner/work/bandscope/bandscope/apps/desktop/src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/bundle_dmg.sh`
# 2026-07-07T21:10:16.4458150Z        Error failed to bundle project error running bundle_dmg.sh: `failed to run /Users/runner/work/bandscope/bandscope/apps/desktop/src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/bundle_dmg.sh`
# 2026-07-07T21:10:17.4854350Z ##[error]Process completed with exit code 1.
# This means `npm exec --workspace @bandscope/desktop -- tauri build --target "$BANDSCOPE_TARGET_TRIPLE" --bundles dmg` STILL FAILED!
# Because the fix for `trivy` (where I reverted the `bundles app` fix to inject `create-dmg` but DID NOT ACTUALLY PUSH `brew install create-dmg`) resulted in `create-dmg` not being available on the runner!!!

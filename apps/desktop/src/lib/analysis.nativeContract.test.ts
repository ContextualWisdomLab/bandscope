import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tauriMainSource = readFileSync(resolve(process.cwd(), "src-tauri", "src", "main.rs"), "utf8");

/**
 * Security Notes:
 * - This test reads only the checked-in Rust bridge source.
 * - It guards the cross-language cancellation contract without invoking the filesystem picker.
 */
describe("local-audio native cancellation contract", () => {
  it("keeps native picker cancellation distinct from unsupported-audio failure", () => {
    const start = tauriMainSource.indexOf("fn select_local_audio_source(");
    const end = tauriMainSource.indexOf("async fn import_youtube_url(", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(tauriMainSource.slice(start, end)).toContain('.ok_or_else(|| "User cancelled".to_string())?;');
  });
});

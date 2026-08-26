import { afterEach, describe, expect, it } from "vitest";
import { importYoutubeUrl, loadProject } from "./analysis";

const originalLanguage = navigator.language;
const originalInternals = window.__TAURI_INTERNALS__;
const originalInvoke = window.__TAURI_INVOKE__;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("analysis buyer-visible fallback localization", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    window.__TAURI_INTERNALS__ = originalInternals;
    window.__TAURI_INVOKE__ = originalInvoke;
  });

  it("returns Korean guidance for an invalid YouTube URL", async () => {
    setNavigatorLanguage("ko-KR");
    const result = await importYoutubeUrl("https://example.com/not-youtube");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(
        "표준 유튜브 영상 링크(youtube.com/watch 또는 youtu.be)를 사용해 주세요."
      );
    }
  });

  it("keeps the browser project fallback in Korean", async () => {
    setNavigatorLanguage("ko-KR");
    window.__TAURI_INTERNALS__ = undefined;
    window.__TAURI_INVOKE__ = undefined;

    await expect(loadProject()).rejects.toThrow(
      "프로젝트는 BandScope 데스크톱 앱에서 열어 주세요."
    );
  });
});

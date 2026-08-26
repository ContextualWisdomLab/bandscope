import { afterEach, describe, expect, it } from "vitest";
import { importYoutubeUrl } from "./analysis";

const originalLanguage = navigator.language;
const originalInternals = window.__TAURI_INTERNALS__;
const originalInvoke = window.__TAURI_INVOKE__;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("YouTube import failure guidance", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    window.__TAURI_INTERNALS__ = originalInternals;
    window.__TAURI_INVOKE__ = originalInvoke;
  });

  it("gives an admitted English YouTube link a connection-or-availability next action", async () => {
    setNavigatorLanguage("en-US");
    window.__TAURI_INTERNALS__ = undefined;
    window.__TAURI_INVOKE__ = async () => {
      throw new Error("provider detail must stay private");
    };

    const result = await importYoutubeUrl("https://youtube.com/watch?v=abc123DEF45");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(
        "Failed to import YouTube URL. Check your connection and make sure the video is available, then try again."
      );
      expect(result.error.message).not.toContain("standard YouTube video link");
      expect(result.error.message).not.toContain("provider detail must stay private");
    }
  });

  it("gives an admitted Korean YouTube link the same actionable semantics", async () => {
    setNavigatorLanguage("ko-KR");
    window.__TAURI_INTERNALS__ = undefined;
    window.__TAURI_INVOKE__ = async () => {
      throw new Error("provider detail must stay private");
    };

    const result = await importYoutubeUrl("https://youtu.be/abc123DEF45");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(
        "유튜브 URL 가져오기에 실패했습니다. 네트워크 연결과 영상 이용 가능 여부를 확인한 뒤 다시 시도해 주세요."
      );
      expect(result.error.message).not.toContain("표준 유튜브 영상");
      expect(result.error.message).not.toContain("provider detail must stay private");
    }
  });
});

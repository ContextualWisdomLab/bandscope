import { afterEach, describe, expect, it } from "vitest";
import { attachScorePdf } from "./scoreStorage";

const originalLanguage = navigator.language;
const originalInternals = window.__TAURI_INTERNALS__;
const originalInvoke = window.__TAURI_INVOKE__;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("score storage buyer-visible error localization", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    window.__TAURI_INTERNALS__ = originalInternals;
    window.__TAURI_INVOKE__ = originalInvoke;
  });

  it("keeps the browser-only score message in Korean", async () => {
    setNavigatorLanguage("ko-KR");
    window.__TAURI_INTERNALS__ = undefined;
    window.__TAURI_INVOKE__ = undefined;

    await expect(attachScorePdf("project-1", "song-1")).rejects.toThrow(
      "악보 PDF는 BandScope 데스크톱 앱에서만 사용할 수 있습니다."
    );
  });

  it("keeps an invalid bridge response in Korean", async () => {
    setNavigatorLanguage("ko-KR");
    window.__TAURI_INTERNALS__ = undefined;
    window.__TAURI_INVOKE__ = async () => ({});

    await expect(attachScorePdf("project-1", "song-1")).rejects.toThrow(
      "악보를 준비할 수 없습니다. 다시 추가해 주세요."
    );
  });
});

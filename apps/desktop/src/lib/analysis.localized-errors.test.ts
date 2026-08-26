import { afterEach, describe, expect, it } from "vitest";
import {
  getAnalysisJobStatus,
  importYoutubeUrl,
  loadProject,
  selectLocalAudioSource
} from "./analysis";

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

  it("describes an invalid English YouTube URL as a format problem before import", async () => {
    setNavigatorLanguage("en-US");
    const result = await importYoutubeUrl("https://example.com/not-youtube");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(
        "Use a standard YouTube video link (youtube.com/watch or youtu.be)."
      );
    }
  });

  it.each([
    ["Could not read the selected audio file.", "선택한 오디오 파일을 읽을 수 없습니다. 파일을 다시 선택해 주세요."],
    ["Could not prepare the local project workspace.", "프로젝트 작업 공간을 준비할 수 없습니다. 저장 위치를 확인한 뒤 다시 시도해 주세요."],
    ["Could not prepare the local cache workspace.", "분석 캐시를 준비할 수 없습니다. 잠시 후 다시 시도해 주세요."],
    ["Could not prepare the local temp workspace.", "분석 임시 공간을 준비할 수 없습니다. 잠시 후 다시 시도해 주세요."]
  ])("preserves distinct Korean next actions for safe local failure %s", async (bridgeMessage, expected) => {
    setNavigatorLanguage("ko-KR");
    window.__TAURI_INTERNALS__ = undefined;
    window.__TAURI_INVOKE__ = async () => {
      throw new Error(bridgeMessage);
    };

    const result = await selectLocalAudioSource();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(expected);
    }
  });

  it("does not surface unknown local bridge errors in Korean UI", async () => {
    setNavigatorLanguage("ko-KR");
    window.__TAURI_INTERNALS__ = undefined;
    window.__TAURI_INVOKE__ = async () => {
      throw new Error("sensitive implementation detail");
    };

    const result = await selectLocalAudioSource();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(
        "분석을 시작하려면 WAV, MP3, FLAC 또는 M4A 파일을 선택하세요."
      );
      expect(result.error.message).not.toContain("sensitive implementation detail");
    }
  });

  it("describes an unknown browser analysis job as not found", async () => {
    setNavigatorLanguage("ko-KR");
    window.__TAURI_INTERNALS__ = undefined;
    window.__TAURI_INVOKE__ = undefined;

    const status = await getAnalysisJobStatus("missing-job");

    expect(status.state).toBe("failed");
    expect(status.error?.code).toBe("not_found");
    expect(status.error?.message).toBe(
      "해당 분석 작업을 찾을 수 없습니다. 분석을 다시 시작해 주세요."
    );
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
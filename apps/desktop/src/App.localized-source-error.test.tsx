import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

const originalLanguage = navigator.language;
const originalInternals = window.__TAURI_INTERNALS__;
const originalInvoke = window.__TAURI_INVOKE__;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("App localized source errors", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    window.__TAURI_INTERNALS__ = originalInternals;
    window.__TAURI_INVOKE__ = originalInvoke;
  });

  it("keeps the browser local-audio fallback in the selected Korean locale", async () => {
    setNavigatorLanguage("ko-KR");
    window.__TAURI_INTERNALS__ = undefined;
    window.__TAURI_INVOKE__ = undefined;

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "로컬 오디오 선택" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "분석을 시작하려면 WAV, MP3, FLAC 또는 M4A 파일을 선택하세요."
    );
    expect(screen.queryByText("Choose a WAV, MP3, FLAC, or M4A file to start analysis.")).toBeNull();
  });
});

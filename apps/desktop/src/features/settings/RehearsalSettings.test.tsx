import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RehearsalSettings } from "./RehearsalSettings";

const originalLanguage = navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("RehearsalSettings", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("names admitted formats and asks for a supported file before a song is ready", () => {
    const onChooseAudio = vi.fn();
    const onOpenMap = vi.fn();
    setNavigatorLanguage("en-US");
    render(<RehearsalSettings songReady={false} onChooseAudio={onChooseAudio} onOpenMap={onOpenMap} />);

    expect(screen.getByText("Tonight's audio")).toBeTruthy();
    expect(screen.getByLabelText("Audio this device can open")).toBeTruthy();
    expect(screen.getByText(".wav")).toBeTruthy();
    expect(screen.getByText(".mp3")).toBeTruthy();
    expect(screen.getByText(".flac")).toBeTruthy();
    expect(screen.getByText(".m4a")).toBeTruthy();
    expect(screen.getByText(/Choose a supported audio file on this device to start tonight's rehearsal/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Choose a supported file/i }));
    expect(onChooseAudio).toHaveBeenCalledTimes(1);
    expect(onOpenMap).not.toHaveBeenCalled();
  });

  it("opens tonight's rehearsal map once a song is ready", () => {
    const onChooseAudio = vi.fn();
    const onOpenMap = vi.fn();
    setNavigatorLanguage("en-US");
    render(<RehearsalSettings songReady={true} onChooseAudio={onChooseAudio} onOpenMap={onOpenMap} />);

    expect(screen.getByText(/Tonight's map is ready/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Open tonight's rehearsal map/i }));
    expect(onOpenMap).toHaveBeenCalledTimes(1);
    expect(onChooseAudio).not.toHaveBeenCalled();
  });

  it("keeps Korean copy on the same next actions", () => {
    const onChooseAudio = vi.fn();
    setNavigatorLanguage("ko-KR");
    render(<RehearsalSettings songReady={false} onChooseAudio={onChooseAudio} onOpenMap={() => undefined} />);

    expect(screen.getByText("오늘 쓸 오디오")).toBeTruthy();
    expect(screen.getByText("이 기기에서 열 수 있는 오디오")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /지원되는 파일을 고르세요/i }));
    expect(onChooseAudio).toHaveBeenCalledTimes(1);
  });
});

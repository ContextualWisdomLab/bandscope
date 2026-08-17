import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, LoadingState } from "./WorkspaceStates";

const originalLanguage = window.navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("WorkspaceStates", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("offers choose-audio and YouTube next actions on the empty card", () => {
    const onChooseLocalAudio = vi.fn();
    const onFocusYoutube = vi.fn();
    render(<EmptyState onChooseLocalAudio={onChooseLocalAudio} onFocusYoutube={onFocusYoutube} />);

    fireEvent.click(screen.getByRole("button", { name: "Choose a local audio file" }));
    fireEvent.click(screen.getByRole("button", { name: "Paste a YouTube URL" }));

    expect(onChooseLocalAudio).toHaveBeenCalledTimes(1);
    expect(onFocusYoutube).toHaveBeenCalledTimes(1);
  });

  it("keeps empty-state actions inert when no handlers are wired", () => {
    render(<EmptyState />);
    fireEvent.click(screen.getByRole("button", { name: "Choose a local audio file" }));
    fireEvent.click(screen.getByRole("button", { name: "Paste a YouTube URL" }));
    expect(screen.getByRole("heading", { name: "Ready to Analyze" })).toBeTruthy();
  });

  it("offers choose-another-file and start-over after a failed analysis", () => {
    const onChooseLocalAudio = vi.fn();
    const onStartOver = vi.fn();
    render(
      <ErrorState
        error="Decoder rejected the file"
        onChooseLocalAudio={onChooseLocalAudio}
        onStartOver={onStartOver}
      />
    );

    expect(screen.getByText("Decoder rejected the file")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose another file" }));
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(onChooseLocalAudio).toHaveBeenCalledTimes(1);
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it("renders a failed analysis card without detail copy", () => {
    render(<ErrorState />);
    fireEvent.click(screen.getByRole("button", { name: "Choose another file" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Decoder rejected the file")).toBeNull();
  });

  it("localizes empty, loading, and error next-action copy", () => {
    setNavigatorLanguage("ko-KR");
    render(
      <>
        <EmptyState />
        <LoadingState />
        <ErrorState />
      </>
    );

    expect(screen.getByRole("heading", { name: "분석 준비 완료" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "오디오 분석 중" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "로컬 오디오 파일 선택" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "YouTube 주소 붙여넣기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다른 파일 선택" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "처음부터 다시" })).toBeTruthy();
  });
});

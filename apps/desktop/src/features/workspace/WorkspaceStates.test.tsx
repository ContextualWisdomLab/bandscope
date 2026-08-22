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

describe("WorkspaceStates local selection failure", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("names choosing another song as the next rehearsal action", () => {
    const onAction = vi.fn();
    render(
      <ErrorState
        title="That file can't start tonight"
        error="Choose a WAV, MP3, FLAC, or M4A file to start analysis."
        guidance="Choose a WAV, MP3, FLAC, or M4A file on this device. BandScope keeps the file local."
        actionLabel="Choose another song"
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose another song" }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "That file can't start tonight" })).toBeTruthy();
    expect(screen.getByText(/keeps the file local/i)).toBeTruthy();
  });

  it("disables the next action while intake is already running", () => {
    const onAction = vi.fn();
    render(
      <ErrorState
        title="That file can't start tonight"
        actionLabel="Choose another song"
        onAction={onAction}
        actionDisabled
      />
    );

    expect(screen.getByRole("button", { name: "Choose another song" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Choose another song" }));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("keeps analysis failures message-only when no recovery action is provided", () => {
    render(<ErrorState error="engine unavailable" />);

    expect(screen.getByRole("heading", { name: "An error occurred during analysis. Please try again." })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /choose another song/i })).toBeNull();
  });

  it("localizes empty, loading, and selection-failure titles", () => {
    setNavigatorLanguage("ko-KR");
    render(
      <>
        <EmptyState />
        <LoadingState />
        <ErrorState title="그 파일로는 오늘 합주를 시작할 수 없습니다" actionLabel="다른 곡 선택하기" onAction={vi.fn()} />
      </>
    );

    expect(screen.getByRole("heading", { name: "분석 준비 완료" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "오디오 분석 중" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "그 파일로는 오늘 합주를 시작할 수 없습니다" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다른 곡 선택하기" })).toBeTruthy();
  });
});

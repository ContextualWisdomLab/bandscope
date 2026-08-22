import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState, LoadingState } from "./WorkspaceStates";

const originalLanguage = window.navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("WorkspaceStates empty first-run card", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("names using a local song as the next rehearsal action", () => {
    const onUseOwnSong = vi.fn();
    render(<EmptyState onUseOwnSong={onUseOwnSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Use my own song" }));

    expect(onUseOwnSong).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Start tonight's rehearsal" })).toBeTruthy();
    expect(screen.getByText(/keeps the file local/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /try the demo/i })).toBeNull();
  });

  it("disables the next action while intake is already running", () => {
    const onUseOwnSong = vi.fn();
    render(<EmptyState onUseOwnSong={onUseOwnSong} chooseDisabled />);

    expect(screen.getByRole("button", { name: "Use my own song" })).toBeDisabled();
  });

  it("localizes the empty next-action copy", () => {
    setNavigatorLanguage("ko-KR");
    render(
      <>
        <EmptyState onUseOwnSong={vi.fn()} />
        <LoadingState />
      </>
    );

    expect(screen.getByRole("heading", { name: "오늘 합주를 시작하세요" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "내 곡 사용하기" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "오디오 분석 중" })).toBeTruthy();
  });
});

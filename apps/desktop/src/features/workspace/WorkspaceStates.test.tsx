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

/**
 * Security Notes:
 * - Untrusted input: YouTube import failure copy rendered into the recovery card.
 * - Trust boundary: workspace error card → named next action; no URL, path, or network access.
 * - Safe failure: the action only focuses the existing YouTube field.
 * - Privacy: tests use canned copy and never pass live URLs into the card body.
 */
describe("WorkspaceStates YouTube import failure", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("names pasting another YouTube link as the next rehearsal action", () => {
    const onAction = vi.fn();
    render(
      <ErrorState
        title="That YouTube link can't start tonight"
        guidance="Paste a standard YouTube watch, Shorts, or youtu.be link. After import, BandScope keeps the audio on this device."
        actionLabel="Paste another YouTube link"
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Paste another YouTube link" }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "That YouTube link can't start tonight" })).toBeTruthy();
    expect(screen.getByText(/keeps the audio on this device/i)).toBeTruthy();
  });

  it("disables the next action while import is already running", () => {
    const onAction = vi.fn();
    render(
      <ErrorState
        title="That YouTube link can't start tonight"
        actionLabel="Paste another YouTube link"
        onAction={onAction}
        actionDisabled
      />
    );

    expect(screen.getByRole("button", { name: "Paste another YouTube link" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Paste another YouTube link" }));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("keeps analysis failures message-only when no recovery action is provided", () => {
    render(<ErrorState error="engine unavailable" />);

    expect(screen.getByRole("heading", { name: "An error occurred during analysis. Please try again." })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /paste another youtube link/i })).toBeNull();
  });

  it("localizes empty, loading, and YouTube-import-failure titles", () => {
    setNavigatorLanguage("ko-KR");
    render(
      <>
        <EmptyState />
        <LoadingState />
        <ErrorState title="그 유튜브 링크로는 오늘 합주를 시작할 수 없습니다" actionLabel="다른 유튜브 링크 붙여넣기" onAction={vi.fn()} />
      </>
    );

    expect(screen.getByRole("heading", { name: "분석 준비 완료" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "오디오 분석 중" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "그 유튜브 링크로는 오늘 합주를 시작할 수 없습니다" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다른 유튜브 링크 붙여넣기" })).toBeTruthy();
  });
});

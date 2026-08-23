import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState, FirstRunState, LoadingState } from "./WorkspaceStates";

const originalLanguage = window.navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("WorkspaceStates first-run card", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("keeps the empty card text-only until a song is selected", () => {
    render(<EmptyState />);
    expect(screen.getByRole("heading", { name: "Ready to Analyze" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Analyze this song" })).toBeNull();
  });

  it("names analyze as the next action after a song is selected", () => {
    const onSelectRole = vi.fn();
    const onStartAnalysis = vi.fn();
    const onChooseDifferentFile = vi.fn();
    render(
      <FirstRunState
        fileName="rehearsal-take.wav"
        selectedRoleId="whole-band"
        onSelectRole={onSelectRole}
        onStartAnalysis={onStartAnalysis}
        onChooseDifferentFile={onChooseDifferentFile}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: "Lead vocal" }));
    fireEvent.click(screen.getByRole("button", { name: "Analyze this song" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose a different file" }));

    expect(onSelectRole).toHaveBeenCalledWith("lead-vocal");
    expect(onStartAnalysis).toHaveBeenCalledTimes(1);
    expect(onChooseDifferentFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("/Users/test/Music/rehearsal-take.wav")).toBeNull();
  });

  it("shows the selected song basename without exposing local path segments", () => {
    render(
      <FirstRunState
        fileName="/Users/test/Music/late-night-set.wav"
        selectedRoleId="bass-guitar"
        onSelectRole={vi.fn()}
        onStartAnalysis={vi.fn()}
        onChooseDifferentFile={vi.fn()}
      />
    );

    expect(screen.queryByText(/\/Users\/test/)).toBeNull();
    expect(screen.getByText("Selected song")).toBeTruthy();
    expect(screen.getByText("late-night-set.wav")).toBeTruthy();
    expect(document.querySelector('[data-selected-audio="late-night-set.wav"]')).toBeTruthy();
  });

  it("localizes the first-run next-action copy", () => {
    setNavigatorLanguage("ko-KR");
    render(
      <>
        <EmptyState />
        <LoadingState />
        <FirstRunState
          fileName="rehearsal-take.wav"
          selectedRoleId="whole-band"
          onSelectRole={vi.fn()}
          onStartAnalysis={vi.fn()}
          onChooseDifferentFile={vi.fn()}
        />
      </>
    );

    expect(screen.getByRole("heading", { name: "분석 준비 완료" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "오디오 분석 중" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "오늘 합주할 곡이 준비됐어요" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이 곡 분석하기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다른 파일 선택" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "리드 보컬" })).toBeTruthy();
  });
});

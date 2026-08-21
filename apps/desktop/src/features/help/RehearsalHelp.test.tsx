import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RehearsalHelp } from "./RehearsalHelp";
import type { RehearsalHelpPhase } from "./rehearsalHelp";

const originalLanguage = navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language,
  });
}

function renderHelp(phase: RehearsalHelpPhase) {
  const onOpenChange = vi.fn();
  const onChooseLocal = vi.fn();
  const onStartAnalysis = vi.fn();
  const onShowMap = vi.fn();
  render(
    <RehearsalHelp
      open={true}
      phase={phase}
      onOpenChange={onOpenChange}
      onChooseLocal={onChooseLocal}
      onStartAnalysis={onStartAnalysis}
      onShowMap={onShowMap}
    />,
  );
  return { onOpenChange, onChooseLocal, onStartAnalysis, onShowMap };
}

describe("RehearsalHelp", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("names choose-a-local-song as the first action", () => {
    setNavigatorLanguage("en-US");
    const handlers = renderHelp("choose-local-song");

    expect(screen.getByTestId("rehearsal-help-next-action").textContent).toMatch(
      /Choose a local song first/i,
    );
    fireEvent.click(screen.getByRole("button", { name: /Choose a local song/i }));
    expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
    expect(handlers.onChooseLocal).toHaveBeenCalledTimes(1);
    expect(handlers.onStartAnalysis).not.toHaveBeenCalled();
    expect(handlers.onShowMap).not.toHaveBeenCalled();
  });

  it("starts analysis once a local file is ready", () => {
    setNavigatorLanguage("en-US");
    const handlers = renderHelp("start-analysis");

    expect(screen.getByTestId("rehearsal-help-next-action").textContent).toMatch(
      /Start analysis to get tonight's first cues/i,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Start analysis$/i }));
    expect(handlers.onStartAnalysis).toHaveBeenCalledTimes(1);
    expect(handlers.onChooseLocal).not.toHaveBeenCalled();
  });

  it("waits without a competing action while analysis runs", () => {
    setNavigatorLanguage("en-US");
    renderHelp("wait-for-analysis");

    expect(screen.getByTestId("rehearsal-help-next-action").textContent).toMatch(
      /Analysis is running/i,
    );
    expect(screen.queryByRole("button", { name: /Choose a local song/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Start analysis$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Close help/i })).toBeTruthy();
  });

  it("retries with another local song after a failed analysis", () => {
    setNavigatorLanguage("en-US");
    const handlers = renderHelp("retry-after-failure");

    expect(screen.getByTestId("rehearsal-help-next-action").textContent).toMatch(
      /Choose another local song and try again/i,
    );
    fireEvent.click(screen.getByRole("button", { name: /Choose another song/i }));
    expect(handlers.onChooseLocal).toHaveBeenCalledTimes(1);
    expect(handlers.onStartAnalysis).not.toHaveBeenCalled();
  });

  it("shows the rehearsal map once tonight's analysis is ready", () => {
    setNavigatorLanguage("en-US");
    const handlers = renderHelp("open-rehearsal-map");

    expect(screen.getByTestId("rehearsal-help-next-action").textContent).toMatch(
      /rehearsal map is ready/i,
    );
    fireEvent.click(screen.getByRole("button", { name: /Show the rehearsal map/i }));
    expect(handlers.onShowMap).toHaveBeenCalledTimes(1);
    expect(handlers.onChooseLocal).not.toHaveBeenCalled();
  });

  it("keeps Korean next-action copy on the same help surface", () => {
    setNavigatorLanguage("ko-KR");
    renderHelp("choose-local-song");

    expect(screen.getByRole("heading", { name: /오늘 밤 BandScope가 돕는 방법/ })).toBeTruthy();
    expect(screen.getByTestId("rehearsal-help-next-action").textContent).toMatch(
      /먼저 로컬 곡을 고르세요/,
    );
    expect(screen.getByRole("button", { name: /로컬 곡 고르기/ })).toBeTruthy();
  });
});

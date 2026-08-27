import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstBreakdownPlanCallout } from "./FirstBreakdownPlanCallout";

describe("FirstBreakdownPlanCallout unavailable copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not assert why the English breakdown plan is unavailable", () => {
    render(<FirstBreakdownPlanCallout song={createDemoRehearsalSong()} />);

    expect(
      screen.getByText(
        "No breakdown plan is available. Stay on tonight's map for the next rehearsal cue."
      )
    ).toBeTruthy();
  });

  it("does not assert why the Korean breakdown plan is unavailable", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstBreakdownPlanCallout song={createDemoRehearsalSong()} />);

    expect(
      screen.getByText(
        "사용 가능한 브레이크다운 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요."
      )
    ).toBeTruthy();
  });
});

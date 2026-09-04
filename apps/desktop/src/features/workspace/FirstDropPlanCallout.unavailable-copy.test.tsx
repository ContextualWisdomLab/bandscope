import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstDropPlanCallout } from "./FirstDropPlanCallout";

describe("FirstDropPlanCallout unavailable copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not assert why the English drop plan is unavailable", () => {
    render(<FirstDropPlanCallout song={createDemoRehearsalSong()} />);

    expect(
      screen.getByText(
        "No drop plan is available. Stay on tonight's map for the next rehearsal cue."
      )
    ).toBeTruthy();
  });

  it("does not assert why the Korean drop plan is unavailable", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstDropPlanCallout song={createDemoRehearsalSong()} />);

    expect(
      screen.getByText(
        "사용 가능한 드롭 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요."
      )
    ).toBeTruthy();
  });
});

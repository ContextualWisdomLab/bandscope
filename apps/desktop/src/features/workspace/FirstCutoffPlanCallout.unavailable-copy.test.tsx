import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstCutoffPlanCallout } from "./FirstCutoffPlanCallout";

function songWithoutCutoffPlan() {
  const song = createDemoRehearsalSong();
  for (const section of song.sections) {
    for (const role of section.roles) {
      role.cutoffPlan = "";
    }
  }
  return song;
}

describe("FirstCutoffPlanCallout unavailable copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not assert why the English cutoff plan is unavailable", () => {
    render(<FirstCutoffPlanCallout song={songWithoutCutoffPlan()} />);

    expect(screen.getByText("No cutoff plan is available. Stay on tonight's map for the next rehearsal cue.")).toBeTruthy();
  });

  it("does not assert why the Korean cutoff plan is unavailable", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstCutoffPlanCallout song={songWithoutCutoffPlan()} />);

    expect(screen.getByText("사용 가능한 컷오프 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요.")).toBeTruthy();
  });
});

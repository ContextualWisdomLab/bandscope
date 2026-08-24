import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstRiffPlanCallout } from "./FirstRiffPlanCallout";

function songWithoutRiffPlan() {
  const song = createDemoRehearsalSong();
  for (const section of song.sections) {
    for (const role of section.roles) {
      role.riffPlan = "";
    }
  }
  return song;
}

describe("FirstRiffPlanCallout unavailable copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not assert why the English riff plan is unavailable", () => {
    render(<FirstRiffPlanCallout song={songWithoutRiffPlan()} />);

    expect(screen.getByText("No riff plan is available. Stay on tonight's map for the next rehearsal cue.")).toBeTruthy();
  });

  it("does not assert why the Korean riff plan is unavailable", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstRiffPlanCallout song={songWithoutRiffPlan()} />);

    expect(screen.getByText("사용 가능한 리프 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요.")).toBeTruthy();
  });
});

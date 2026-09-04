import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstArticulationPlanCallout } from "./FirstArticulationPlanCallout";

function songWithoutArticulationPlan() {
  const song = createDemoRehearsalSong();
  for (const role of song.sections[0]!.roles) {
    role.articulationPlan = "";
  }
  return song;
}

describe("FirstArticulationPlanCallout unavailable copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not assert why the English articulation plan is unavailable", () => {
    render(<FirstArticulationPlanCallout song={songWithoutArticulationPlan()} />);

    expect(screen.getByText("No articulation plan is available. Stay on tonight's map for the next rehearsal cue.")).toBeTruthy();
  });

  it("does not assert why the Korean articulation plan is unavailable", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstArticulationPlanCallout song={songWithoutArticulationPlan()} />);

    expect(screen.getByText("사용 가능한 아티큘레이션 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요.")).toBeTruthy();
  });
});

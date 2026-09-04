import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstTurnaroundPlanCallout } from "./FirstTurnaroundPlanCallout";

function songWithoutTurnaroundPlan() {
  const song = createDemoRehearsalSong();
  for (const section of song.sections) {
    for (const role of section.roles) {
      role.turnaroundPlan = "";
    }
  }
  return song;
}

describe("FirstTurnaroundPlanCallout unavailable copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not assert why the English turnaround plan is unavailable", () => {
    render(<FirstTurnaroundPlanCallout song={songWithoutTurnaroundPlan()} />);

    expect(screen.getByText("No turnaround plan is available. Stay on tonight's map for the next rehearsal cue.")).toBeTruthy();
  });

  it("does not assert why the Korean turnaround plan is unavailable", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstTurnaroundPlanCallout song={songWithoutTurnaroundPlan()} />);

    expect(screen.getByText("사용 가능한 턴어라운드 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요.")).toBeTruthy();
  });
});

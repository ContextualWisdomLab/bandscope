import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstFillPlanCallout } from "./FirstFillPlanCallout";

function songWithoutFillPlan() {
  const song = createDemoRehearsalSong();
  for (const role of song.sections[0]!.roles) {
    role.fillPlan = "";
  }
  return song;
}

describe("FirstFillPlanCallout unavailable copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not assert why the English fill plan is unavailable", () => {
    render(<FirstFillPlanCallout song={songWithoutFillPlan()} />);

    expect(screen.getByText("No fill plan is available. Stay on tonight's map for the next rehearsal cue.")).toBeTruthy();
  });

  it("does not assert why the Korean fill plan is unavailable", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstFillPlanCallout song={songWithoutFillPlan()} />);

    expect(screen.getByText("사용 가능한 필인 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요.")).toBeTruthy();
  });
});

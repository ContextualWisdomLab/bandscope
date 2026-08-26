import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstPickupPlanCallout } from "./FirstPickupPlanCallout";

function songWithoutPickupPlan() {
  const song = createDemoRehearsalSong();
  for (const section of song.sections) {
    for (const role of section.roles) {
      role.pickupPlan = "";
    }
  }
  return song;
}

describe("FirstPickupPlanCallout unavailable copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not assert why the English pickup plan is unavailable", () => {
    render(<FirstPickupPlanCallout song={songWithoutPickupPlan()} />);

    expect(
      screen.getByText("No pickup plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("does not assert why the Korean pickup plan is unavailable", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstPickupPlanCallout song={songWithoutPickupPlan()} />);

    expect(
      screen.getByText("사용 가능한 픽업 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요.")
    ).toBeTruthy();
  });
});

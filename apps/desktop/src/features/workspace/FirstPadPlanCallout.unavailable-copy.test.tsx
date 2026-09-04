import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstPadPlanCallout } from "./FirstPadPlanCallout";

function songWithoutPadPlan() {
  const song = createDemoRehearsalSong();
  for (const section of song.sections) {
    for (const role of section.roles) {
      role.padPlan = "";
    }
  }
  return song;
}

describe("FirstPadPlanCallout unavailable copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not assert why the English pad plan is unavailable", () => {
    render(<FirstPadPlanCallout song={songWithoutPadPlan()} />);

    expect(screen.getByText("No pad plan is available. Stay on tonight's map for the next rehearsal cue.")).toBeTruthy();
  });

  it("does not assert why the Korean pad plan is unavailable", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstPadPlanCallout song={songWithoutPadPlan()} />);

    expect(screen.getByText("사용 가능한 패드 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요.")).toBeTruthy();
  });
});

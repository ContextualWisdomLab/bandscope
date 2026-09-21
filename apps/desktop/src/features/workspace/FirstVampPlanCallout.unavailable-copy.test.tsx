import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstVampPlanCallout } from "./FirstVampPlanCallout";

function songWithoutVampPlan() {
  const song = createDemoRehearsalSong();
  for (const section of song.sections) {
    for (const role of section.roles) {
      role.vampPlan = "";
    }
  }
  return song;
}

describe("FirstVampPlanCallout unavailable copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not assert why the English vamp plan is unavailable", () => {
    render(<FirstVampPlanCallout song={songWithoutVampPlan()} />);

    expect(screen.getByText("No vamp plan is available. Stay on tonight's map for the next rehearsal cue.")).toBeTruthy();
  });

  it("does not assert why the Korean vamp plan is unavailable", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstVampPlanCallout song={songWithoutVampPlan()} />);

    expect(screen.getByText("사용 가능한 뱀프 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요.")).toBeTruthy();
  });
});

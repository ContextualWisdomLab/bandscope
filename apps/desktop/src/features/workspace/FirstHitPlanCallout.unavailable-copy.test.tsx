import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstHitPlanCallout } from "./FirstHitPlanCallout";

function songWithoutHitPlan() {
  const song = createDemoRehearsalSong();
  for (const section of song.sections) {
    for (const role of section.roles) {
      role.hitPlan = "";
    }
  }
  return song;
}

describe("FirstHitPlanCallout unavailable copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not assert why the English hit plan is unavailable", () => {
    render(<FirstHitPlanCallout song={songWithoutHitPlan()} />);

    expect(screen.getByText("No hit plan is available. Stay on tonight's map for the next rehearsal cue.")).toBeTruthy();
  });

  it("does not assert why the Korean hit plan is unavailable", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstHitPlanCallout song={songWithoutHitPlan()} />);

    expect(screen.getByText("사용 가능한 히트 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요.")).toBeTruthy();
  });
});

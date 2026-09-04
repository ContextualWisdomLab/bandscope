import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstHookPlanCallout } from "./FirstHookPlanCallout";

function songWithoutHookPlan() {
  const song = createDemoRehearsalSong();
  for (const section of song.sections) {
    for (const role of section.roles) {
      role.hookPlan = "";
    }
  }
  return song;
}

describe("FirstHookPlanCallout unavailable copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not assert why the English hook plan is unavailable", () => {
    render(<FirstHookPlanCallout song={songWithoutHookPlan()} />);

    expect(screen.getByText("No hook plan is available. Stay on tonight's map for the next rehearsal cue.")).toBeTruthy();
  });

  it("does not assert why the Korean hook plan is unavailable", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstHookPlanCallout song={songWithoutHookPlan()} />);

    expect(screen.getByText("사용 가능한 훅 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요.")).toBeTruthy();
  });
});

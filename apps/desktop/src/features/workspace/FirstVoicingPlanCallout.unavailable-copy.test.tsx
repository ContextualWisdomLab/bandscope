import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstVoicingPlanCallout } from "./FirstVoicingPlanCallout";

function songWithoutVoicingPlan() {
  const song = createDemoRehearsalSong();
  for (const role of song.sections[0]!.roles) {
    role.voicingPlan = "";
  }
  return song;
}

describe("FirstVoicingPlanCallout unavailable copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not assert why the English voicing plan is unavailable", () => {
    render(<FirstVoicingPlanCallout song={songWithoutVoicingPlan()} />);

    expect(screen.getByText("No voicing plan is available. Stay on tonight's map for the next rehearsal cue.")).toBeTruthy();
  });

  it("does not assert why the Korean voicing plan is unavailable", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstVoicingPlanCallout song={songWithoutVoicingPlan()} />);

    expect(screen.getByText("사용 가능한 보이싱 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요.")).toBeTruthy();
  });
});

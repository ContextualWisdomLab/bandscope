import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstSoloPlanCallout } from "./FirstSoloPlanCallout";

function songWithoutSoloPlan() {
  const song = createDemoRehearsalSong();
  for (const section of song.sections) {
    for (const role of section.roles) {
      role.soloPlan = "";
    }
  }
  return song;
}

describe("FirstSoloPlanCallout unavailable copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not assert why the English solo plan is unavailable", () => {
    render(<FirstSoloPlanCallout song={songWithoutSoloPlan()} />);

    expect(screen.getByText("No solo plan is available. Stay on tonight's map for the next rehearsal cue.")).toBeTruthy();
  });

  it("does not assert why the Korean solo plan is unavailable", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstSoloPlanCallout song={songWithoutSoloPlan()} />);

    expect(screen.getByText("사용 가능한 솔로 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요.")).toBeTruthy();
  });
});

import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstHitPlanCallout } from "./FirstHitPlanCallout";

describe("FirstHitPlanCallout exact generated boundary authority", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps an untruncated exactly bounded prefix target verbatim", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    const targetPrefix = `Lead-${"A".repeat(124)}`;
    const exactBoundaryPlan = `Land this hit with ${targetPrefix}; don't drift past the downbeat.`;

    expect(Array.from(exactBoundaryPlan)).toHaveLength(180);

    seed.roles = [
      {
        ...seed.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        hitPlan: exactBoundaryPlan,
        hitPlanSource: "model"
      },
      {
        ...seed.roles[2]!,
        id: "long-part",
        name: `${targetPrefix}-full-name`,
        rehearsalPriority: "medium"
      }
    ];
    seed.partGraph = [
      { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "long-part", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    render(<FirstHitPlanCallout song={song} />);

    expect(screen.getByText(exactBoundaryPlan)).toBeTruthy();
    expect(
      screen.queryByText(
        `${targetPrefix} 파트와 이 히트를 맞추세요. 다운비트 뒤로 밀리지 마세요.`
      )
    ).toBeNull();
  });
});

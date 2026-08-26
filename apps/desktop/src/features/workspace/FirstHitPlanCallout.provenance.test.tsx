import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstHitPlanCallout } from "./FirstHitPlanCallout";

describe("FirstHitPlanCallout hit-plan provenance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves custom hit guidance that happens to match the engine sentence shape", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const customPlan = "Land this hit with Lead Vocal; don't drift past the downbeat.";
    section.roles = [
      {
        ...section.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        hitPlan: customPlan
      }
    ];
    section.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    render(<FirstHitPlanCallout song={song} />);

    expect(screen.getByText(customPlan)).toBeTruthy();
    expect(
      screen.queryByText("Lead Vocal 파트와 이 히트를 맞추세요. 다운비트 뒤로 밀리지 마세요.")
    ).toBeNull();
  });

  it("localizes engine-shaped guidance whose target names a part in this lineup", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    for (const role of section.roles) {
      role.hitPlan = "";
    }
    const engineLikePlan =
      "Land this hit with Keyboard 1 Right Hand; don't drift past the downbeat.";
    section.roles[1]!.hitPlan = engineLikePlan;

    render(<FirstHitPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand 파트와 이 히트를 맞추세요. 다운비트 뒤로 밀리지 마세요.")
    ).toBeTruthy();
    expect(screen.queryByText(engineLikePlan)).toBeNull();
  });
});

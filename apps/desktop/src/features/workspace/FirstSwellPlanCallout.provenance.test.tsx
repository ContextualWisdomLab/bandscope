import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstSwellPlanCallout } from "./FirstSwellPlanCallout";

function songWithKoreanSwell(
  swellPlan: string,
  swellPlanSource?: "model" | "user"
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  chorus.roles = [
    {
      ...chorus.roles[0]!,
      id: "piano",
      name: "피아노",
      rehearsalPriority: "high",
      swellPlan,
      ...(swellPlanSource ? { swellPlanSource } : {})
    }
  ];
  chorus.partGraph = [
    { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
  ];
  verse.partGraph = [
    { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
  ];
  song.sections = [verse, chorus];
  return song;
}

describe("FirstSwellPlanCallout swell-plan provenance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves user swell guidance that happens to match the engine sentence shape", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const customPlan = "Swell this part; grow into the next downbeat.";
    const song = songWithKoreanSwell(customPlan, "user");

    render(<FirstSwellPlanCallout song={song} />);

    expect(screen.getByText(customPlan)).toBeTruthy();
    expect(screen.queryByText("이 파트를 스웰하세요. 다음 다운비트까지 키우세요.")).toBeNull();
  });

  it("does not infer model authority when persisted swell guidance has no source", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const legacyPlan = "Swell this part; grow into the next downbeat.";
    const song = songWithKoreanSwell(legacyPlan);

    render(<FirstSwellPlanCallout song={song} />);

    expect(screen.getByText(legacyPlan)).toBeTruthy();
    expect(screen.queryByText("이 파트를 스웰하세요. 다음 다운비트까지 키우세요.")).toBeNull();
  });

  it("localizes model guidance from structured landing topology instead of display sentence wording", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithKoreanSwell(
      "Swell this part with Keyboard 1 Right Hand; grow into the next downbeat.",
      "model"
    );

    render(<FirstSwellPlanCallout song={song} />);

    expect(
      screen.getByText(
        "Keyboard 1 Right Hand 파트와 이 파트를 스웰하세요. 다음 다운비트까지 키우세요."
      )
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Swell this part with Keyboard 1 Right Hand; grow into the next downbeat."
      )
    ).toBeNull();
  });
});

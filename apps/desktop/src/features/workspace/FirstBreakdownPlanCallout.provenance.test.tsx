import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstBreakdownPlanCallout } from "./FirstBreakdownPlanCallout";

function songWithKoreanBreakdown(
  breakdownPlan: string,
  breakdownPlanSource?: "model" | "user"
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
      breakdownPlan,
      ...(breakdownPlanSource ? { breakdownPlanSource } : {})
    }
  ];
  chorus.partGraph = [
    { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: false, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: [] }
  ];
  verse.partGraph = [
    { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
  ];
  song.sections = [verse, chorus];
  return song;
}

describe("FirstBreakdownPlanCallout breakdown-plan provenance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves user breakdown guidance that happens to match the engine sentence shape", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const customPlan = "Hold this breakdown; keep it sparse until the drop.";
    const song = songWithKoreanBreakdown(customPlan, "user");

    render(<FirstBreakdownPlanCallout song={song} />);

    expect(screen.getByText(customPlan)).toBeTruthy();
    expect(screen.queryByText("이 브레이크다운을 유지하세요. 드롭 전까지 얇게 가십시오.")).toBeNull();
  });

  it("does not infer model authority when persisted breakdown guidance has no source", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const legacyPlan = "Hold this breakdown; keep it sparse until the drop.";
    const song = songWithKoreanBreakdown(legacyPlan);

    render(<FirstBreakdownPlanCallout song={song} />);

    expect(screen.getByText(legacyPlan)).toBeTruthy();
    expect(screen.queryByText("이 브레이크다운을 유지하세요. 드롭 전까지 얇게 가십시오.")).toBeNull();
  });

  it("localizes model guidance from structured holding topology instead of display sentence wording", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithKoreanBreakdown(
      "Hold this breakdown with Keyboard 1 Right Hand; keep it sparse until the drop.",
      "model"
    );

    render(<FirstBreakdownPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand 파트와 이 브레이크다운을 유지하세요. 드롭 전까지 얇게 가십시오.")
    ).toBeTruthy();
    expect(
      screen.queryByText("Hold this breakdown with Keyboard 1 Right Hand; keep it sparse until the drop.")
    ).toBeNull();
  });
});

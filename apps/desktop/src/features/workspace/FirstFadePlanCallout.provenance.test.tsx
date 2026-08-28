import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstFadePlanCallout } from "./FirstFadePlanCallout";

function songWithKoreanFade(
  fadePlan: string,
  fadePlanSource?: "model" | "user"
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
      fadePlan,
      ...(fadePlanSource ? { fadePlanSource } : {})
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

describe("FirstFadePlanCallout fade-plan provenance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves user fade guidance that happens to match the engine sentence shape", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const customPlan = "Fade this part; let the next downbeat land quieter.";
    const song = songWithKoreanFade(customPlan, "user");

    render(<FirstFadePlanCallout song={song} />);

    expect(screen.getByText(customPlan)).toBeTruthy();
    expect(screen.queryByText("이 파트를 페이드하세요. 다음 다운비트까지 줄이세요.")).toBeNull();
  });

  it("does not infer model authority when persisted fade guidance has no source", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const legacyPlan = "Fade this part; let the next downbeat land quieter.";
    const song = songWithKoreanFade(legacyPlan);

    render(<FirstFadePlanCallout song={song} />);

    expect(screen.getByText(legacyPlan)).toBeTruthy();
    expect(screen.queryByText("이 파트를 페이드하세요. 다음 다운비트까지 줄이세요.")).toBeNull();
  });

  it("localizes model guidance from structured landing topology instead of display sentence wording", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithKoreanFade(
      "Fade this part with Keyboard 1 Right Hand; let the next downbeat land quieter.",
      "model"
    );

    render(<FirstFadePlanCallout song={song} />);

    expect(
      screen.getByText(
        "Keyboard 1 Right Hand 파트와 이 파트를 페이드하세요. 다음 다운비트까지 줄이세요."
      )
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Fade this part with Keyboard 1 Right Hand; let the next downbeat land quieter."
      )
    ).toBeNull();
  });
});

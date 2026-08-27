import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstDropPlanCallout } from "./FirstDropPlanCallout";

function songWithKoreanDrop(
  dropPlan: string,
  dropPlanSource?: "model" | "user"
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
      dropPlan,
      ...(dropPlanSource ? { dropPlanSource } : {})
    }
  ];
  chorus.partGraph = [
    { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
  ];
  verse.partGraph = [
    { role_id: "piano", is_active: false, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
  ];
  song.sections = [verse, chorus];
  return song;
}

describe("FirstDropPlanCallout drop-plan provenance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves user drop guidance that happens to match the engine sentence shape", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const customPlan = "Hit this drop; come in together when the texture fills.";
    const song = songWithKoreanDrop(customPlan, "user");

    render(<FirstDropPlanCallout song={song} />);

    expect(screen.getByText(customPlan)).toBeTruthy();
    expect(screen.queryByText("이 드롭을 맞으세요. 텍스처가 채워질 때 함께 들어오십시오.")).toBeNull();
  });

  it("does not infer model authority when persisted drop guidance has no source", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const legacyPlan = "Hit this drop; come in together when the texture fills.";
    const song = songWithKoreanDrop(legacyPlan);

    render(<FirstDropPlanCallout song={song} />);

    expect(screen.getByText(legacyPlan)).toBeTruthy();
    expect(screen.queryByText("이 드롭을 맞으세요. 텍스처가 채워질 때 함께 들어오십시오.")).toBeNull();
  });

  it("localizes model guidance from structured landing topology instead of display sentence wording", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithKoreanDrop(
      "Hit this drop with Keyboard 1 Right Hand; come in together when the texture fills.",
      "model"
    );

    render(<FirstDropPlanCallout song={song} />);

    expect(
      screen.getByText(
        "Keyboard 1 Right Hand 파트와 이 드롭을 맞으세요. 텍스처가 채워질 때 함께 들어오십시오."
      )
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Hit this drop with Keyboard 1 Right Hand; come in together when the texture fills."
      )
    ).toBeNull();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
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

describe("FirstBreakdownPlanCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending role names particle-safe before and after the breakdown action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithKoreanBreakdown(
      "Hold this breakdown; keep it sparse until the drop."
    );

    const grid = document.createElement("div");
    grid.dataset.testid = "song-structure-grid";
    grid.setAttribute("role", "region");
    grid.setAttribute("aria-label", "Scrollable song structure timeline");
    const target = document.createElement("div");
    target.dataset.sectionIndex = "1";
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });
    grid.appendChild(target);
    document.body.appendChild(grid);

    render(<FirstBreakdownPlanCallout song={song} />);

    expect(screen.getByText("0:30 코러스에서 피아노 파트가 브레이크다운을 유지합니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();
    expect(screen.queryByText(/피아노가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:30 피아노 브레이크다운 열기" }));

    expect(
      screen.getByText("0:30에서 피아노 파트로 브레이크다운을 유지하세요. 드롭 전까지 얇게 가십시오.")
    ).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();

    grid.remove();
  });
});

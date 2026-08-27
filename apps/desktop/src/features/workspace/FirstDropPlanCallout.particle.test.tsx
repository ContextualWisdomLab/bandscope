import { fireEvent, render, screen } from "@testing-library/react";
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

describe("FirstDropPlanCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending role names particle-safe before and after the drop action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithKoreanDrop(
      "Hit this drop; come in together when the texture fills.",
      "model"
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

    render(<FirstDropPlanCallout song={song} />);

    expect(screen.getByText("0:30 코러스에서 피아노 파트가 드롭을 맞습니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();
    expect(screen.queryByText(/피아노가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:30 피아노 드롭 열기" }));

    expect(
      screen.getByText("0:30에서 피아노 파트로 함께 드롭하세요. 텍스처가 채워질 때 들어오세요.")
    ).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();
    expect(screen.queryByText(/피아노을/)).toBeNull();
    expect(screen.queryByText(/피아노를/)).toBeNull();

    grid.remove();
  });
});

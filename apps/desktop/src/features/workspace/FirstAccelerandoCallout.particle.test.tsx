import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstAccelerandoCallout } from "./FirstAccelerandoCallout";

function songWithKoreanAccel() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  verse.roles = [
    {
      ...verse.roles[0]!,
      id: "piano-vocal",
      name: "피아노",
      roleType: "vocal",
      rehearsalPriority: "high",
      accelerandoPlan:
        "Push this part from 80 BPM into 120 BPM; let the next downbeat arrive sooner.",
      accelerandoPlanSource: "model"
    }
  ];
  verse.partGraph = [
    { role_id: "piano-vocal", is_active: true, handoff_to: [], handoff_from: [] }
  ];
  return song;
}

describe("FirstAccelerandoCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending role names particle-safe before and after the accel action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithKoreanAccel();

    const grid = document.createElement("div");
    grid.dataset.testid = "song-structure-grid";
    grid.setAttribute("role", "region");
    grid.setAttribute("aria-label", "Scrollable song structure timeline");
    const target = document.createElement("div");
    target.dataset.sectionIndex = "0";
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });
    grid.appendChild(target);
    document.body.appendChild(grid);

    render(<FirstAccelerandoCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 피아노 파트가 아첼레란도합니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();
    expect(screen.queryByText(/피아노가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 피아노 아첼레란도 열기" }));

    expect(
      screen.getByText("0:10에서 피아노 파트로 함께 당기세요. 더 빠른 착지가 들리도록 밀으세요.")
    ).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();
    expect(screen.queryByText(/피아노을/)).toBeNull();
    expect(screen.queryByText(/피아노를/)).toBeNull();

    grid.remove();
  });
});

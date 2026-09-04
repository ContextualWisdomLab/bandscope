import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstRitardandoCallout } from "./FirstRitardandoCallout";

function songWithKoreanRit() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  verse.roles = [
    {
      ...verse.roles[0]!,
      id: "piano-vocal",
      name: "피아노",
      roleType: "vocal",
      rehearsalPriority: "high",
      ritardandoPlan:
        "Ease this part from 120 BPM into 80 BPM; let the next downbeat land later.",
      ritardandoPlanSource: "model"
    }
  ];
  verse.partGraph = [
    { role_id: "piano-vocal", is_active: true, handoff_to: [], handoff_from: [] }
  ];
  return song;
}

describe("FirstRitardandoCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending role names particle-safe before and after the rit action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithKoreanRit();

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

    render(<FirstRitardandoCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 피아노 파트가 리타르단도합니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();
    expect(screen.queryByText(/피아노가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 피아노 리타르단도 열기" }));

    expect(
      screen.getByText("0:10에서 피아노 파트와 함께 늦추세요. 더 느린 착지가 들리도록 맞추세요.")
    ).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();
    expect(screen.queryByText(/피아노을/)).toBeNull();
    expect(screen.queryByText(/피아노를/)).toBeNull();

    grid.remove();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstCountCueCallout } from "./FirstCountCueCallout";

describe("FirstCountCueCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending dynamic role names particle-safe before and after the count action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[1]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        cue: { kind: "count", value: "픽업 다음 2박에 들어가세요." }
      }
    ];
    seed.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

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

    render(<FirstCountCueCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 피아노 파트가 카운트합니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 피아노 카운트 위치 열기" }));

    expect(screen.getByText("0:10에서 피아노 파트 카운트를 잡으세요. 함께 들어가세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();

    grid.remove();
  });
});

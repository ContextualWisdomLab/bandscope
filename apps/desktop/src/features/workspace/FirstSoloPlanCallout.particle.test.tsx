import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstSoloPlanCallout } from "./FirstSoloPlanCallout";

describe("FirstSoloPlanCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending role names particle-safe before and after the solo action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        soloPlan: "Hold the verse solo; everyone else drops to a two-bar pad so the run can land."
      }
    ];
    seed.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    const { container } = render(<FirstSoloPlanCallout song={song} />);
    const grid = document.createElement("div");
    grid.dataset.testid = "song-structure-grid";
    grid.setAttribute("role", "region");
    grid.setAttribute("aria-label", "Scrollable song structure timeline");
    const target = document.createElement("div");
    target.dataset.sectionId = seed.id;
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });
    container.append(grid, target);

    expect(screen.getByText("0:10 벌스에서 피아노 파트의 솔로 계획이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();
    expect(screen.queryByText(/피아노가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 피아노 솔로 열기" }));

    expect(screen.getByText("0:10에서 피아노 파트의 솔로를 맞춘 다음 합주를 시작하세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();
  });
});

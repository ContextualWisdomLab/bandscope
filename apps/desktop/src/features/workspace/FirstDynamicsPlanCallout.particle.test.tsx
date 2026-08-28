import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstDynamicsPlanCallout } from "./FirstDynamicsPlanCallout";

describe("FirstDynamicsPlanCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending dynamic role names particle-safe before and after the dynamics action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[0]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        dynamicsPlan: "Keep the verse under the vocal so the chorus still has somewhere to lift."
      }
    ];
    seed.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    const grid = document.createElement("div");
      grid.id = "workspace-song-structure-grid";
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

    render(<FirstDynamicsPlanCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 피아노 파트의 다이내믹 계획이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();
    expect(screen.queryByText(/피아노가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 피아노 다이내믹 열기" }));

    expect(screen.getByText("0:10에서 피아노 파트의 다이내믹을 맞춘 다음 합주를 시작하세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();

    grid.remove();
  });
});

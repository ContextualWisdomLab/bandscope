import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstVampPlanCallout } from "./FirstVampPlanCallout";

describe("FirstVampPlanCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending role names particle-safe before and after the vamp action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        vampPlan: "Hold the two-bar verse groove until the vocal pickup; don't move until you hear city lights."
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

    render(<FirstVampPlanCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 피아노 파트의 뱀프 계획이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();
    expect(screen.queryByText(/피아노가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 피아노 뱀프 열기" }));

    expect(screen.getByText("0:10에서 피아노 파트의 뱀프를 맞춘 다음 합주를 시작하세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();

    grid.remove();
  });

  it("localizes the analysis-engine vamp template instead of exposing English guidance", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        vampPlan: "Keep this part going until Lead Vocal enters in the next section."
      }
    ];
    seed.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    render(<FirstVampPlanCallout song={song} />);

    expect(
      screen.getByText("다음 섹션에서 Lead Vocal 파트가 들어올 때까지 이 파트를 유지하세요.")
    ).toBeTruthy();
    expect(
      screen.queryByText("Keep this part going until Lead Vocal enters in the next section.")
    ).toBeNull();
  });
});

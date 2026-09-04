import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstCutoffPlanCallout } from "./FirstCutoffPlanCallout";

describe("FirstCutoffPlanCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending role names particle-safe before and after the cutoff action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        cutoffPlan: "Cut this off with Lead Vocal on the verse last beat; don't linger past the pickup.",
        cutoffPlanSource: "user"
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

    render(<FirstCutoffPlanCallout song={song} />);

    expect(screen.getByText("0:30 벌스에서 피아노 파트의 컷오프 계획이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();
    expect(screen.queryByText(/피아노가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:30 피아노 컷오프 열기" }));

    expect(screen.getByText("0:30에서 피아노 파트의 컷오프를 맞춘 다음 합주를 시작하세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();

    grid.remove();
  });

  it("localizes the analysis-engine cutoff template instead of exposing English guidance", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        cutoffPlan: "Cut this off with Lead Vocal; don't linger past the last beat.",
        cutoffPlanSource: "model"
      }
    ];
    seed.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    render(<FirstCutoffPlanCallout song={song} />);

    expect(
      screen.getByText("Lead Vocal 파트와 이 컷오프를 맞추세요. 마지막 박 뒤로 남기지 마세요.")
    ).toBeTruthy();
    expect(
      screen.queryByText("Cut this off with Lead Vocal; don't linger past the last beat.")
    ).toBeNull();
  });

  it("localizes the rest-of-band cutoff template instead of exposing English guidance", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        cutoffPlan: "Cut this off with the rest of the band; don't linger past the last beat.",
        cutoffPlanSource: "model"
      }
    ];
    seed.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    render(<FirstCutoffPlanCallout song={song} />);

    expect(
      screen.getByText("나머지 밴드와 이 컷오프를 맞추세요. 마지막 박 뒤로 남기지 마세요.")
    ).toBeTruthy();
    expect(
      screen.queryByText("Cut this off with the rest of the band; don't linger past the last beat.")
    ).toBeNull();
  });

  it("preserves the generated template shape when long target names are bounded", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    const targetRole = `Lead-${"A".repeat(180)}`;
    seed.roles = [
      {
        ...seed.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        cutoffPlan: `Cut this off with ${targetRole}; don't linger past the last beat.`,
        cutoffPlanSource: "model"
      }
    ];
    seed.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    render(<FirstCutoffPlanCallout song={song} />);

    expect(screen.queryByText(/^Cut this off with /)).toBeNull();
    expect(
      screen.getByText(
        (content) =>
          content.startsWith("Lead-") && content.endsWith("파트와 이 컷오프를 맞추세요. 마지막 박 뒤로 남기지 마세요.")
      )
    ).toBeTruthy();
  });
});

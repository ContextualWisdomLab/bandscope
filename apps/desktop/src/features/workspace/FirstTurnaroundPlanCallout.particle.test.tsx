import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstTurnaroundPlanCallout } from "./FirstTurnaroundPlanCallout";

describe("FirstTurnaroundPlanCallout Korean role copy", () => {
  function setPianoTurnaround(song: RehearsalSong, turnaroundPlan: string) {
    const section = song.sections[0]!;
    const piano = {
      ...section.roles[2]!,
      id: "piano",
      name: "피아노",
      rehearsalPriority: "high" as const,
      turnaroundPlan,
      turnaroundPlanSource: "model" as const
    };
    const companion = structuredClone(section.roles[0]!);
    delete companion.turnaroundPlan;
    delete companion.turnaroundPlanSource;
    section.roles = [piano, companion];
    section.partGraph = [
      { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: companion.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];

    const continuation = structuredClone(section);
    continuation.id = "chorus-1";
    continuation.label = "chorus";
    continuation.timeRange = { start: 30, end: 50 };
    continuation.roles = continuation.roles.map((role) => {
      const clone = structuredClone(role);
      delete clone.turnaroundPlan;
      delete clone.turnaroundPlanSource;
      return clone;
    });
    continuation.partGraph = continuation.partGraph.map((node) => ({ ...node, is_active: true }));
    song.sections = [section, continuation];
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending role names particle-safe before and after the turnaround action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    setPianoTurnaround(
      song,
      "Turn these last bars with Lead Vocal on the verse last beat; land the chorus downbeat together."
    );

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

    render(<FirstTurnaroundPlanCallout song={song} />);

    expect(screen.getByText("0:30 벌스에서 피아노 파트의 턴어라운드 계획이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();
    expect(screen.queryByText(/피아노가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:30 피아노 턴어라운드 열기" }));

    expect(screen.getByText("0:30에서 피아노 파트의 턴어라운드를 맞춘 다음 합주를 시작하세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();

    grid.remove();
  });

  it("localizes the analysis-engine turnaround template instead of exposing English guidance", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    setPianoTurnaround(song, "Turn these last bars with Lead Vocal; land the downbeat together.");

    render(<FirstTurnaroundPlanCallout song={song} />);

    expect(
      screen.getByText("Lead Vocal 파트와 이 턴어라운드를 맞추세요. 다음 섹션 첫 박에 함께 들어가세요.")
    ).toBeTruthy();
    expect(
      screen.queryByText("Turn these last bars with Lead Vocal; land the downbeat together.")
    ).toBeNull();
  });

  it("localizes the rest-of-band turnaround template instead of exposing English guidance", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    setPianoTurnaround(
      song,
      "Turn these last bars with the rest of the band; land the downbeat together."
    );

    render(<FirstTurnaroundPlanCallout song={song} />);

    expect(
      screen.getByText("나머지 밴드와 이 턴어라운드를 맞추세요. 다음 섹션 첫 박에 함께 들어가세요.")
    ).toBeTruthy();
    expect(
      screen.queryByText("Turn these last bars with the rest of the band; land the downbeat together.")
    ).toBeNull();
  });

  it("preserves the generated template shape when long target names are bounded", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const targetRole = `Lead-${"A".repeat(180)}`;
    setPianoTurnaround(
      song,
      `Turn these last bars with ${targetRole}; land the downbeat together.`
    );

    render(<FirstTurnaroundPlanCallout song={song} />);

    expect(screen.queryByText(/^Turn these last bars with /)).toBeNull();
    expect(
      screen.getByText(
        (content) =>
          content.startsWith("Lead-") && content.endsWith("파트와 이 턴어라운드를 맞추세요. 다음 섹션 첫 박에 함께 들어가세요.")
      )
    ).toBeTruthy();
  });
});

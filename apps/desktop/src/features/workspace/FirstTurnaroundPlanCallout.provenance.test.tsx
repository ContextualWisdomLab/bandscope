import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstTurnaroundPlanCallout } from "./FirstTurnaroundPlanCallout";

describe("FirstTurnaroundPlanCallout turnaround-plan provenance", () => {
  function setPianoTurnaround(
    song: RehearsalSong,
    turnaroundPlan: string,
    turnaroundPlanSource?: "model" | "user"
  ) {
    const section = song.sections[0]!;
    const piano = {
      ...section.roles[2]!,
      id: "piano",
      name: "피아노",
      rehearsalPriority: "high" as const,
      turnaroundPlan,
      ...(turnaroundPlanSource ? { turnaroundPlanSource } : {})
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

  it("preserves user turnaround guidance that happens to match the engine sentence shape", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const customPlan = "Turn these last bars with Lead Vocal; land the downbeat together.";
    setPianoTurnaround(song, customPlan, "user");

    render(<FirstTurnaroundPlanCallout song={song} />);

    expect(screen.getByText(customPlan)).toBeTruthy();
    expect(
      screen.queryByText("Lead Vocal 파트와 이 턴어라운드를 맞추세요. 다음 섹션 첫 박에 함께 들어가세요.")
    ).toBeNull();
  });

  it("does not infer model authority when persisted turnaround guidance has no source", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const legacyPlan = "Turn these last bars with Lead Vocal; land the downbeat together.";
    setPianoTurnaround(song, legacyPlan);

    render(<FirstTurnaroundPlanCallout song={song} />);

    expect(screen.getByText(legacyPlan)).toBeTruthy();
    expect(
      screen.queryByText("Lead Vocal 파트와 이 턴어라운드를 맞추세요. 다음 섹션 첫 박에 함께 들어가세요.")
    ).toBeNull();
  });

  it("localizes the engine template only when model provenance is explicit", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const generatedPlan = "Turn these last bars with Lead Vocal; land the downbeat together.";
    setPianoTurnaround(song, generatedPlan, "model");

    render(<FirstTurnaroundPlanCallout song={song} />);

    expect(
      screen.getByText("Lead Vocal 파트와 이 턴어라운드를 맞추세요. 다음 섹션 첫 박에 함께 들어가세요.")
    ).toBeTruthy();
    expect(screen.queryByText(generatedPlan)).toBeNull();
  });
});

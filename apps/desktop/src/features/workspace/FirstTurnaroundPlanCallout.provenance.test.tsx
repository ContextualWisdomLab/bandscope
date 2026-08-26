import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstTurnaroundPlanCallout } from "./FirstTurnaroundPlanCallout";

describe("FirstTurnaroundPlanCallout turnaround-plan provenance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves user turnaround guidance that happens to match the engine sentence shape", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const customPlan = "Turn these last bars with Lead Vocal; land the downbeat together.";
    section.roles = [
      {
        ...section.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        turnaroundPlan: customPlan,
        turnaroundPlanSource: "user"
      }
    ];
    section.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    render(<FirstTurnaroundPlanCallout song={song} />);

    expect(screen.getByText(customPlan)).toBeTruthy();
    expect(
      screen.queryByText("Lead Vocal 파트와 이 턴어라운드를 맞추세요. 다음 섹션 첫 박에 함께 들어가세요.")
    ).toBeNull();
  });

  it("does not infer model authority when persisted turnaround guidance has no source", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const legacyPlan = "Turn these last bars with Lead Vocal; land the downbeat together.";
    section.roles = [
      {
        ...section.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        turnaroundPlan: legacyPlan
      }
    ];
    section.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    render(<FirstTurnaroundPlanCallout song={song} />);

    expect(screen.getByText(legacyPlan)).toBeTruthy();
    expect(
      screen.queryByText("Lead Vocal 파트와 이 턴어라운드를 맞추세요. 다음 섹션 첫 박에 함께 들어가세요.")
    ).toBeNull();
  });

  it("localizes the engine template only when model provenance is explicit", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const generatedPlan = "Turn these last bars with Lead Vocal; land the downbeat together.";
    section.roles = [
      {
        ...section.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        turnaroundPlan: generatedPlan,
        turnaroundPlanSource: "model"
      }
    ];
    section.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    render(<FirstTurnaroundPlanCallout song={song} />);

    expect(
      screen.getByText("Lead Vocal 파트와 이 턴어라운드를 맞추세요. 다음 섹션 첫 박에 함께 들어가세요.")
    ).toBeTruthy();
    expect(screen.queryByText(generatedPlan)).toBeNull();
  });
});

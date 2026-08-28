import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstCutoffPlanCallout } from "./FirstCutoffPlanCallout";

describe("FirstCutoffPlanCallout cutoff-plan provenance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves user cutoff guidance that happens to match the engine sentence shape", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const customPlan = "Cut this off with Lead Vocal; don't linger past the last beat.";
    section.roles = [
      {
        ...section.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        cutoffPlan: customPlan,
        cutoffPlanSource: "user"
      }
    ];
    section.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    render(<FirstCutoffPlanCallout song={song} />);

    expect(screen.getByText(customPlan)).toBeTruthy();
    expect(
      screen.queryByText("Lead Vocal 파트와 이 컷오프를 맞추세요. 마지막 박 뒤로 남기지 마세요.")
    ).toBeNull();
  });

  it("does not render persisted cutoff guidance when it has no source", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const legacyPlan = "Cut this off with Lead Vocal; don't linger past the last beat.";
    section.roles = [
      {
        ...section.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        cutoffPlan: legacyPlan
      }
    ];
    section.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    render(<FirstCutoffPlanCallout song={song} />);

    expect(screen.queryByText(legacyPlan)).toBeNull();
    expect(
      screen.getByText(
        "사용 가능한 컷오프 계획이 없습니다. 다음 합주 큐를 위해 오늘 맵에 머무르세요."
      )
    ).toBeTruthy();
    expect(
      screen.queryByText("Lead Vocal 파트와 이 컷오프를 맞추세요. 마지막 박 뒤로 남기지 마세요.")
    ).toBeNull();
  });

  it("localizes the engine template only when model provenance is explicit", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const generatedPlan = "Cut this off with Lead Vocal; don't linger past the last beat.";
    section.roles = [
      {
        ...section.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        cutoffPlan: generatedPlan,
        cutoffPlanSource: "model"
      }
    ];
    section.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    render(<FirstCutoffPlanCallout song={song} />);

    expect(
      screen.getByText("Lead Vocal 파트와 이 컷오프를 맞추세요. 마지막 박 뒤로 남기지 마세요.")
    ).toBeTruthy();
    expect(screen.queryByText(generatedPlan)).toBeNull();
  });
});

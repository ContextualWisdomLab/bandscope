import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstPickupPlanCallout } from "./FirstPickupPlanCallout";

function songWithKoreanPickup(
  pickupPlan: string,
  pickupPlanSource?: "model" | "user"
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const companion = verse.roles.find((role) => role.id === "bass-guitar")!;
  verse.roles = [
    {
      ...verse.roles[2]!,
      id: "piano",
      name: "피아노",
      rehearsalPriority: "high",
      pickupPlan,
      ...(pickupPlanSource ? { pickupPlanSource } : {})
    },
    companion
  ];
  verse.partGraph = [
    { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }
  ];
  const intro = structuredClone(verse);
  intro.id = "intro-1";
  intro.label = "intro";
  intro.timeRange = { start: 0, end: verse.timeRange.start };
  intro.roles = intro.roles.map((role) => {
    const clone = { ...role };
    delete clone.pickupPlan;
    delete clone.pickupPlanSource;
    return clone;
  });
  intro.partGraph = intro.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id !== "piano"
  }));
  song.sections = [intro, verse];
  return song;
}

describe("FirstPickupPlanCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending role names particle-safe before and after the pickup action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithKoreanPickup(
      "Play this pickup with Lead Vocal on the verse last beat; land the chorus downbeat together."
    );

    const grid = document.createElement("div");
    grid.dataset.testid = "song-structure-grid";
    grid.setAttribute("role", "region");
    grid.setAttribute("aria-label", "Scrollable song structure timeline");
    const target = document.createElement("div");
    target.dataset.sectionIndex = "1";
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });
    grid.appendChild(target);
    document.body.appendChild(grid);

    render(<FirstPickupPlanCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 피아노 파트의 픽업 계획이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();
    expect(screen.queryByText(/피아노가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 피아노 픽업 열기" }));

    expect(screen.getByText("0:10에서 피아노 파트의 픽업을 넣은 다음 합주를 시작하세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();

    grid.remove();
  });

  it("localizes the analysis-engine pickup template instead of exposing English guidance", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithKoreanPickup(
      "Play this pickup with Lead Vocal; land the downbeat together.",
      "model"
    );

    render(<FirstPickupPlanCallout song={song} />);

    expect(
      screen.getByText("Lead Vocal 파트와 이 픽업을 맞추세요. 첫 박에 함께 들어가세요.")
    ).toBeTruthy();
    expect(
      screen.queryByText("Play this pickup with Lead Vocal; land the downbeat together.")
    ).toBeNull();
  });

  it("localizes the rest-of-band pickup template instead of exposing English guidance", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithKoreanPickup(
      "Play this pickup with the rest of the band; land the downbeat together.",
      "model"
    );

    render(<FirstPickupPlanCallout song={song} />);

    expect(
      screen.getByText("나머지 밴드와 이 픽업을 맞추세요. 첫 박에 함께 들어가세요.")
    ).toBeTruthy();
    expect(
      screen.queryByText("Play this pickup with the rest of the band; land the downbeat together.")
    ).toBeNull();
  });

  it("preserves the generated template shape when long target names are bounded", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const targetRole = `Lead-${"A".repeat(180)}`;
    const boundedTargetRole = `Lead-${"A".repeat(124)}`;
    const song = songWithKoreanPickup(
      `Play this pickup with ${targetRole}; land the downbeat together.`,
      "model"
    );
    const landing = song.sections[1]!;
    landing.roles[1] = { ...landing.roles[1]!, name: targetRole };

    render(<FirstPickupPlanCallout song={song} />);

    expect(screen.queryByText(/^Play this pickup with /)).toBeNull();
    expect(
      screen.getByText(`${boundedTargetRole} 파트와 이 픽업을 맞추세요. 첫 박에 함께 들어가세요.`)
    ).toBeTruthy();
    expect(
      screen.queryByText(`${targetRole} 파트와 이 픽업을 맞추세요. 첫 박에 함께 들어가세요.`)
    ).toBeNull();
  });
});
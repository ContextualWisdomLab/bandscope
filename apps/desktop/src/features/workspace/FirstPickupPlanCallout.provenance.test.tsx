import { render, screen } from "@testing-library/react";
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

function songWithKoreanAccompanimentPickup() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const bass = verse.roles.find((role) => role.id === "bass-guitar")!;
  verse.roles = [
    {
      ...bass,
      name: "베이스",
      rehearsalPriority: "high",
      pickupPlan: "Play this pickup with Keys / guitar; land the downbeat together.",
      pickupPlanSource: "model"
    },
    {
      ...verse.roles[2]!,
      id: "keys-left",
      name: "Keys",
      rehearsalPriority: "medium"
    }
  ];
  verse.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-left", is_active: true, handoff_to: [], handoff_from: [] }
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
    is_active: node.role_id !== "bass-guitar"
  }));
  song.sections = [intro, verse];
  return song;
}

describe("FirstPickupPlanCallout pickup-plan provenance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves user pickup guidance that happens to match the engine sentence shape", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const customPlan = "Play this pickup with Lead Vocal; land the downbeat together.";
    const song = songWithKoreanPickup(customPlan, "user");

    render(<FirstPickupPlanCallout song={song} />);

    expect(screen.getByText(customPlan)).toBeTruthy();
    expect(
      screen.queryByText("Bass Guitar 파트와 이 픽업을 맞추세요. 첫 박에 함께 들어가세요.")
    ).toBeNull();
  });

  it("does not infer model authority when persisted pickup guidance has no source", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const legacyPlan = "Play this pickup with Lead Vocal; land the downbeat together.";
    const song = songWithKoreanPickup(legacyPlan);

    render(<FirstPickupPlanCallout song={song} />);

    expect(screen.getByText(legacyPlan)).toBeTruthy();
    expect(
      screen.queryByText("Bass Guitar 파트와 이 픽업을 맞추세요. 첫 박에 함께 들어가세요.")
    ).toBeNull();
  });

  it("localizes model guidance from structured landing topology instead of display sentence wording", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const changedDisplayCopy = "Pickup display wording changed upstream.";
    const song = songWithKoreanPickup(changedDisplayCopy, "model");

    render(<FirstPickupPlanCallout song={song} />);

    expect(
      screen.getByText("Bass Guitar 파트와 이 픽업을 맞추세요. 첫 박에 함께 들어가세요.")
    ).toBeTruthy();
    expect(screen.queryByText(changedDisplayCopy)).toBeNull();
  });

  it("localizes the shared keys/guitar source as accompaniment instead of a role name", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithKoreanAccompanimentPickup();

    render(<FirstPickupPlanCallout song={song} />);

    expect(
      screen.getByText("키/기타 반주와 이 픽업을 맞추세요. 첫 박에 함께 들어가세요.")
    ).toBeTruthy();
    expect(
      screen.queryByText("Keys / guitar 파트와 이 픽업을 맞추세요. 첫 박에 함께 들어가세요.")
    ).toBeNull();
  });
});

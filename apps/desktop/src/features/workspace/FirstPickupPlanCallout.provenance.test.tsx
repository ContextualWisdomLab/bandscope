import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstPickupPlanCallout } from "./FirstPickupPlanCallout";

function songWithKoreanPickup(
  pickupPlan: string,
  pickupPlanSource?: "model" | "user",
  pickupPlanKind?: "activity-boundary-role" | "activity-boundary-band",
  pickupPlanTargetRole?: string
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const companion = verse.roles.find((role) => role.id === "bass-guitar")!;
  const landingRole = {
    ...verse.roles[2]!,
    id: "piano",
    name: "피아노",
    rehearsalPriority: "high" as const,
    pickupPlan,
    ...(pickupPlanSource ? { pickupPlanSource } : {})
  };
  Object.assign(landingRole, {
    ...(pickupPlanKind ? { pickupPlanKind } : {}),
    ...(pickupPlanTargetRole ? { pickupPlanTargetRole } : {})
  });
  verse.roles = [landingRole, companion];
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
    const mutableClone = clone as typeof clone & {
      pickupPlanKind?: string;
      pickupPlanTargetRole?: string;
    };
    delete mutableClone.pickupPlanKind;
    delete mutableClone.pickupPlanTargetRole;
    return clone;
  });
  intro.partGraph = intro.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id !== "piano"
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
      screen.queryByText("Lead Vocal 파트와 이 픽업을 맞추세요. 첫 박에 함께 들어가세요.")
    ).toBeNull();
  });

  it("does not infer model authority when persisted pickup guidance has no source", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const legacyPlan = "Play this pickup with Lead Vocal; land the downbeat together.";
    const song = songWithKoreanPickup(legacyPlan);

    render(<FirstPickupPlanCallout song={song} />);

    expect(screen.getByText(legacyPlan)).toBeTruthy();
    expect(
      screen.queryByText("Lead Vocal 파트와 이 픽업을 맞추세요. 첫 박에 함께 들어가세요.")
    ).toBeNull();
  });

  it("localizes model guidance from structured role provenance instead of display sentence wording", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const changedDisplayCopy = "Pickup display wording changed upstream.";
    const song = songWithKoreanPickup(
      changedDisplayCopy,
      "model",
      "activity-boundary-role",
      "Lead Vocal"
    );

    render(<FirstPickupPlanCallout song={song} />);

    expect(
      screen.getByText("Lead Vocal 파트와 이 픽업을 맞추세요. 첫 박에 함께 들어가세요.")
    ).toBeTruthy();
    expect(screen.queryByText(changedDisplayCopy)).toBeNull();
  });

  it("localizes band pickup guidance from its structured provenance kind", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const changedDisplayCopy = "Three-source pickup display copy changed upstream.";
    const song = songWithKoreanPickup(changedDisplayCopy, "model", "activity-boundary-band");

    render(<FirstPickupPlanCallout song={song} />);

    expect(screen.getByText("나머지 밴드와 이 픽업을 맞추세요. 첫 박에 함께 들어가세요.")).toBeTruthy();
    expect(screen.queryByText(changedDisplayCopy)).toBeNull();
  });
});

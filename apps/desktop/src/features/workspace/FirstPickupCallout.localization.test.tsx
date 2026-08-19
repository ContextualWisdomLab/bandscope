import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstPickupCallout } from "./FirstPickupCallout";

describe("FirstPickupCallout section-form localization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses Korean section-form copy instead of exposing the raw verse enum", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0]!.name = "베이스 기타";
    song.sections[0]!.roles[2]!.name = "리드 보컬";

    render(<FirstPickupCallout song={song} />);

    expect(
      screen.getByText("리드 보컬이 0:30 벌스 끝에서 베이스 기타의 넘김을 받습니다.")
    ).toBeTruthy();
    expect(screen.queryByText(/verse 끝에서/)).toBeNull();
  });

  it("localizes an explicit pickup form without changing its domain label", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    section.id = "pickup-localized";
    section.label = "pickup";
    section.timeRange = { start: 8, end: 10 };
    section.roles = [
      {
        ...section.roles[2]!,
        id: "lead-vocal-pickup",
        name: "리드 보컬"
      }
    ];
    section.partGraph = [
      {
        role_id: "lead-vocal-pickup",
        is_active: true,
        handoff_to: [],
        handoff_from: []
      }
    ];

    render(<FirstPickupCallout song={song} />);

    expect(screen.getByText("리드 보컬이 0:08 픽업에서 픽업합니다.")).toBeTruthy();
    expect(section.label).toBe("pickup");
    expect(screen.queryByText(/pickup에서/)).toBeNull();
  });
});

import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstIntroCallout } from "./FirstIntroCallout";

describe("FirstIntroCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending dynamic role names particle-safe", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    const intro = structuredClone(seed);
    intro.id = "intro-particle";
    intro.label = "intro";
    intro.timeRange = { start: 0, end: 8 };
    intro.roles = [{ ...seed.roles[0]!, id: "piano", name: "피아노", rehearsalPriority: "high" }];
    intro.partGraph = [
      { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }
    ];
    song.sections = [intro];

    render(<FirstIntroCallout song={song} />);

    expect(screen.getByText("0:00 인트로에서 피아노 파트가 시작합니다.")).toBeTruthy();
    expect(screen.queryByText("피아노이 0:00 인트로에서 시작합니다.")).toBeNull();
  });
});

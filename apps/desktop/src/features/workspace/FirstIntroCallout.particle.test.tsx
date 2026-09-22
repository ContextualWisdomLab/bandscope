import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstIntroCallout } from "./FirstIntroCallout";

describe("FirstIntroCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending dynamic role names particle-safe before and after the intro action", () => {
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

    const onHearIntro = vi.fn();
    render(<FirstIntroCallout song={song} actionMode="callback-only" onHearIntro={onHearIntro} />);

    expect(screen.getByText("0:00 인트로에서 피아노 파트가 시작합니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:00에 피아노 시작 듣기" }));

    expect(onHearIntro).toHaveBeenCalledWith(0);
    expect(screen.getByText("0:00에서 피아노 파트와 함께 카운트인하세요. 같이 시작하세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();
  });
});
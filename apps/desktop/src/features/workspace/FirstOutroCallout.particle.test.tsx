import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstOutroCallout } from "./FirstOutroCallout";

describe("FirstOutroCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending dynamic role names particle-safe before and after the outro action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    const outro = structuredClone(seed);
    outro.id = "outro-particle";
    outro.label = "outro";
    outro.timeRange = { start: 180, end: 196 };
    outro.roles = [{ ...seed.roles[0]!, id: "piano", name: "피아노", rehearsalPriority: "high" }];
    outro.partGraph = [
      { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }
    ];
    song.sections = [outro];

    const onHearOutro = vi.fn();
    render(<FirstOutroCallout song={song} actionMode="callback-only" onHearOutro={onHearOutro} />);

    expect(screen.getByText("3:00 아웃트로에서 피아노 파트가 끝맺습니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "3:00에 피아노 끝맺음 듣기" }));

    expect(onHearOutro).toHaveBeenCalledWith(180);
    expect(screen.getByText("3:00에서 피아노 파트와 함께 마지막 마디를 잡으세요. 같이 끝내세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();
  });
});

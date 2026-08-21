import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstVerseCallout } from "./FirstVerseCallout";

describe("FirstVerseCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending dynamic role names particle-safe", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    const verse = structuredClone(seed);
    verse.id = "verse-particle";
    verse.label = "verse";
    verse.timeRange = { start: 10, end: 30 };
    verse.roles = [{ ...seed.roles[0]!, id: "piano", name: "피아노", rehearsalPriority: "high" }];
    verse.partGraph = [
      { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }
    ];
    song.sections = [verse];

    render(<FirstVerseCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 피아노 파트가 첫 소절을 잡습니다.")).toBeTruthy();
    expect(screen.queryByText("피아노이 0:10 벌스에서 첫 소절을 잡습니다.")).toBeNull();
  });
});

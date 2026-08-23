import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstTagCallout } from "./FirstTagCallout";

describe("FirstTagCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending dynamic role names particle-safe before and after the tag action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    const tag = structuredClone(seed);
    tag.id = "tag-particle";
    tag.label = "tag";
    tag.timeRange = { start: 200, end: 208 };
    tag.roles = [{ ...seed.roles[0]!, id: "piano", name: "피아노", rehearsalPriority: "high" }];
    tag.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [tag];

    const grid = document.createElement("div");
    grid.id = "song-structure-grid";
    const target = document.createElement("div");
    target.dataset.sectionIndex = "0";
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });
    grid.appendChild(target);
    document.body.appendChild(grid);

    render(<FirstTagCallout song={song} />);

    expect(screen.getByText("3:20 태그에서 피아노 파트가 마지막 한 줄을 잡습니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "3:20 피아노 태그 위치 열기" }));

    expect(screen.getByText("3:20에서 피아노 파트와 함께 마지막 한 줄을 잡으세요. 같이 끝내세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();

    grid.remove();
  });
});

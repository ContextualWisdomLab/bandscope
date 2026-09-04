import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstBlockedCallout } from "./FirstBlockedCallout";

describe("FirstBlockedCallout Korean owner copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending owner names particle-safe before and after the blocked action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);
    section.id = "verse-blocked";
    song.sections = [section];
    song.collaboration = {
      syncMode: "local_only",
      syncNote: "Keep blocked jobs local for now.",
      assignments: [
        {
          id: "assign-keys-blocked",
          assignee: "미나",
          summary: "Wait on the in-ear mix before the verse color pass.",
          sectionId: "verse-blocked",
          roleId: "keys-right",
          status: "blocked"
        }
      ],
      comments: [],
      approvals: []
    };

    const grid = document.createElement("div");
    grid.dataset.testid = "song-structure-grid";
    grid.setAttribute("role", "region");
    grid.setAttribute("aria-label", "Scrollable song structure timeline");
    const target = document.createElement("div");
    target.dataset.sectionIndex = "0";
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });
    grid.appendChild(target);
    document.body.appendChild(grid);

    render(<FirstBlockedCallout song={song} />);

    expect(screen.getByText("미나님이 0:10 벌스에서 Keyboard 1 Right Hand 진행이 막혀 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/미나이/)).toBeNull();
    expect(screen.queryByText(/미나가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 벌스 막힘 위치 열기" }));

    expect(screen.getByText("0:10 벌스 막힘을 먼저 풀어 주세요.")).toBeTruthy();
    expect(screen.queryByText(/미나과/)).toBeNull();
    expect(screen.queryByText(/미나를/)).toBeNull();

    grid.remove();
  });
});

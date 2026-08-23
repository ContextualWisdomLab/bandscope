import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstOpenCommentCallout } from "./FirstOpenCommentCallout";

describe("FirstOpenCommentCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending dynamic role names particle-safe before and after the note action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[1]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high"
      }
    ];
    seed.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];
    song.collaboration!.comments = [
      {
        id: "comment-piano-color",
        author: "MD",
        body: "첫 패스에서는 톤을 부드럽게 유지하세요.",
        sectionId: seed.id,
        roleId: "piano",
        status: "open"
      }
    ];

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

    render(<FirstOpenCommentCallout song={song} />);

    expect(screen.getByText("MD님이 0:10 벌스에서 피아노 파트에 메모를 남겼습니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 피아노 위치 열기" }));

    expect(screen.getByText("0:10에서 피아노 파트 메모를 확인하세요. 그 파트를 보고 있으세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();

    grid.remove();
  });
});

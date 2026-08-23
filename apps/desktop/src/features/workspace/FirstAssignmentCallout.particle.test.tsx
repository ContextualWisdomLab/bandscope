import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstAssignmentCallout } from "./FirstAssignmentCallout";

describe("FirstAssignmentCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending dynamic role names particle-safe before and after the assignment action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[0]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high"
      }
    ];
    seed.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];
    song.collaboration = {
      syncMode: "local_only",
      syncNote: "Keep assignments local for now.",
      assignments: [
        {
          id: "assign-piano",
          assignee: "리듬팀",
          summary: "픽업 다음 2박에 들어가세요.",
          sectionId: seed.id,
          roleId: "piano",
          status: "in_progress"
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

    render(<FirstAssignmentCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 피아노 파트 담당은 리듬팀입니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();
    expect(screen.queryByText(/리듬팀이/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 피아노 과제 위치 열기" }));

    expect(screen.getByText("0:10에서 피아노 파트 과제를 이어서 하세요. 함께 잠그세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();
    expect(screen.queryByText(/리듬팀과/)).toBeNull();

    grid.remove();
  });
});

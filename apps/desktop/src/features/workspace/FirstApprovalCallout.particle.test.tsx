import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstApprovalCallout } from "./FirstApprovalCallout";

describe("FirstApprovalCallout Korean owner copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending owner names particle-safe before and after the approval action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    song.collaboration!.approvals[0]!.owner = "미나";

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

    render(<FirstApprovalCallout song={song} />);

    expect(screen.getByText("미나님이 0:10 벌스의 Verse harmony pass 승인을 기다리고 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/미나이/)).toBeNull();
    expect(screen.queryByText(/미나가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 벌스 승인 위치 열기" }));

    expect(screen.getByText("0:10 벌스에서 Verse harmony pass 승인을 이어서 하세요.")).toBeTruthy();
    expect(screen.queryByText(/미나과/)).toBeNull();
    expect(screen.queryByText(/미나를/)).toBeNull();

    grid.remove();
  });
});

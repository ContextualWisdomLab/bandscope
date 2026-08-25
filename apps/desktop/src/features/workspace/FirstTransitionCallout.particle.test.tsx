import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstTransitionCallout } from "./FirstTransitionCallout";

describe("FirstTransitionCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending dynamic role names particle-safe before and after the transition action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles = [
      {
        ...song.sections[0]!.roles[0]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        cue: { kind: "transition", value: "픽업 뒤에서 다운비트를 잡으세요." }
      }
    ];
    song.sections[0]!.partGraph = [
      { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }
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

    render(<FirstTransitionCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 피아노 파트가 전환을 잡습니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 피아노 전환 위치 열기" }));

    expect(screen.getByText("0:10에서 피아노 파트와 함께 전환을 잡으세요. 같이 넘기세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();

    grid.remove();
  });
});
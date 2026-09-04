import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstPartHandoffCallout } from "./FirstPartHandoffCallout";
import { createPartHandoffTransitionSong } from "./firstPartHandoff.test-fixture";

describe("FirstPartHandoffCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending dynamic role names particle-safe before and after the destination handoff action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createPartHandoffTransitionSong();
    const source = song.sections[0]!;
    const destination = song.sections[1]!;
    source.roles[0] = { ...source.roles[0]!, id: "piano", name: "피아노", rehearsalPriority: "high" };
    source.partGraph = [
      { role_id: "piano", is_active: true, handoff_to: ["vocal"], handoff_from: [] },
      { role_id: "vocal", is_active: false, handoff_to: [], handoff_from: ["piano"] }
    ];
    destination.roles[0] = { ...destination.roles[0]!, id: "vocal", name: "보컬", rehearsalPriority: "medium" };
    destination.partGraph = [
      { role_id: "piano", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    const grid = document.createElement("div");
    grid.id = "workspace-song-structure-grid";
    grid.setAttribute("role", "region");
    grid.setAttribute("aria-label", "Scrollable song structure timeline");
    const sourceTarget = document.createElement("div");
    sourceTarget.dataset.sectionIndex = "0";
    const target = document.createElement("div");
    target.dataset.sectionIndex = "1";
    Object.defineProperty(target, "scrollIntoView", { configurable: true, value: vi.fn() });
    grid.append(sourceTarget, target);
    document.body.appendChild(grid);

    render(<FirstPartHandoffCallout song={song} />);

    expect(screen.getByText("0:10 코러스에서 피아노 파트가 보컬 파트로 넘깁니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();
    expect(screen.queryByText(/피아노가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 피아노 핸드오프 위치 열기" }));

    expect(screen.getByText("0:10에서 피아노 파트에서 보컬 파트로 넘긴 다음 합주를 시작하세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();

    grid.remove();
  });
});

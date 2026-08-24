import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstEarCheckCallout } from "./FirstEarCheckCallout";

describe("FirstEarCheckCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending dynamic role names particle-safe before and after the ear-check action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[0]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        confidence: {
          level: "medium",
          source: "model",
          notes: "Top voicing may need a quick ear check."
        }
      }
    ];
    seed.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

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

    render(<FirstEarCheckCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 피아노 파트를 귀로 확인하세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();
    expect(screen.queryByText(/피아노가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 피아노 귀 확인 위치 열기" }));

    expect(screen.getByText("0:10에서 피아노 파트를 귀로 확인한 다음 합주를 시작하세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();

    grid.remove();
  });

  it("keeps the section locator after opening a band-wide ear check", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[0]!,
        confidence: {
          level: "medium",
          source: "model",
          notes: "Confirm the section by ear."
        }
      }
    ];
    seed.partGraph = [];

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

    render(<FirstEarCheckCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 아직 귀 확인이 필요합니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "0:10 첫 귀 확인 위치 열기" }));
    expect(screen.getByText("0:10 벌스에서 귀로 확인한 다음 합주를 시작하세요.")).toBeTruthy();

    grid.remove();
  });
});

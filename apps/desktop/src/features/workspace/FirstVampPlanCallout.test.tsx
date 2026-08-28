import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstVampPlanCallout } from "./FirstVampPlanCallout";

const DEMO_VAMP_PLAN =
  "Hold the two-bar verse groove until the vocal pickup; don't move until you hear city lights.";

function songWithVampPlan() {
  return createDemoRehearsalSong();
}

function appendSongStructureTarget(ariaLabel = "Scrollable song structure timeline") {
  const timeline = document.createElement("div");
  timeline.setAttribute("role", "region");
  timeline.setAttribute("aria-label", ariaLabel);
  const grid = document.createElement("div");
  grid.id = "workspace-song-structure-grid";
  const target = document.createElement("div");
  target.dataset.sectionIndex = "0";
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  grid.appendChild(target);
  timeline.appendChild(grid);
  document.body.appendChild(timeline);
  return { grid: timeline, scrollIntoView };
}

describe("FirstVampPlanCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstVampPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No vamp plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithVampPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstVampPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar vamp at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same vamp signature", () => {
    const firstSong = songWithVampPlan();
    const nextSong = songWithVampPlan();
    for (const song of [firstSong, nextSong]) {
      Object.defineProperty(song, "id", {
        configurable: true,
        enumerable: true,
        get() {
          throw new Error("hostile song id getter");
        }
      });
    }
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstVampPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar vamp at 0:10" }));
    expect(
      screen.getByText(/Lock that vamp on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstVampPlanCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar still has a vamp plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that vamp on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithVampPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstVampPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar vamp at 0:10" }));
    expect(
      screen.getByText(/Lock that vamp on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstVampPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Lock that vamp on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar still has a vamp plan in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's vamp plan under the named holding part", () => {
    const song = songWithVampPlan();
    song.sections[0]!.roles[0]!.vampPlan = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[2]!.vampPlan = "Leave the vocal on the last lyric while the vamp holds.";
    song.sections[0]!.roles[2]!.vampPlanSource = "user";
    song.sections[0]!.roles[2]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.vampPlan =
      "Keep the right-hand figure under the vocal so the vamp still reads.";
    song.sections[0]!.roles[1]!.vampPlanSource = "user";

    render(<FirstVampPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand still has a vamp plan in the verse at 0:10.")
    ).toBeTruthy();
    expect(
      screen.getByText("Keep the right-hand figure under the vocal so the vamp still reads.")
    ).toBeTruthy();
    expect(screen.queryByText("Leave the vocal on the last lyric while the vamp holds.")).toBeNull();
    expect(screen.queryByText(DEMO_VAMP_PLAN)).toBeNull();
  });

  it("preserves user-authored text that resembles the generated vamp shape", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithVampPlan();
    song.sections[0]!.roles[0]!.vampPlan =
      "Keep this part going until Lead Vocal enters in the next section.";
    song.sections[0]!.roles[0]!.vampPlanSource = "user";

    render(<FirstVampPlanCallout song={song} />);

    expect(
      screen.getByText("Keep this part going until Lead Vocal enters in the next section.")
    ).toBeTruthy();
    expect(
      screen.queryByText("다음 섹션에서 Lead Vocal 파트가 들어올 때까지 이 파트를 유지하세요.")
    ).toBeNull();
  });

  it("names the first vamp plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstVampPlanCallout song={songWithVampPlan()} />);

    expect(screen.getByText(DEMO_VAMP_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar vamp at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that vamp on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstVampPlanCallout song={songWithVampPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar vamp at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that vamp on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstVampPlanCallout song={songWithVampPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar vamp at 0:10" }));

    expect(screen.getByText("Bass Guitar still has a vamp plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that vamp on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithVampPlan();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstVampPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar vamp at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("fails closed when one workspace owns more than one song-structure renderer", () => {
    const firstScroll = vi.fn();
    const secondScroll = vi.fn();
    const { container } = render(
      <div>
        <FirstVampPlanCallout song={songWithVampPlan()} />
        <div id="workspace-song-structure-grid">
          <div data-section-index="0" />
        </div>
        <div id="workspace-song-structure-grid">
          <div data-section-index="0" />
        </div>
      </div>
    );
    const targets = container.querySelectorAll<HTMLElement>('[data-section-index="0"]');
    Object.defineProperty(targets[0], "scrollIntoView", {
      configurable: true,
      value: firstScroll
    });
    Object.defineProperty(targets[1], "scrollIntoView", {
      configurable: true,
      value: secondScroll
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar vamp at 0:10" }));

    expect(firstScroll).not.toHaveBeenCalled();
    expect(secondScroll).not.toHaveBeenCalled();
    expect(screen.getByText("Bass Guitar still has a vamp plan in the verse at 0:10.")).toBeTruthy();
  });

  it("fails closed when more than one song-structure renderer is mounted globally", () => {
    const first = appendSongStructureTarget();
    const second = appendSongStructureTarget();

    render(<FirstVampPlanCallout song={songWithVampPlan()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar vamp at 0:10" }));

    expect(first.scrollIntoView).not.toHaveBeenCalled();
    expect(second.scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByText("Bass Guitar still has a vamp plan in the verse at 0:10.")).toBeTruthy();

    first.grid.remove();
    second.grid.remove();
  });
});

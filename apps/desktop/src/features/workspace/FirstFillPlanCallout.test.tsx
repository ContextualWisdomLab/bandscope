import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstFillPlanCallout } from "./FirstFillPlanCallout";

const DEMO_FILL_PLAN =
  "Walk eight notes into the chorus downbeat; leave the vocal pickup empty.";

function songWithFillPlan() {
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

describe("FirstFillPlanCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstFillPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No fill plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithFillPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstFillPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar fill at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same fill signature", () => {
    const firstSong = songWithFillPlan();
    const nextSong = songWithFillPlan();
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
    const { rerender } = render(<FirstFillPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar fill at 0:10" }));
    expect(
      screen.getByText(/Lock that fill on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstFillPlanCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar still has a fill plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that fill on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithFillPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstFillPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar fill at 0:10" }));
    expect(
      screen.getByText(/Lock that fill on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstFillPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Lock that fill on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar still has a fill plan in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's fill plan under the named holding part", () => {
    const song = songWithFillPlan();
    song.sections[0]!.roles[0]!.fillPlan = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.fillPlan =
      "Tune the patch a half step down so the chorus still sits under the vocal.";
    song.sections[0]!.roles[2]!.fillPlan = "Keep concert pitch even if the band drops the last chorus.";

    render(<FirstFillPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand still has a fill plan in the verse at 0:10.")
    ).toBeTruthy();
    expect(
      screen.getByText("Tune the patch a half step down so the chorus still sits under the vocal.")
    ).toBeTruthy();
    expect(screen.queryByText("Keep concert pitch even if the band drops the last chorus.")).toBeNull();
    expect(screen.queryByText(DEMO_FILL_PLAN)).toBeNull();
  });

  it("names the first fill plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstFillPlanCallout song={songWithFillPlan()} />);

    expect(screen.getByText(DEMO_FILL_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar fill at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that fill on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstFillPlanCallout song={songWithFillPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar fill at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that fill on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstFillPlanCallout song={songWithFillPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar fill at 0:10" }));

    expect(screen.getByText("Bass Guitar still has a fill plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that fill on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithFillPlan();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstFillPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar fill at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("scopes map navigation to the song-structure renderer when another surface reuses an index", () => {
    const decoy = document.createElement("div");
    decoy.dataset.sectionIndex = "0";
    const decoyScrollIntoView = vi.fn();
    Object.defineProperty(decoy, "scrollIntoView", {
      configurable: true,
      value: decoyScrollIntoView
    });
    document.body.appendChild(decoy);
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstFillPlanCallout song={songWithFillPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar fill at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first fill plan changes or returns later", () => {
    const initialSong = songWithFillPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstFillPlanCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar fill at 0:10" }));
    expect(
      screen.getByText(/Lock that fill on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    const nextSong = songWithFillPlan();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstFillPlanCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar still has a fill plan in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable fill plan guidance-only", () => {
    const song = songWithFillPlan();
    for (const role of song.sections[0]!.roles) {
      role.fillPlan = "";
    }
    render(<FirstFillPlanCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByRole("complementary", { name: "Tonight's first fill plan" })
    ).toBeTruthy();
    expect(
      screen.getByText("No fill plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("localizes the fill-plan form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithFillPlan();
    song.sections[0]!.roles[0]!.name = "베이스";

    render(<FirstFillPlanCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 파트의 필인 계획이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned fill plan as a text node instead of template syntax", () => {
    const song = songWithFillPlan();
    song.sections[0]!.roles[1]!.fillPlan = "";
    song.sections[0]!.roles[2]!.fillPlan = "";
    song.sections[0]!.roles[0]!.fillPlan = "Check {role} at {at}";
    render(<FirstFillPlanCallout song={song} />);
    expect(screen.getByText("Check {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Check Bass Guitar at 0:10")).toBeNull();
  });
});

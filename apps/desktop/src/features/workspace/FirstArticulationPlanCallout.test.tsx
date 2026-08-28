import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstArticulationPlanCallout } from "./FirstArticulationPlanCallout";

const DEMO_ARTICULATION_PLAN =
  "Keep the verse attack short so the chorus still has a longer sustain to land on.";

function songWithArticulationPlan() {
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

describe("FirstArticulationPlanCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstArticulationPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No articulation plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithArticulationPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstArticulationPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar articulation at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same articulation signature", () => {
    const firstSong = songWithArticulationPlan();
    const nextSong = songWithArticulationPlan();
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
    const { rerender } = render(<FirstArticulationPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar articulation at 0:10" }));
    expect(
      screen.getByText(/Lock that articulation on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstArticulationPlanCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar still has an articulation plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that articulation on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithArticulationPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstArticulationPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar articulation at 0:10" }));
    expect(
      screen.getByText(/Lock that articulation on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstArticulationPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Lock that articulation on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar still has an articulation plan in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's articulation plan under the named holding part", () => {
    const song = songWithArticulationPlan();
    song.sections[0]!.roles[0]!.articulationPlan = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.articulationPlan =
      "Tune the patch a half step down so the chorus still sits under the vocal.";
    song.sections[0]!.roles[2]!.articulationPlan = "Keep concert pitch even if the band drops the last chorus.";

    render(<FirstArticulationPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand still has an articulation plan in the verse at 0:10.")
    ).toBeTruthy();
    expect(
      screen.getByText("Tune the patch a half step down so the chorus still sits under the vocal.")
    ).toBeTruthy();
    expect(screen.queryByText("Keep concert pitch even if the band drops the last chorus.")).toBeNull();
    expect(screen.queryByText(DEMO_ARTICULATION_PLAN)).toBeNull();
  });

  it("names the first articulation plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstArticulationPlanCallout song={songWithArticulationPlan()} />);

    expect(screen.getByText(DEMO_ARTICULATION_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar articulation at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that articulation on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstArticulationPlanCallout song={songWithArticulationPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar articulation at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that articulation on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstArticulationPlanCallout song={songWithArticulationPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar articulation at 0:10" }));

    expect(screen.getByText("Bass Guitar still has an articulation plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that articulation on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithArticulationPlan();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstArticulationPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar articulation at 0:10" }));
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

    render(<FirstArticulationPlanCallout song={songWithArticulationPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar articulation at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first articulation plan changes or returns later", () => {
    const initialSong = songWithArticulationPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstArticulationPlanCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar articulation at 0:10" }));
    expect(
      screen.getByText(/Lock that articulation on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    const nextSong = songWithArticulationPlan();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstArticulationPlanCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar still has an articulation plan in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable articulation plan guidance-only", () => {
    const song = songWithArticulationPlan();
    for (const role of song.sections[0]!.roles) {
      role.articulationPlan = "";
    }
    render(<FirstArticulationPlanCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByRole("complementary", { name: "Tonight's first articulation plan" })
    ).toBeTruthy();
    expect(
      screen.getByText("No articulation plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("localizes the articulation-plan form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithArticulationPlan();
    song.sections[0]!.roles[0]!.name = "베이스";

    render(<FirstArticulationPlanCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 파트의 아티큘레이션 계획이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned articulation plan as a text node instead of template syntax", () => {
    const song = songWithArticulationPlan();
    song.sections[0]!.roles[1]!.articulationPlan = "";
    song.sections[0]!.roles[2]!.articulationPlan = "";
    song.sections[0]!.roles[0]!.articulationPlan = "Check {role} at {at}";
    render(<FirstArticulationPlanCallout song={song} />);
    expect(screen.getByText("Check {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Check Bass Guitar at 0:10")).toBeNull();
  });
});

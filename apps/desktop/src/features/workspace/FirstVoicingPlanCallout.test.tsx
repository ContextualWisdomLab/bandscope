import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstVoicingPlanCallout } from "./FirstVoicingPlanCallout";

const DEMO_VOICING_PLAN =
  "Keep the verse voicing in first inversion so the top line still sings over the guitars.";

function songWithVoicingPlan() {
  return createDemoRehearsalSong();
}

function appendSongStructureTarget(ariaLabel = "Scrollable song structure timeline") {
  const timeline = document.createElement("div");
  timeline.setAttribute("role", "region");
  timeline.setAttribute("aria-label", ariaLabel);
  const grid = document.createElement("div");
  grid.dataset.testid = "song-structure-grid";
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

describe("FirstVoicingPlanCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstVoicingPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No voicing plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithVoicingPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstVoicingPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand voicing at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same voicing signature", () => {
    const firstSong = songWithVoicingPlan();
    const nextSong = songWithVoicingPlan();
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
    const { rerender } = render(<FirstVoicingPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand voicing at 0:10" }));
    expect(
      screen.getByText(/Lock that voicing on Keyboard 1 Right Hand at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstVoicingPlanCallout song={nextSong} />);

    expect(screen.getByText("Keyboard 1 Right Hand still has a voicing plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that voicing on Keyboard 1 Right Hand at 0:10 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithVoicingPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstVoicingPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand voicing at 0:10" }));
    expect(
      screen.getByText(/Lock that voicing on Keyboard 1 Right Hand at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstVoicingPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Lock that voicing on Keyboard 1 Right Hand at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Keyboard 1 Right Hand still has a voicing plan in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's voicing plan under the named holding part", () => {
    const song = songWithVoicingPlan();
    song.sections[0]!.roles[1]!.voicingPlan = "";
    song.sections[0]!.roles[1]!.rehearsalPriority = "low";
    song.sections[0]!.roles[0]!.voicingPlan =
      "Stay on roots under the vocal so the chorus still has space for the fifth.";
    song.sections[0]!.roles[2]!.voicingPlan = "Keep concert pitch even if the band drops the last chorus.";

    render(<FirstVoicingPlanCallout song={song} />);

    expect(
      screen.getByText("Bass Guitar still has a voicing plan in the verse at 0:10.")
    ).toBeTruthy();
    expect(
      screen.getByText("Stay on roots under the vocal so the chorus still has space for the fifth.")
    ).toBeTruthy();
    expect(screen.queryByText("Keep concert pitch even if the band drops the last chorus.")).toBeNull();
    expect(screen.queryByText(DEMO_VOICING_PLAN)).toBeNull();
  });

  it("names the first voicing plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstVoicingPlanCallout song={songWithVoicingPlan()} />);

    expect(screen.getByText(DEMO_VOICING_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Keyboard 1 Right Hand voicing at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that voicing on Keyboard 1 Right Hand at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstVoicingPlanCallout song={songWithVoicingPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand voicing at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that voicing on Keyboard 1 Right Hand at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstVoicingPlanCallout song={songWithVoicingPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand voicing at 0:10" }));

    expect(screen.getByText("Keyboard 1 Right Hand still has a voicing plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that voicing on Keyboard 1 Right Hand at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithVoicingPlan();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstVoicingPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand voicing at 0:10" }));
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

    render(<FirstVoicingPlanCallout song={songWithVoicingPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand voicing at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first voicing plan changes or returns later", () => {
    const initialSong = songWithVoicingPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstVoicingPlanCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand voicing at 0:10" }));
    expect(
      screen.getByText(/Lock that voicing on Keyboard 1 Right Hand at 0:10 before the room starts./)
    ).toBeTruthy();

    const nextSong = songWithVoicingPlan();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstVoicingPlanCallout song={nextSong} />);
    expect(screen.getByText("Keyboard 1 Right Hand still has a voicing plan in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable voicing plan guidance-only", () => {
    const song = songWithVoicingPlan();
    for (const role of song.sections[0]!.roles) {
      role.voicingPlan = "";
    }
    render(<FirstVoicingPlanCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByRole("complementary", { name: "Tonight's first voicing plan" })
    ).toBeTruthy();
    expect(
      screen.getByText("No voicing plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("localizes the voicing-plan form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithVoicingPlan();
    song.sections[0]!.roles[1]!.name = "키보드";

    render(<FirstVoicingPlanCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 키보드 파트의 보이싱 계획이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned voicing plan as a text node instead of template syntax", () => {
    const song = songWithVoicingPlan();
    song.sections[0]!.roles[0]!.voicingPlan = undefined;
    song.sections[0]!.roles[2]!.voicingPlan = undefined;
    song.sections[0]!.roles[1]!.voicingPlan = "Check {role} at {at}";
    render(<FirstVoicingPlanCallout song={song} />);
    expect(screen.getByText("Check {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Check Keyboard 1 Right Hand at 0:10")).toBeNull();
  });
});

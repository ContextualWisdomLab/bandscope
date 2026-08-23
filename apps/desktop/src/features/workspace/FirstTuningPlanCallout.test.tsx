import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstTuningPlanCallout } from "./FirstTuningPlanCallout";

const DEMO_TUNING_PLAN =
  "Tune the E string down to D so the verse riff sits on the open fifth.";

function songWithTuningPlan() {
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

describe("FirstTuningPlanCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstTuningPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText(
        "Nothing still has a tuning plan. Stay on tonight's map until a part owns rehearsal-facing tuning copy."
      )
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithTuningPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstTuningPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar tuning at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same tuning signature", () => {
    const firstSong = songWithTuningPlan();
    const nextSong = songWithTuningPlan();
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
    const { rerender } = render(<FirstTuningPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar tuning at 0:10" }));
    expect(
      screen.getByText(/Lock that tuning on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstTuningPlanCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar still has a tuning plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that tuning on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithTuningPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstTuningPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar tuning at 0:10" }));
    expect(
      screen.getByText(/Lock that tuning on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstTuningPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Lock that tuning on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar still has a tuning plan in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's tuning plan under the named holding part", () => {
    const song = songWithTuningPlan();
    song.sections[0]!.roles[0]!.tuningPlan = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.tuningPlan = "Tune the patch a half step down so the chorus still sits under the vocal.";
    song.sections[0]!.roles[2]!.tuningPlan = "Keep concert pitch even if the band drops the last chorus.";

    render(<FirstTuningPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand still has a tuning plan in the verse at 0:10.")
    ).toBeTruthy();
    expect(screen.getByText("Tune the patch a half step down so the chorus still sits under the vocal.")).toBeTruthy();
    expect(screen.queryByText("Keep concert pitch even if the band drops the last chorus.")).toBeNull();
    expect(screen.queryByText(DEMO_TUNING_PLAN)).toBeNull();
  });

  it("names the first tuning plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstTuningPlanCallout song={songWithTuningPlan()} />);

    expect(screen.getByText(DEMO_TUNING_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar tuning at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that tuning on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstTuningPlanCallout song={songWithTuningPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar tuning at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that tuning on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstTuningPlanCallout song={songWithTuningPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar tuning at 0:10" }));

    expect(screen.getByText("Bass Guitar still has a tuning plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that tuning on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithTuningPlan();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstTuningPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar tuning at 0:10" }));
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

    render(<FirstTuningPlanCallout song={songWithTuningPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar tuning at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first tuning plan changes or returns later", () => {
    const initialSong = songWithTuningPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstTuningPlanCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar tuning at 0:10" }));
    expect(
      screen.getByText(/Lock that tuning on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    const nextSong = songWithTuningPlan();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstTuningPlanCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar still has a tuning plan in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable tuning plan guidance-only", () => {
    const song = songWithTuningPlan();
    for (const role of song.sections[0]!.roles) {
      role.tuningPlan = "";
    }
    render(<FirstTuningPlanCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByRole("complementary", { name: "Tonight's first tuning plan" })
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Nothing still has a tuning plan. Stay on tonight's map until a part owns rehearsal-facing tuning copy."
      )
    ).toBeTruthy();
  });

  it("localizes the tuning-plan form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithTuningPlan();
    song.sections[0]!.roles[0]!.name = "베이스";

    render(<FirstTuningPlanCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 파트의 튜닝 계획이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned tuning plan as a text node instead of template syntax", () => {
    const song = songWithTuningPlan();
    song.sections[0]!.roles[1]!.tuningPlan = "";
    song.sections[0]!.roles[2]!.tuningPlan = "";
    song.sections[0]!.roles[0]!.tuningPlan = "Check {role} at {at}";
    render(<FirstTuningPlanCallout song={song} />);
    expect(screen.getByText("Check {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Check Bass Guitar at 0:10")).toBeNull();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstDynamicsPlanCallout } from "./FirstDynamicsPlanCallout";

const DEMO_DYNAMICS_PLAN =
  "Keep the verse under the vocal so the chorus still has somewhere to lift.";

function songWithDynamicsPlan() {
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

describe("FirstDynamicsPlanCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstDynamicsPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText(
        "Nothing still has a dynamics plan. Stay on tonight's map until a part owns rehearsal-facing dynamics copy."
      )
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithDynamicsPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstDynamicsPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar dynamics at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same dynamics signature", () => {
    const firstSong = songWithDynamicsPlan();
    const nextSong = songWithDynamicsPlan();
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
    const { rerender } = render(<FirstDynamicsPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar dynamics at 0:10" }));
    expect(
      screen.getByText(/Lock that dynamics on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstDynamicsPlanCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar still has a dynamics plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that dynamics on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithDynamicsPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstDynamicsPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar dynamics at 0:10" }));
    expect(
      screen.getByText(/Lock that dynamics on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstDynamicsPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Lock that dynamics on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar still has a dynamics plan in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's dynamics plan under the named holding part", () => {
    const song = songWithDynamicsPlan();
    song.sections[0]!.roles[0]!.dynamicsPlan = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.dynamicsPlan =
      "Tune the patch a half step down so the chorus still sits under the vocal.";
    song.sections[0]!.roles[2]!.dynamicsPlan = "Keep concert pitch even if the band drops the last chorus.";

    render(<FirstDynamicsPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand still has a dynamics plan in the verse at 0:10.")
    ).toBeTruthy();
    expect(
      screen.getByText("Tune the patch a half step down so the chorus still sits under the vocal.")
    ).toBeTruthy();
    expect(screen.queryByText("Keep concert pitch even if the band drops the last chorus.")).toBeNull();
    expect(screen.queryByText(DEMO_DYNAMICS_PLAN)).toBeNull();
  });

  it("names the first dynamics plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstDynamicsPlanCallout song={songWithDynamicsPlan()} />);

    expect(screen.getByText(DEMO_DYNAMICS_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar dynamics at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that dynamics on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstDynamicsPlanCallout song={songWithDynamicsPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar dynamics at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that dynamics on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstDynamicsPlanCallout song={songWithDynamicsPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar dynamics at 0:10" }));

    expect(screen.getByText("Bass Guitar still has a dynamics plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that dynamics on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithDynamicsPlan();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstDynamicsPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar dynamics at 0:10" }));
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

    render(<FirstDynamicsPlanCallout song={songWithDynamicsPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar dynamics at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first dynamics plan changes or returns later", () => {
    const initialSong = songWithDynamicsPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstDynamicsPlanCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar dynamics at 0:10" }));
    expect(
      screen.getByText(/Lock that dynamics on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    const nextSong = songWithDynamicsPlan();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstDynamicsPlanCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar still has a dynamics plan in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable dynamics plan guidance-only", () => {
    const song = songWithDynamicsPlan();
    for (const role of song.sections[0]!.roles) {
      role.dynamicsPlan = "";
    }
    render(<FirstDynamicsPlanCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByRole("complementary", { name: "Tonight's first dynamics plan" })
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Nothing still has a dynamics plan. Stay on tonight's map until a part owns rehearsal-facing dynamics copy."
      )
    ).toBeTruthy();
  });

  it("localizes the dynamics-plan form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithDynamicsPlan();
    song.sections[0]!.roles[0]!.name = "베이스";

    render(<FirstDynamicsPlanCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 파트의 다이내믹 계획이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned dynamics plan as a text node instead of template syntax", () => {
    const song = songWithDynamicsPlan();
    song.sections[0]!.roles[1]!.dynamicsPlan = "";
    song.sections[0]!.roles[2]!.dynamicsPlan = "";
    song.sections[0]!.roles[0]!.dynamicsPlan = "Check {role} at {at}";
    render(<FirstDynamicsPlanCallout song={song} />);
    expect(screen.getByText("Check {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Check Bass Guitar at 0:10")).toBeNull();
  });
});

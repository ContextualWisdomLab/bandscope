import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstIntroCallout } from "./FirstIntroCallout";

function songWithIntro() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const intro = structuredClone(verse);
  intro.id = "intro-1";
  intro.label = "intro";
  intro.timeRange = { start: 0, end: 8 };
  intro.roles = [
    {
      ...verse.roles[0]!,
      id: "drums",
      name: "Drums",
      rehearsalPriority: "high"
    }
  ];
  intro.partGraph = [
    {
      role_id: "drums",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [intro, verse];
  return song;
}

function appendSongStructureTarget() {
  const grid = document.createElement("div");
  grid.dataset.testid = "song-structure-grid";
  const target = document.createElement("div");
  const second = document.createElement("div");
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  grid.appendChild(target);
  grid.appendChild(second);
  document.body.appendChild(grid);
  return { grid, scrollIntoView };
}

describe("FirstIntroCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstIntroCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No intro yet. Stay on tonight's map until the start is labeled.")
    ).toBeTruthy();
  });

  it("contains a throwing own sections accessor instead of crashing the callout", () => {
    const song = songWithIntro();
    Object.defineProperty(song, "sections", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("sections getter must stay data");
      }
    });

    expect(() => render(<FirstIntroCallout song={song} />)).not.toThrow();
    expect(
      screen.getByText("No intro yet. Stay on tonight's map until the start is labeled.")
    ).toBeTruthy();
  });

  it("contains a song Proxy that throws on sections access instead of crashing the callout", () => {
    const song = songWithIntro();
    const proxiedSong = new Proxy(song, {
      get(target, key, receiver) {
        if (key === "sections") {
          throw new Error("sections get trap");
        }
        return Reflect.get(target, key, receiver);
      }
    });

    // Descriptor-based reads forward past get traps by design, so the intro still
    // resolves safely instead of the render crashing on a direct sections read.
    expect(() => render(<FirstIntroCallout song={proxiedSong} />)).not.toThrow();
    expect(screen.getByLabelText("Tonight's first intro")).toBeTruthy();
    expect(screen.queryByText(/No intro yet/i)).toBeNull();
  });

  it("names the first intro as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstIntroCallout song={songWithIntro()} />);

    const action = screen.getByRole("button", {
      name: "Open Drums intro at 0:00"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Count in with Drums at 0:00. Start together./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstIntroCallout song={songWithIntro()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Drums intro at 0:00" }));

    expect(screen.getByText("Drums starts the intro at 0:00.")).toBeTruthy();
    expect(screen.queryByText(/Count in with Drums at 0:00. Start together./)).toBeNull();
  });

  it("keeps workspace-scroll authoritative even when a playback callback is also supplied", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();
    const onHearIntro = vi.fn();

    render(
      <FirstIntroCallout song={songWithIntro()} actionMode="workspace-scroll" onHearIntro={onHearIntro} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Drums intro at 0:00" }));
    expect(onHearIntro).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithIntro();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstIntroCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Drums intro at 0:00" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("shows fresh guidance when the first intro changes or returns later", () => {
    const initialSong = songWithIntro();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstIntroCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Drums intro at 0:00" }));
    expect(screen.getByText(/Count in with Drums at 0:00. Start together./)).toBeTruthy();

    const nextSong = songWithIntro();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 4, end: 12 };
    rerender(<FirstIntroCallout song={nextSong} />);
    expect(screen.getByText("Drums starts the intro at 0:04.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable intro guidance-only", () => {
    render(<FirstIntroCallout song={createDemoRehearsalSong()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No intro yet. Stay on tonight's map until the start is labeled.")
    ).toBeTruthy();
  });

  it("names a band-wide start when no part holds the intro", () => {
    const song = songWithIntro();
    song.sections[0]!.partGraph[0]!.is_active = false;
    render(<FirstIntroCallout song={song} />);
    expect(screen.getByRole("button", { name: "Open the first intro at 0:00" })).toBeTruthy();
    expect(screen.getByText("The band starts the intro at 0:00.")).toBeTruthy();
  });

  it("renders Hear only in callback-only mode when a seek callback exists", () => {
    const onHearIntro = vi.fn();
    render(<FirstIntroCallout song={songWithIntro()} actionMode="callback-only" onHearIntro={onHearIntro} />);
    fireEvent.click(screen.getByRole("button", { name: "Hear Drums start at 0:00" }));
    expect(onHearIntro).toHaveBeenCalledWith(0);
  });

  it("hides the Hear action in callback-only mode without a seek callback", () => {
    render(<FirstIntroCallout song={songWithIntro()} actionMode="callback-only" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Drums starts the intro at 0:00.")).toBeTruthy();
  });

  it("localizes the intro form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithIntro();
    song.sections[0]!.roles[0]!.name = "드럼";

    render(<FirstIntroCallout song={song} />);

    expect(screen.getByText("0:00 인트로에서 드럼 파트가 시작합니다.")).toBeTruthy();
    expect(screen.queryByText(/intro에서/)).toBeNull();
  });
});

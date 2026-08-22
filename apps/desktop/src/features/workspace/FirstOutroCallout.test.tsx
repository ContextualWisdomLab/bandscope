import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstOutroCallout } from "./FirstOutroCallout";

function songWithOutro() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const outro = structuredClone(verse);
  outro.id = "outro-1";
  outro.label = "outro";
  outro.timeRange = { start: 180, end: 196 };
  outro.roles = [
    {
      ...verse.roles[0]!,
      id: "drums",
      name: "Drums",
      rehearsalPriority: "high"
    }
  ];
  outro.partGraph = [
    {
      role_id: "drums",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, outro];
  return song;
}

function appendSongStructureTarget() {
  const grid = document.createElement("div");
  grid.dataset.testid = "song-structure-grid";
  const first = document.createElement("div");
  const target = document.createElement("div");
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  grid.appendChild(first);
  grid.appendChild(target);
  document.body.appendChild(grid);
  return { grid, scrollIntoView };
}

describe("FirstOutroCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstOutroCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No outro yet. Stay on tonight's map until the ending is labeled.")
    ).toBeTruthy();
  });

  it("names the first outro as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstOutroCallout song={songWithOutro()} />);

    const action = screen.getByRole("button", {
      name: "Open Drums outro at 3:00"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Hold with Drums at 3:00. Finish together./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstOutroCallout song={songWithOutro()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Drums outro at 3:00" }));

    expect(screen.getByText("Drums holds the outro at 3:00.")).toBeTruthy();
    expect(screen.queryByText(/Hold with Drums at 3:00. Finish together./)).toBeNull();
  });

  it("keeps workspace-scroll authoritative even when a playback callback is also supplied", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();
    const onHearOutro = vi.fn();

    render(
      <FirstOutroCallout song={songWithOutro()} actionMode="workspace-scroll" onHearOutro={onHearOutro} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Drums outro at 3:00" }));
    expect(onHearOutro).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithOutro();
    song.sections[1]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstOutroCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Drums outro at 3:00" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("shows fresh guidance when the first outro changes or returns later", () => {
    const initialSong = songWithOutro();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstOutroCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Drums outro at 3:00" }));
    expect(screen.getByText(/Hold with Drums at 3:00. Finish together./)).toBeTruthy();

    const nextSong = songWithOutro();
    nextSong.id = "next-song";
    nextSong.sections[1]!.timeRange = { start: 200, end: 216 };
    rerender(<FirstOutroCallout song={nextSong} />);
    expect(screen.getByText("Drums holds the outro at 3:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable outro guidance-only", () => {
    render(<FirstOutroCallout song={createDemoRehearsalSong()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No outro yet. Stay on tonight's map until the ending is labeled.")
    ).toBeTruthy();
  });

  it("names a band-wide landing when no part holds the outro", () => {
    const song = songWithOutro();
    song.sections[1]!.partGraph[0]!.is_active = false;
    render(<FirstOutroCallout song={song} />);
    expect(screen.getByRole("button", { name: "Open the first outro at 3:00" })).toBeTruthy();
    expect(screen.getByText("The band lands the outro at 3:00.")).toBeTruthy();
  });

  it("renders Hear only in callback-only mode when a seek callback exists", () => {
    const onHearOutro = vi.fn();
    render(<FirstOutroCallout song={songWithOutro()} actionMode="callback-only" onHearOutro={onHearOutro} />);
    fireEvent.click(screen.getByRole("button", { name: "Hear Drums land at 3:00" }));
    expect(onHearOutro).toHaveBeenCalledWith(180);
  });

  it("hides the Hear action in callback-only mode without a seek callback", () => {
    render(<FirstOutroCallout song={songWithOutro()} actionMode="callback-only" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Drums holds the outro at 3:00.")).toBeTruthy();
  });

  it("localizes the outro form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithOutro();
    song.sections[1]!.roles[0]!.name = "드럼";

    render(<FirstOutroCallout song={song} />);

    expect(screen.getByText("3:00 아웃트로에서 드럼 파트가 끝맺습니다.")).toBeTruthy();
    expect(screen.queryByText(/outro에서/)).toBeNull();
  });
});

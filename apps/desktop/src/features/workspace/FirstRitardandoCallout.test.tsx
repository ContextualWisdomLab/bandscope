import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstRitardandoCallout } from "./FirstRitardandoCallout";

const DEMO_RITARDANDO_PLAN =
  "Ease this part from 120 BPM into 80 BPM; let the next downbeat land later.";
const appendedSongStructureTargets = new Set<HTMLElement>();

function songWithRitardandoPlan() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  verse.partGraph = verse.partGraph.map((node) => ({ ...node, is_active: true }));
  const vocal = verse.roles.find((role) => role.id === "lead-vocal")!;
  vocal.ritardandoPlan = DEMO_RITARDANDO_PLAN;
  vocal.ritardandoPlanSource = "model";
  return song;
}

function appendSongStructureTarget() {
  const timeline = document.createElement("div");
  timeline.setAttribute("role", "region");
  timeline.setAttribute("aria-label", "Scrollable song structure timeline");
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
  appendedSongStructureTargets.add(timeline);
  return { grid: timeline, scrollIntoView };
}

describe("FirstRitardandoCallout", () => {
  afterEach(() => {
    for (const timeline of appendedSongStructureTargets) {
      timeline.remove();
    }
    appendedSongStructureTargets.clear();
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstRitardandoCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText(
        "No ritardando plan is available. Stay on tonight's map for the next rehearsal cue."
      )
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithRitardandoPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstRitardandoCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Lead Vocal rit at 0:10" })).toBeTruthy();
  });

  it("contains a hostile song identity descriptor lookup instead of crashing the callout", () => {
    const song = new Proxy(songWithRitardandoPlan(), {
      getOwnPropertyDescriptor() {
        throw new Error("hostile song id descriptor");
      }
    });

    expect(() => render(<FirstRitardandoCallout song={song} />)).not.toThrow();
    expect(
      screen.getByText(
        "No ritardando plan is available. Stay on tonight's map for the next rehearsal cue."
      )
    ).toBeTruthy();
  });

  it("opens the named rit on the rendered map", () => {
    const { scrollIntoView } = appendSongStructureTarget();
    render(<FirstRitardandoCallout song={songWithRitardandoPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal rit at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Ease Lead Vocal together at 0:10 so the slower landing is audible./)
    ).toBeTruthy();
    expect(screen.getByText(DEMO_RITARDANDO_PLAN)).toBeTruthy();
  });

  it("reports when the map section cannot be opened", () => {
    render(<FirstRitardandoCallout song={songWithRitardandoPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal rit at 0:10" }));

    expect(
      screen.getByText("Could not open this rit on the song map. Use the map below to find the section.")
    ).toBeTruthy();
  });

  it("uses immediate scrolling when reduced motion is requested", () => {
    const { scrollIntoView } = appendSongStructureTarget();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
    render(<FirstRitardandoCallout song={songWithRitardandoPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal rit at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
  });

  it("resets armed guidance when accessor-id songs change with the same rit signature", () => {
    const firstSong = songWithRitardandoPlan();
    const nextSong = songWithRitardandoPlan();
    for (const song of [firstSong, nextSong]) {
      Object.defineProperty(song, "id", {
        configurable: true,
        enumerable: true,
        get() {
          throw new Error("hostile song id getter");
        }
      });
    }
    appendSongStructureTarget();
    const { rerender } = render(<FirstRitardandoCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal rit at 0:10" }));
    expect(
      screen.getByText(/Ease Lead Vocal together at 0:10 so the slower landing is audible./)
    ).toBeTruthy();

    rerender(<FirstRitardandoCallout song={nextSong} />);

    expect(screen.getByText("Lead Vocal eases the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Ease Lead Vocal together at 0:10 so the slower landing is audible./)
    ).toBeNull();
  });

  it("resets armed guidance when the landing role name changes in the same workspace", () => {
    const firstSong = songWithRitardandoPlan();
    const nextSong = structuredClone(firstSong);
    nextSong.sections[0]!.roles.find((role) => role.id === "lead-vocal")!.name = "Lead Singer";
    const workspaceInstanceKey = {};
    appendSongStructureTarget();
    const { rerender } = render(
      <FirstRitardandoCallout song={firstSong} workspaceInstanceKey={workspaceInstanceKey} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal rit at 0:10" }));
    expect(
      screen.getByText(/Ease Lead Vocal together at 0:10 so the slower landing is audible./)
    ).toBeTruthy();

    rerender(
      <FirstRitardandoCallout song={nextSong} workspaceInstanceKey={workspaceInstanceKey} />
    );

    expect(screen.getByText("Lead Singer eases the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Ease Lead Singer together at 0:10 so the slower landing is audible./)
    ).toBeNull();
  });
});

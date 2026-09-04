import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstFermataCallout } from "./FirstFermataCallout";

const DEMO_FERMATA_PLAN =
  "Hold this part through the extra 1 s; wait for the cutoff before the next entrance.";
const appendedSongStructureTargets = new Set<HTMLElement>();

function songWithFermataPlan() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  verse.partGraph = verse.partGraph.map((node) => ({ ...node, is_active: true }));
  const vocal = verse.roles.find((role) => role.id === "lead-vocal")!;
  vocal.fermataPlan = DEMO_FERMATA_PLAN;
  vocal.fermataPlanSource = "model";
  vocal.fermataPlanAtSeconds = 11.25;
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

describe("FirstFermataCallout", () => {
  afterEach(() => {
    for (const timeline of appendedSongStructureTargets) {
      timeline.remove();
    }
    appendedSongStructureTargets.clear();
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstFermataCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText(
        "No fermata plan is available. Stay on tonight's map for the next rehearsal cue."
      )
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithFermataPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstFermataCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Lead Vocal fermata at 0:11" })).toBeTruthy();
  });

  it("contains a hostile song identity descriptor lookup instead of crashing the callout", () => {
    const song = new Proxy(songWithFermataPlan(), {
      getOwnPropertyDescriptor() {
        throw new Error("hostile song id descriptor");
      }
    });

    expect(() => render(<FirstFermataCallout song={song} />)).not.toThrow();
    expect(
      screen.getByText(
        "No fermata plan is available. Stay on tonight's map for the next rehearsal cue."
      )
    ).toBeTruthy();
  });

  it("opens the named fermata on the rendered map", () => {
    const { scrollIntoView } = appendSongStructureTarget();
    render(<FirstFermataCallout song={songWithFermataPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal fermata at 0:11" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Hold Lead Vocal together at 0:11 until the cutoff./)
    ).toBeTruthy();
    expect(screen.getByText(DEMO_FERMATA_PLAN)).toBeTruthy();
  });

  it("shows armed confirmation for user-sourced plans without rewriting user copy", () => {
    const song = songWithFermataPlan();
    const userPlan = "Hold here exactly as our band agreed.";
    const vocal = song.sections[0]!.roles.find((role) => role.id === "lead-vocal")!;
    vocal.fermataPlan = userPlan;
    vocal.fermataPlanSource = "user";
    appendSongStructureTarget();
    render(<FirstFermataCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal fermata at 0:11" }));

    expect(
      screen.getByText(/Hold Lead Vocal together at 0:11 until the cutoff./)
    ).toBeTruthy();
    expect(screen.getByText(userPlan)).toBeTruthy();
  });

  it("reports when the map section cannot be opened", () => {
    render(<FirstFermataCallout song={songWithFermataPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal fermata at 0:11" }));

    expect(
      screen.getByText("Could not open this fermata on the song map. Use the map below to find the section.")
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
    render(<FirstFermataCallout song={songWithFermataPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal fermata at 0:11" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
  });

  it("resets armed guidance when accessor-id songs change with the same fermata signature", () => {
    const firstSong = songWithFermataPlan();
    const nextSong = songWithFermataPlan();
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
    const { rerender } = render(<FirstFermataCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal fermata at 0:11" }));
    expect(
      screen.getByText(/Hold Lead Vocal together at 0:11 until the cutoff./)
    ).toBeTruthy();

    rerender(<FirstFermataCallout song={nextSong} />);

    expect(screen.getByText("Lead Vocal holds the verse fermata at 0:11.")).toBeTruthy();
    expect(
      screen.queryByText(/Hold Lead Vocal together at 0:11 until the cutoff./)
    ).toBeNull();
  });

  it("resets armed guidance when the landing role name changes in the same workspace", () => {
    const firstSong = songWithFermataPlan();
    const nextSong = structuredClone(firstSong);
    nextSong.sections[0]!.roles.find((role) => role.id === "lead-vocal")!.name = "Lead Singer";
    const workspaceInstanceKey = {};
    appendSongStructureTarget();
    const { rerender } = render(
      <FirstFermataCallout song={firstSong} workspaceInstanceKey={workspaceInstanceKey} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal fermata at 0:11" }));
    expect(
      screen.getByText(/Hold Lead Vocal together at 0:11 until the cutoff./)
    ).toBeTruthy();

    rerender(
      <FirstFermataCallout song={nextSong} workspaceInstanceKey={workspaceInstanceKey} />
    );

    expect(screen.getByText("Lead Singer holds the verse fermata at 0:11.")).toBeTruthy();
    expect(
      screen.queryByText(/Hold Lead Singer together at 0:11 until the cutoff./)
    ).toBeNull();
  });
});

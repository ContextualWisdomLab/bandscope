import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { flushSync } from "react-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GrooveMap } from "./GrooveMap";
import { Workspace } from "./Workspace";

/** Replace every copy of one rehearsal role so cross-section aggregation stays deterministic. */
function replaceRole(song: ReturnType<typeof createDemoRehearsalSong>, roleId: string, replace: (role: (typeof song.sections)[number]["roles"][number]) => (typeof song.sections)[number]["roles"][number]) {
  song.sections = song.sections.map((section) => ({
    ...section,
    roles: section.roles.map((role) => (role.id === roleId ? replace(role) : role))
  }));
}

describe("Workspace review regressions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clears an armed setup when another song reuses the selected role id", () => {
    const song = createDemoRehearsalSong();
    const { rerender } = render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: song.sections[0]!.roles[0]!.name }));
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    expect(screen.getByRole("status")).toBeTruthy();

    rerender(<Workspace song={{ ...song, id: "another-song", title: "Another song" }} />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(document.getElementById("workspace-role-setup")?.className).not.toContain("ring-amber-300/70");
  });

  it("clears an armed setup when its cue changes without a new activation", () => {
    const song = createDemoRehearsalSong();
    const { rerender } = render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: song.sections[0]!.roles[0]!.name }));
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    expect(screen.getByRole("status")).toBeTruthy();

    const changedSong = structuredClone(song);
    changedSong.sections[0]!.roles[0]!.setupNote = "Use a softer attack.";
    rerender(<Workspace song={changedSong} />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(document.getElementById("workspace-role-setup")?.className).not.toContain("ring-amber-300/70");
  });

  it("preserves an armed setup across unrelated immutable practice-progress edits", () => {
    const song = createDemoRehearsalSong();
    const { rerender } = render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: song.sections[0]!.roles[0]!.name }));
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));

    const changedSong = structuredClone(song);
    changedSong.sections[0]!.roles[0]!.practiceProgress = 60;
    rerender(<Workspace song={changedSong} />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(document.getElementById("workspace-role-setup")?.className).toContain("ring-amber-300/70");
  });

  it("does not restore a previous activation after its start evidence changes and returns", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    replaceRole(song, role.id, (current) => ({ ...current, transcription: [
      { pitch: "E2", onset: 1, offset: 2, velocity: 0.7 }
    ] }));
    const { rerender } = render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: role.name }));
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    expect(document.getElementById("workspace-groove-entrance")).toBeTruthy();

    const changedSong = structuredClone(song);
    replaceRole(changedSong, role.id, (current) => ({ ...current, transcription: [
      { pitch: "A2", onset: 3, offset: 4, velocity: 0.7 }
    ] }));
    rerender(<Workspace song={changedSong} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.getElementById("workspace-groove-entrance")).toBeNull();
    rerender(<Workspace song={song} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.getElementById("workspace-groove-entrance")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    expect(screen.getByRole("status")).toBeTruthy();
    expect(document.getElementById("workspace-groove-entrance")).toBeTruthy();
  });

  it("clears setup when source project context changes for the same song", () => {
    const song = createDemoRehearsalSong();
    const source = {
      projectId: "project-1", sourceMode: "reference" as const,
      projectRoot: "/owned/project", cacheRoot: "/owned/cache", tempRoot: "/owned/temp",
      source: { sourcePath: "/owned/song.wav", fileName: "song.wav", extension: "wav" as const, fileSizeBytes: 100 }
    };
    const { rerender } = render(<Workspace song={song} sourceBootstrap={source} />);
    fireEvent.click(screen.getByRole("tab", { name: song.sections[0]!.roles[0]!.name }));
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    expect(screen.getByRole("status")).toBeTruthy();
    rerender(<Workspace song={song} sourceBootstrap={{ ...source, projectId: "project-2" }} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("clears setup when its playable range disappears", () => {
    const song = createDemoRehearsalSong();
    const { rerender } = render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: song.sections[0]!.roles[0]!.name }));
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    const changedSong = structuredClone(song);
    changedSong.sections[0]!.roles[0]!.range = { lowestNote: "", highestNote: "" };
    rerender(<Workspace song={changedSong} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: /No first entrance or playable range/ })).toBeDisabled();
  });

  it("requires fresh activation when the selected role name changes and returns", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    const { rerender } = render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: role.name }));
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Tonight's Bass Guitar setup");

    const changedSong = structuredClone(song);
    replaceRole(changedSong, role.id, (current) => ({ ...current, name: "Low-end Guitar" }));
    rerender(<Workspace song={changedSong} />);
    expect(screen.getByRole("tab", { name: "Low-end Guitar" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /^Set up Low-end Guitar/ })).toBeEnabled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.getElementById("workspace-role-setup")).not.toHaveClass("ring-amber-300/70");

    rerender(<Workspace song={song} />);
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Tonight's Bass Guitar setup");
  });

  it.each([
    ["lower", { lowestNote: "B1", highestNote: "E3" }],
    ["upper", { lowestNote: "C#2", highestNote: "G3" }]
  ])("requires fresh activation when the playable range's %s bound changes and returns", (_, range) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    replaceRole(song, role.id, (current) => ({ ...current, transcription: undefined }));
    const { rerender } = render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: role.name }));
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Start in C#2–E3");

    const changedSong = structuredClone(song);
    replaceRole(changedSong, role.id, (current) => ({ ...current, range }));
    rerender(<Workspace song={changedSong} />);
    expect(screen.getByRole("button", { name: /^Set up Bass Guitar/ })).toHaveAccessibleName(
      expect.stringContaining(`then start in ${range.lowestNote}–${range.highestNote}`)
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.getElementById("workspace-role-setup")).not.toHaveClass("ring-amber-300/70");

    rerender(<Workspace song={song} />);
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Start in C#2–E3");
  });

  it("requires fresh activation when only the first note offset changes and returns", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    replaceRole(song, role.id, (current) => ({
      ...current,
      transcription: [{ pitch: "E2", onset: 1, offset: 2, velocity: 0.7 }]
    }));
    const { rerender } = render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: role.name }));
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    const originalAction = screen.getByRole("button", { name: /^Set up Bass Guitar/ }).getAttribute("aria-label");
    expect(screen.getByRole("status")).toHaveTextContent("Start on E2 from 0:01");
    expect(document.getElementById("workspace-groove-entrance")).toBeTruthy();

    const changedSong = structuredClone(song);
    replaceRole(changedSong, role.id, (current) => ({
      ...current,
      transcription: [{ pitch: "E2", onset: 1, offset: 2.5, velocity: 0.7 }]
    }));
    rerender(<Workspace song={changedSong} />);
    expect(screen.getByRole("button", { name: /^Set up Bass Guitar/ })).toHaveAttribute("aria-label", originalAction);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.getElementById("workspace-groove-entrance")).toBeNull();
    expect(document.getElementById("workspace-role-setup")).not.toHaveClass("ring-amber-300/70");

    rerender(<Workspace song={song} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.getElementById("workspace-groove-entrance")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Start on E2 from 0:01");
    expect(document.getElementById("workspace-groove-entrance")).toBeTruthy();
  });

  it("uses the earliest note across unsorted section transcriptions for setup and entrance focus", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    replaceRole(song, role.id, (current) => ({
      ...current,
      transcription: [
        { pitch: "A2", onset: 8, offset: 9, velocity: 0.7 },
        { pitch: "E2", onset: 4, offset: 5, velocity: 0.7 }
      ]
    }));
    song.sections.push({
      ...song.sections[0]!, id: "earlier-evidence-review", label: "intro",
      roles: [{ ...role, transcription: [{ pitch: "C#2", onset: 1, offset: 2, velocity: 0.7 }] }]
    });
    const snapshot = structuredClone(song);
    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: role.name }));
    const setup = screen.getByRole("button", { name: /^Set up Bass Guitar · then start on C#2 from 0:01/ });
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();

    fireEvent.click(setup);

    expect(screen.getByRole("status")).toHaveTextContent("Start on C#2 from 0:01 on the groove map");
    expect(document.getElementById("workspace-groove-entrance")).toHaveAttribute(
      "title", expect.stringContaining("C#2")
    );
    expect(song).toEqual(snapshot);
  });

  it("keeps unavailable stem controls keyboard-discoverable and cancels their actions", () => {
    const song = createDemoRehearsalSong();
    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: song.sections[0]!.roles[0]!.name }));

    for (const name of [/^Play stem\./, /^Loop section\./, /^Solo \/ mute others\./]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toBeEnabled();
      button.focus();
      expect(button).toHaveFocus();
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      expect(fireEvent(button, click)).toBe(false);
      expect(click.defaultPrevented).toBe(true);
      expect(screen.queryByRole("status")).toBeNull();
      expect(document.getElementById("workspace-groove-entrance")).toBeNull();
    }
  });

  it("clears setup when selecting another role or the full role board", () => {
    const song = createDemoRehearsalSong();
    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    expect(screen.getByRole("status")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));
    expect(screen.getByRole("tab", { name: "Lead Vocal" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.getElementById("workspace-role-setup")).not.toHaveClass("ring-amber-300/70");
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));
    expect(screen.queryByRole("status")).toBeNull();
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));

    fireEvent.click(screen.getByRole("tab", { name: "All Roles" }));
    expect(screen.getByRole("tab", { name: "All Roles" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.getElementById("workspace-role-setup")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Set up / })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([true, false, undefined])("focuses setup with reduced-motion preference %s", (matches) => {
    const song = createDemoRehearsalSong();
    const matchMedia = vi.fn((query: string) => ({ matches, media: query }));
    vi.stubGlobal("matchMedia", matches === undefined ? undefined : matchMedia);
    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));
    const target = document.getElementById("workspace-role-setup")!;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;

    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: matches ? "auto" : "smooth", block: "nearest" });
    expect(target).toHaveFocus();
    expect(screen.getByRole("status")).toBeTruthy();
    if (matches === undefined) {
      expect(matchMedia).not.toHaveBeenCalled();
    } else {
      expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    }
  });

  it("safely arms setup when its DOM focus target is unavailable", () => {
    const song = createDemoRehearsalSong();
    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));
    const target = document.getElementById("workspace-role-setup")!;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    // The focus anchor can be absent during host DOM updates; keep React's mounted node intact.
    target.removeAttribute("id");

    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));

    expect(screen.getByRole("status")).toBeTruthy();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(target).not.toHaveFocus();
    target.id = "workspace-role-setup";
  });

  it("leaves progress unchanged when no persistence callback exists", () => {
    const song = createDemoRehearsalSong();
    replaceRole(song, "bass-guitar", (role) => ({ ...role, practiceProgress: 50 }));
    const snapshot = structuredClone(song);
    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    fireEvent.click(screen.getByRole("button", { name: "Increase progress" }));

    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "50");
    expect(song).toEqual(snapshot);
  });

  it("updates every selected-role copy immutably while preserving untouched references and armed setup", () => {
    const song = createDemoRehearsalSong();
    const roleId = song.sections[0]!.roles[0]!.id;
    replaceRole(song, roleId, (role) => ({ ...role, practiceProgress: 50 }));
    song.sections.push({
      ...song.sections[0]!, id: "chorus-review", label: "chorus",
      roles: song.sections[0]!.roles.map((role) => ({ ...role }))
    }, {
      ...song.sections[0]!, id: "vocal-only-review", label: "outro",
      roles: song.sections[0]!.roles.filter((role) => role.id !== roleId)
    });
    const snapshot = structuredClone(song);
    const onSongUpdate = vi.fn<(nextSong: RehearsalSong) => void>();
    const { rerender } = render(<Workspace song={song} onSongUpdate={onSongUpdate} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    const status = screen.getByRole("status").textContent;

    fireEvent.click(screen.getByRole("button", { name: "Increase progress" }));

    expect(onSongUpdate).toHaveBeenCalledTimes(1);
    const nextSong = onSongUpdate.mock.calls[0]![0];
    expect(nextSong).not.toBe(song);
    expect(nextSong.sections).not.toBe(song.sections);
    for (const [index, section] of song.sections.entries()) {
      const nextSection = nextSong.sections[index]!;
      if (!section.roles.some((role) => role.id === roleId)) {
        expect(nextSection).toBe(section);
        expect(nextSection.roles).toBe(section.roles);
        continue;
      }
      expect(nextSection).not.toBe(section);
      expect(nextSection.roles).not.toBe(section.roles);
      for (const [roleIndex, role] of section.roles.entries()) {
        const nextRole = nextSection.roles[roleIndex]!;
        if (role.id === roleId) {
          expect(nextRole).not.toBe(role);
          expect(nextRole).toEqual({ ...role, practiceProgress: 60 });
          expect(nextRole.range).toBe(role.range);
          expect(nextRole.harmony).toBe(role.harmony);
        } else {
          expect(nextRole).toBe(role);
        }
      }
    }
    expect(nextSong.collaboration).toBe(song.collaboration);
    expect(song).toEqual(snapshot);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "50");

    rerender(<Workspace song={nextSong} onSongUpdate={onSongUpdate} />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "60");
    expect(screen.getByRole("status").textContent).toBe(status);
    expect(document.getElementById("workspace-role-setup")).toHaveClass("ring-amber-300/70");
  });

  it("drops a removed selected role's stale setup and still allows returning to all roles", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    const { rerender } = render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: role.name }));
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));

    const changedSong = structuredClone(song);
    changedSong.sections = changedSong.sections.map((section) => ({
      ...section, roles: section.roles.filter((current) => current.id !== role.id)
    }));
    rerender(<Workspace song={changedSong} />);

    expect(screen.queryByRole("tab", { name: role.name })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(role.id)).toBeTruthy();
    expect(screen.getByRole("button", { name: "No setup cue yet. Stay on tonight's map." })).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "All Roles" }));
    expect(document.getElementById("workspace-role-setup")).toBeNull();
  });

  it.each(["pointerdown", "click"] as const)("rejects a setup click when a host invalidates evidence during %s capture", (eventType) => {
    const song = createDemoRehearsalSong();
    const unavailableSong = structuredClone(song);
    replaceRole(unavailableSong, "bass-guitar", (role) => ({
      ...role, setupNote: " ", transpositionPlan: " ", simplification: " "
    }));
    let updates = 0;
    /** A public host update can arrive while the user is activating a part. */
    function Host() {
      const [currentSong, setCurrentSong] = useState(song);
      const invalidate = (target: EventTarget) => {
        if (!(target instanceof HTMLElement) || !target.closest("button")?.getAttribute("aria-label")?.startsWith("Set up Bass Guitar")) return;
        updates += 1;
        flushSync(() => setCurrentSong(unavailableSong));
      };
      return (
        <div
          onPointerDownCapture={eventType === "pointerdown" ? (event) => invalidate(event.target) : undefined}
          onClickCapture={eventType === "click" ? (event) => invalidate(event.target) : undefined}
        >
          <Workspace song={currentSong} />
        </div>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));
    const setup = screen.getByRole("button", { name: /^Set up Bass Guitar/ });
    const scrollIntoView = vi.fn();
    document.getElementById("workspace-role-setup")!.scrollIntoView = scrollIntoView;
    expect(setup).toBeEnabled();

    if (eventType === "pointerdown") fireEvent.pointerDown(setup);
    fireEvent.click(setup);

    expect(updates).toBe(1);
    expect(screen.getByRole("button", { name: "No setup cue yet. Stay on tonight's map." })).toBeDisabled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.getElementById("workspace-role-setup")).not.toHaveClass("ring-amber-300/70");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("uses the first section as the rehearsal focus when no export focus is available", () => {
    const song = createDemoRehearsalSong();
    song.exportSummary = undefined;
    song.sections = song.sections.slice(0, 1);
    render(<Workspace song={song} />);
    expect(screen.getByText(`Focus: ${song.sections[0]!.label}.`)).toBeTruthy();
    expect(screen.getByText(/1 section mapped with groove/)).toBeTruthy();
  });

  it("uses a first-pass rehearsal focus when neither export focus nor sections exist", () => {
    const song = createDemoRehearsalSong();
    song.exportSummary = undefined;
    song.sections = [];
    render(<Workspace song={song} />);
    expect(screen.getByText("Focus: first pass.")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "All Roles" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: /^Set up / })).toBeNull();
  });

  it.each([
    ["Export Cue Sheet (CSV)", "text/csv;charset=utf-8;", "cuesheet.csv"],
    ["Export Chart (JSON)", "application/json;charset=utf-8;", "chart.json"],
    ["Export Handoff (JSON)", "application/json;charset=utf-8;", "handoff.json"]
  ])("downloads %s with a safe filename and releases its temporary URL", async (label, mimeType, suffix) => {
    const song = createDemoRehearsalSong();
    song.title = "Rehearsal/../../Night:*?";
    song.sections[0]!.roles[0]!.cue.value = "=HYPERLINK(\"https://invalid.example\")";
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:workspace-review-export");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    });
    const downloads: { anchor: HTMLAnchorElement; connected: boolean; filename: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ anchor: this, connected: this.isConnected, filename: this.download, href: this.href });
    });
    render(<Workspace song={song} />);

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(mimeType);
    const contents = await blob.text();
    if (suffix === "cuesheet.csv") {
      expect(contents.split("\n")[0]).toBe("Section,Groove,Role,Harmony,Cue,Priority,Notes");
      expect(contents).toContain("Bass Guitar");
      expect(contents).toContain("\"'=HYPERLINK(\"\"https://invalid.example\"\")\"");
    } else if (suffix === "chart.json") {
      const chart = JSON.parse(contents);
      expect(chart.title).toBe(song.title);
      expect(chart.sections[0].roles[0]).toMatchObject({
        name: song.sections[0]!.roles[0]!.name,
        chord: song.sections[0]!.roles[0]!.harmony.chord,
        cue: song.sections[0]!.roles[0]!.cue.value
      });
      expect(chart.sections).toHaveLength(song.sections.length);
    } else {
      const handoff = JSON.parse(contents);
      expect(handoff.artifactKind).toBe("bandscope.metadata-handoff");
      expect(handoff.workspace).toMatchObject({ id: song.id, title: song.title });
      expect(handoff.sourceAssets).toEqual([]);
      expect(contents).not.toContain("sourcePath");
      expect(contents).not.toContain("projectRoot");
    }
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatchObject({
      connected: true,
      filename: `Rehearsal_______Night____${suffix}`,
      href: "blob:workspace-review-export"
    });
    expect(downloads[0]!.anchor.isConnected).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:workspace-review-export");
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it("clears setup when a source project is removed", () => {
    const song = createDemoRehearsalSong();
    const source = {
      projectId: "project-review", sourceMode: "reference" as const,
      projectRoot: "/owned/project", cacheRoot: "/owned/cache", tempRoot: "/owned/temp",
      source: { sourcePath: "/owned/song.wav", fileName: "song.wav", extension: "wav" as const, fileSizeBytes: 100 }
    };
    const { rerender } = render(<Workspace song={song} sourceBootstrap={source} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));
    document.getElementById("workspace-role-setup")!.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /^Set up Bass Guitar/ }));
    expect(screen.getByRole("status")).toBeTruthy();

    rerender(<Workspace song={song} sourceBootstrap={null} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: /^Set up Bass Guitar/ })).toBeEnabled();
    rerender(<Workspace song={song} sourceBootstrap={source} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps copy interpolation free of dynamically constructed regular expressions", () => {
    const source = readFileSync(resolve(process.cwd(), "src/features/workspace/Workspace.tsx"), "utf8");
    expect(source).not.toContain("new RegExp(");
  });

  it("labels a non-bass groove map by role, keeps keyboard focus visible, and emits one entrance anchor", () => {
    render(
      <GrooveMap
        roleName="Lead Guitar"
        entranceOnset={1}
        notes={[
          { pitch: "E4", onset: 1, offset: 1.5, velocity: 0.8 },
          { pitch: "G4", onset: 1, offset: 1.5, velocity: 0.75 }
        ]}
      />
    );

    const region = screen.getByRole("region", { name: "Lead Guitar transcription groove map" });
    expect(region.className).toContain("focus-visible:ring-2");
    expect(document.querySelectorAll("#workspace-groove-entrance")).toHaveLength(1);
    expect(screen.getAllByTitle(/Tonight's entrance/)).toHaveLength(2);
  });

  it("uses the selected role name in groove-map empty and loading copy without inventing progress", () => {
    const { rerender } = render(<GrooveMap roleName="Lead Guitar" notes={[]} />);
    expect(screen.getByText("No Lead Guitar transcription yet. Use it when you want to check the groove before rehearsal.")).toBeTruthy();

    rerender(<GrooveMap roleName="Lead Guitar" notes={[]} isLoading />);
    expect(screen.getByText("Checking the Lead Guitar line...")).toBeTruthy();
  });

  it("does not expose a cancel action without cancellation capability and invokes it when provided", () => {
    const onCancel = vi.fn();
    const { rerender } = render(<GrooveMap roleName="Lead Guitar" notes={[]} isLoading />);

    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

    rerender(<GrooveMap roleName="Lead Guitar" notes={[]} isLoading onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("localizes GrooveMap states and the unavailable loop control", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const roleName = song.sections[0]!.roles[0]!.name;
    const { rerender } = render(<GrooveMap roleName={roleName} notes={[]} />);

    expect(screen.getByText(`${roleName} 채보가 아직 없습니다. 합주 전에 그루브를 확인할 때 사용하세요.`)).toBeTruthy();

    rerender(<GrooveMap roleName={roleName} notes={[]} isLoading onCancel={() => {}} />);
    expect(screen.getByText(`${roleName} 파트를 확인하는 중...`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "취소" })).toBeTruthy();

    rerender(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: roleName }));
    expect(screen.getByRole("button", { name: /구간 반복/ })).toHaveTextContent("구간 반복");
  });

  it("keeps range-backed setup available when no exact first note exists", () => {
    const song = createDemoRehearsalSong();
    const roleId = song.sections[0]!.roles[0]!.id;
    replaceRole(song, roleId, (role) => ({
      ...role,
      setupNote: "Tune down a whole step.",
      transcription: undefined,
      range: {
        ...role.range,
        lowestNote: "C#2",
        highestNote: "E3"
      }
    }));

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: song.sections[0]!.roles[0]!.name }));

    const setupButton = screen.getByRole("button", { name: /then start in C#2–E3/i });
    expect(setupButton).toBeEnabled();
    const visibleLabel = setupButton.textContent?.trim() ?? "";
    expect(visibleLabel).not.toBe("");
    expect(setupButton.getAttribute("aria-label")).toContain(visibleLabel);
  });

  it("keeps placeholder-looking role names literal in setup copy", () => {
    const song = createDemoRehearsalSong();
    const roleId = song.sections[0]!.roles[0]!.id;
    replaceRole(song, roleId, (role) => ({
      ...role,
      name: "{low}",
      setupNote: "Tune down a whole step.",
      transcription: undefined,
      range: {
        ...role.range,
        lowestNote: "C#2",
        highestNote: "E3"
      }
    }));

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "{low}" }));

    expect(
      screen.getByRole("button", {
        name: "Set up {low} · then start in C#2–E3. Setup: Tune down a whole step. Use tonight's map"
      })
    ).toBeEnabled();
  });

  it("keeps disabled stem controls discoverable by their visible labels", () => {
    const song = createDemoRehearsalSong();

    render(<Workspace song={song} />);

    fireEvent.click(screen.getByRole("tab", { name: song.sections[0]!.roles[0]!.name }));
    expect(screen.getByRole("button", { name: /Play stem/ })).toHaveTextContent("Play stem");
    expect(screen.getByRole("button", { name: /Solo \/ mute others/ })).toHaveTextContent(
      "Solo / mute others"
    );
  });

  it("natively disables setup when a cue has neither an entrance nor a playable range", () => {
    const song = createDemoRehearsalSong();
    const roleId = song.sections[0]!.roles[0]!.id;
    replaceRole(song, roleId, (role) => ({
      ...role,
      setupNote: "Tune down a whole step.",
      transcription: undefined,
      range: {
        ...role.range,
        lowestNote: " ",
        highestNote: " "
      }
    }));

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: song.sections[0]!.roles[0]!.name }));

    const setupButton = screen.getByRole("button", {
      name: "No first entrance or playable range yet. Stay on tonight's map."
    });
    expect(setupButton).toBeDisabled();
  });

  it.each([
    ["none", "none"],
    ["E3", "C#2"],
    ["low", "high"]
  ])("rejects malformed setup range %s–%s", (lowestNote, highestNote) => {
    const song = createDemoRehearsalSong();
    const roleId = song.sections[0]!.roles[0]!.id;
    replaceRole(song, roleId, (role) => ({
      ...role,
      setupNote: "Tune down a whole step.",
      transcription: undefined,
      range: {
        ...role.range,
        lowestNote,
        highestNote
      }
    }));

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: song.sections[0]!.roles[0]!.name }));

    const setupButton = screen.getByRole("button", {
      name: "No first entrance or playable range yet. Stay on tonight's map."
    });
    expect(setupButton).toBeDisabled();
  });
});

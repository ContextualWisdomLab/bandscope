import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

const originalLanguage = navigator.language;
const originalTauriInternals = Object.getOwnPropertyDescriptor(
  window,
  "__TAURI_INTERNALS__",
);
const originalPreservesPitch = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "preservesPitch",
);
const tauriConfigPath = resolve(process.cwd(), "src-tauri/tauri.conf.json");
const audioSourcePath = "/Users/test/Music/rehearsal.wav";

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language,
  });
}

function installPlayableAudioMocks() {
  const convertFileSrc = vi.fn((path: string) => `asset://localhost/${path}`);
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: { convertFileSrc },
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  Object.defineProperty(HTMLMediaElement.prototype, "preservesPitch", {
    configurable: true,
    writable: true,
    value: false,
  });
  const play = vi
    .spyOn(HTMLMediaElement.prototype, "play")
    .mockResolvedValue(undefined);
  return { convertFileSrc, play };
}

describe("RehearsalPlayer", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalTauriInternals) {
      Object.defineProperty(
        window,
        "__TAURI_INTERNALS__",
        originalTauriInternals,
      );
    } else {
      delete (window as Window & { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__;
    }
    if (originalPreservesPitch) {
      Object.defineProperty(
        HTMLMediaElement.prototype,
        "preservesPitch",
        originalPreservesPitch,
      );
    } else {
      delete (HTMLMediaElement.prototype as HTMLMediaElement & {
        preservesPitch?: boolean;
      }).preservesPitch;
    }
  });

  it("allows both platform Tauri asset origins in the media CSP", () => {
    const config = JSON.parse(readFileSync(tauriConfigPath, "utf8")) as {
      app: { security: { csp: string } };
    };
    const mediaDirective = config.app.security.csp
      .split(";")
      .find((directive) => directive.trim().startsWith("media-src "));
    const sources = mediaDirective?.trim().split(/\s+/).slice(1) ?? [];

    expect(sources).toEqual(
      expect.arrayContaining(["asset:", "http://asset.localhost"]),
    );
    expect(sources).not.toContain("*");
    expect(sources).not.toContain("http:");
    expect(sources).not.toContain("https:");
  });

  it("names the first playable loop and blocks starting before local audio exists", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    render(<RehearsalPlayer song={song} hasLocalAudio={false} />);

    expect(
      screen.getByTestId("rehearsal-loop-next-action").getAttribute("role"),
    ).toBe("status");
    expect(
      screen
        .getByTestId("rehearsal-loop-next-action")
        .getAttribute("aria-live"),
    ).toBe("polite");
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Map verse from 0:10–0:30\. Choose a local song first/i);
    expect(
      (
        screen.getByRole("button", {
          name: /Start the count-in/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("does not let an external start request bypass missing local-audio authority", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    render(
      <RehearsalPlayer song={song} hasLocalAudio={false} startNonce={1} />,
    );

    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Choose a local song first/i);
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).not.toMatch(/Count in 4 beats/i);
  });

  it("limits the section picker to sections containing the active role", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const chorus = structuredClone(song.sections[0]!);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 40, end: 64 };
    chorus.roles = chorus.roles.filter((role) => role.id !== "lead-vocal");
    song.sections.push(chorus);

    render(
      <RehearsalPlayer
        song={song}
        activeRole="lead-vocal"
        activeRoleName="Lead Vocal"
      />,
    );

    expect(
      screen.getByRole("group", { name: "Playable sections for Lead Vocal" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /verse/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /chorus/i })).toBeNull();
    expect(screen.getByTestId("rehearsal-loop-role-filter")).toHaveTextContent(
      "Showing sections that include Lead Vocal.",
    );
  });

  it("moves section cues with the arrow keys and keeps the selected cue focused", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const chorus = structuredClone(song.sections[0]!);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 40, end: 64 };
    song.sections = [song.sections[0]!, chorus];

    render(<RehearsalPlayer song={song} />);

    const verse = screen.getByRole("button", { name: /verse/i });
    const chorusButton = screen.getByRole("button", { name: /chorus/i });
    expect(
      screen.getByTestId("rehearsal-loop-keyboard-hint"),
    ).toHaveTextContent("Use Left and Right Arrow to move between section cues.");

    chorusButton.focus();
    fireEvent.keyDown(chorusButton, { key: "ArrowLeft" });
    expect(verse).toHaveFocus();

    fireEvent.keyDown(verse, { key: "ArrowRight" });
    expect(chorusButton).toHaveAttribute("aria-pressed", "true");
    expect(chorusButton).toHaveFocus();

    fireEvent.keyDown(chorusButton, { key: "ArrowRight" });
    expect(chorusButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(chorusButton, { key: "ArrowLeft" });
    expect(verse).toHaveAttribute("aria-pressed", "true");
    expect(verse).toHaveFocus();
  });

  it("lets the selected cue keep a manual range correction in the song map", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();
    render(<RehearsalPlayer song={song} onSongUpdate={onSongUpdate} />);

    expect(screen.getByTestId("rehearsal-loop-boundary-editor")).toHaveTextContent(
      "Manual cue correction",
    );
    const start = screen.getByRole("spinbutton", {
      name: "Start time (seconds)",
    });
    fireEvent.change(start, { target: { value: "12" } });
    fireEvent.blur(start);

    expect(onSongUpdate).toHaveBeenCalledTimes(1);
    expect(onSongUpdate.mock.calls[0]![0].sections[0]!.timeRange).toEqual({
      start: 12,
      end: 30,
    });
    expect(song.sections[0]!.timeRange.start).toBe(10);
  });

  it("rejects a boundary correction that would invert the selected cue", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();
    render(<RehearsalPlayer song={song} onSongUpdate={onSongUpdate} />);

    const end = screen.getByRole("spinbutton", {
      name: "End time (seconds)",
    });
    fireEvent.change(end, { target: { value: "5" } });
    fireEvent.blur(end);

    expect(onSongUpdate).not.toHaveBeenCalled();
    expect(end).toHaveValue(30);
    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("rehearsal-loop-boundary-editor")).toHaveTextContent(
      "with the end after the start",
    );
  });

  it("keeps focus on the next boundary field after a Tab correction", async () => {
    setNavigatorLanguage("en-US");
    const user = userEvent.setup();
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();
    render(<RehearsalPlayer song={song} onSongUpdate={onSongUpdate} />);

    const start = screen.getByRole("spinbutton", {
      name: "Start time (seconds)",
    });
    const end = screen.getByRole("spinbutton", {
      name: "End time (seconds)",
    });
    await user.click(start);
    await user.clear(start);
    await user.type(start, "12");
    await user.tab();

    expect(end).toHaveFocus();
    expect(start).toHaveValue(12);
    expect(onSongUpdate).toHaveBeenCalledTimes(1);
    expect(onSongUpdate.mock.calls[0]![0].sections[0]!.timeRange.start).toBe(12);
  });

  it("keeps the selected loop by section ID when an earlier section is filtered out", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const verse = structuredClone(song.sections[0]!);
    verse.id = "verse-no-lead-vocal";
    verse.roles = verse.roles.filter((role) => role.id !== "lead-vocal");
    const chorus = structuredClone(song.sections[0]!);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 40, end: 64 };
    song.sections = [verse, chorus];

    const { rerender } = render(<RehearsalPlayer song={song} />);
    fireEvent.click(screen.getByRole("button", { name: /chorus/i }));
    expect(
      screen
        .getByRole("button", { name: /chorus/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    rerender(
      <RehearsalPlayer
        song={song}
        activeRole="lead-vocal"
        activeRoleName="Lead Vocal"
      />,
    );

    expect(
      screen
        .getByRole("button", { name: /chorus/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByTestId("rehearsal-loop-next-action")).toHaveTextContent(
      /Map chorus from 0:40–1:04/i,
    );
  });

  it("keeps duplicate cue identities distinct for navigation and correction", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const duplicate = {
      ...song.sections[0]!,
      label: "verse copy",
      timeRange: { ...song.sections[0]!.timeRange },
    };
    song.sections = [song.sections[0]!, duplicate];
    const onSongUpdate = vi.fn();
    render(<RehearsalPlayer song={song} onSongUpdate={onSongUpdate} />);

    const sectionButtons = screen
      .getAllByRole("button")
      .filter((button) => button.id.startsWith("rehearsal-loop-section-"));
    expect(sectionButtons).toHaveLength(2);
    expect(sectionButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(sectionButtons[1]).toHaveAttribute("aria-pressed", "false");

    sectionButtons[0]!.focus();
    fireEvent.keyDown(sectionButtons[0]!, { key: "ArrowRight" });

    expect(sectionButtons[1]).toHaveFocus();
    expect(sectionButtons[0]).toHaveAttribute("aria-pressed", "false");
    expect(sectionButtons[1]).toHaveAttribute("aria-pressed", "true");

    const start = screen.getByRole("spinbutton", {
      name: "Start time (seconds)",
    });
    fireEvent.change(start, { target: { value: "12" } });
    fireEvent.blur(start);

    expect(onSongUpdate).toHaveBeenCalledTimes(1);
    expect(onSongUpdate.mock.calls[0]![0].sections[0]!.timeRange.start).toBe(10);
    expect(onSongUpdate.mock.calls[0]![0].sections[1]!.timeRange.start).toBe(12);
  });

  it("preserves the selected cue when an earlier section is inserted", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const chorus = structuredClone(song.sections[0]!);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 40, end: 64 };
    song.sections = [song.sections[0]!, chorus];
    const onSongUpdate = vi.fn();
    const { rerender } = render(
      <RehearsalPlayer song={song} onSongUpdate={onSongUpdate} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /chorus/i }));
    const inserted = structuredClone(song.sections[0]!);
    inserted.id = "intro-1";
    inserted.label = "intro";
    inserted.timeRange = { start: 0, end: 5 };
    const updatedSong = { ...song, sections: [inserted, ...song.sections] };
    rerender(
      <RehearsalPlayer song={updatedSong} onSongUpdate={onSongUpdate} />,
    );

    const chorusButton = screen.getByRole("button", { name: /chorus/i });
    expect(chorusButton).toHaveAttribute("aria-pressed", "true");
    const start = screen.getByRole("spinbutton", {
      name: "Start time (seconds)",
    });
    fireEvent.change(start, { target: { value: "42" } });
    fireEvent.blur(start);

    expect(onSongUpdate).toHaveBeenCalledTimes(1);
    expect(onSongUpdate.mock.calls[0]![0].sections[1]!.timeRange.start).toBe(10);
    expect(onSongUpdate.mock.calls[0]![0].sections[2]!.timeRange.start).toBe(42);
    rerender(
      <RehearsalPlayer
        song={onSongUpdate.mock.calls[0]![0]}
        onSongUpdate={onSongUpdate}
      />,
    );
    expect(screen.getByRole("button", { name: /chorus/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("explains when the active role has no playable sections", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles = [];

    render(
      <RehearsalPlayer
        song={song}
        activeRole="lead-vocal"
        activeRoleName="Lead Vocal"
      />,
    );

    expect(screen.getByTestId("rehearsal-loop-next-action")).toHaveTextContent(
      "No playable sections include Lead Vocal yet.",
    );
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("stops active count-in and loop ticking when local-audio authority is revoked", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();
    const { rerender } = render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Count in 4 beats/i);

    rerender(<RehearsalPlayer song={song} hasLocalAudio={false} />);
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Choose a local song first/i);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).not.toMatch(/looping/i);

    rerender(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/looping/i);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    const audio = screen.getByTestId(
      "rehearsal-loop-audio",
    ) as HTMLAudioElement;
    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      writable: true,
      value: 15,
    });
    fireEvent(audio, new Event("timeupdate"));

    const playheadBeforeRevocation = screen
      .getByTestId("rehearsal-loop-playhead")
      .getAttribute("style");
    expect(playheadBeforeRevocation).not.toContain("width: 0%");

    rerender(<RehearsalPlayer song={song} hasLocalAudio={false} />);
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Choose a local song first/i);
    const playheadAfterRevocation = screen
      .getByTestId("rehearsal-loop-playhead")
      .getAttribute("style");
    expect(playheadAfterRevocation).not.toBe(playheadBeforeRevocation);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      screen.getByTestId("rehearsal-loop-playhead").getAttribute("style"),
    ).toBe(playheadAfterRevocation);
  });

  it("counts in then loops the selected section on the map clock", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();
    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Count in 4 beats at 120 BPM/i);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/The rehearsal clock is looping verse from 0:10–0:30/i);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(
      screen.getByTestId("rehearsal-loop-playhead").getAttribute("style"),
    ).toContain("%");
  });

  it("uses the scoped native asset as the media clock for a real loop", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    const { convertFileSrc, play } = installPlayableAudioMocks();
    const song = createDemoRehearsalSong();

    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />,
    );

    const audio = screen.getByTestId(
      "rehearsal-loop-audio",
    ) as HTMLAudioElement;
    expect(convertFileSrc).toHaveBeenCalledWith(
      "/Users/test/Music/rehearsal.wav",
      "asset",
    );
    expect(audio.src).toContain("asset://localhost/");

    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );
    expect(play).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      writable: true,
      value: 17.5,
    });
    fireEvent(audio, new Event("timeupdate"));
    expect(
      screen.getByTestId("rehearsal-loop-playhead").getAttribute("style"),
    ).toContain("37.5%");

    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      writable: true,
      value: 29.9,
    });
    fireEvent(audio, new Event("timeupdate"));
    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      writable: true,
      value: 30,
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(audio.currentTime).toBe(10);
  });

  it("seeks the scoped media clock within a live loop", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();
    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />,
    );

    const audio = screen.getByTestId("rehearsal-loop-audio") as HTMLAudioElement;
    fireEvent.click(screen.getByRole("button", { name: /Start the count-in/i }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const seek = screen.getByRole("slider", { name: "Seek within this cue" });
    fireEvent.change(seek, { target: { value: "18.5" } });

    expect(audio.currentTime).toBe(18.5);
    expect(seek).toHaveValue("18.5");
  });

  it("supports transport shortcuts without capturing controls or modifiers", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    const { play } = installPlayableAudioMocks();
    const song = createDemoRehearsalSong();
    const onSongUpdate = vi.fn();
    render(
      <RehearsalPlayer
        song={song}
        onSongUpdate={onSongUpdate}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />,
    );

    const start = screen.getByRole("button", { name: /Start the count-in/i });
    const boundaryStart = screen.getByRole("spinbutton", {
      name: "Start time (seconds)",
    });
    boundaryStart.focus();
    fireEvent.keyDown(boundaryStart, { key: " " });
    expect(start).toBeEnabled();
    expect(play).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: " ", repeat: true });
    expect(start).toBeDisabled();
    expect(play).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.keyDown(window, { key: " ", ctrlKey: true });
    fireEvent.keyDown(window, { key: " ", shiftKey: true });
    expect(screen.getByTestId("rehearsal-loop-next-action")).toHaveTextContent(
      /looping/i,
    );
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: " ", repeat: true });
    expect(screen.getByTestId("rehearsal-loop-next-action")).toHaveTextContent(
      /paused/i,
    );
    const stop = screen.getByRole("button", { name: /Stop/i });
    stop.focus();
    fireEvent.keyDown(stop, { key: "Escape", altKey: true });
    expect(screen.getByTestId("rehearsal-loop-next-action")).toHaveTextContent(
      /paused/i,
    );
    fireEvent.keyDown(stop, { key: "Escape" });
    expect(screen.getByTestId("rehearsal-loop-next-action")).toHaveTextContent(
      /Start the count-in/i,
    );
  });

  it("preserves native Space behavior for focused scroll regions", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();

    render(
      <>
        <RehearsalPlayer
          song={song}
          hasLocalAudio={true}
          audioSourcePath={audioSourcePath}
        />
        <div
          aria-label="Scrollable rehearsal timeline"
          role="region"
          tabIndex={0}
        />
      </>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const region = screen.getByRole("region", {
      name: "Scrollable rehearsal timeline",
    });
    const event = createEvent.keyDown(region, { key: " " });
    region.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/looping/i);
  });

  it("caps long media boundary timers before the browser timeout limit", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    const convertFileSrc = vi.fn((path: string) => `asset://localhost/${path}`);
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: { convertFileSrc },
    });
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const song = createDemoRehearsalSong();
    song.sections[0]!.timeRange = {
      start: 10,
      end: 10 + 2_147_483_648,
    };
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(setTimeoutSpy).toHaveBeenLastCalledWith(
      expect.any(Function),
      2_147_483_647,
    );
  });

  it.each([
    { rate: "0.75", beforeLoopMs: 2000, remainingMs: 700 },
    { rate: "1.25", beforeLoopMs: 1500, remainingMs: 200 },
  ])(
    "keeps the count-in aligned with playback rate $rate",
    ({ rate, beforeLoopMs, remainingMs }) => {
      setNavigatorLanguage("en-US");
      vi.useFakeTimers();
      installPlayableAudioMocks();
      const song = createDemoRehearsalSong();

      render(
        <RehearsalPlayer
          song={song}
          hasLocalAudio={true}
          audioSourcePath={audioSourcePath}
        />,
      );
      fireEvent.change(screen.getByRole("combobox", { name: /Playback speed/i }), {
        target: { value: rate },
      });
      fireEvent.click(
        screen.getByRole("button", { name: /Start the count-in/i }),
      );

      act(() => {
        vi.advanceTimersByTime(beforeLoopMs);
      });
      expect(
        screen.getByTestId("rehearsal-loop-next-action").textContent,
      ).not.toMatch(/looping/i);

      act(() => {
        vi.advanceTimersByTime(remainingMs);
      });
      expect(
        screen.getByTestId("rehearsal-loop-next-action").textContent,
      ).toMatch(/looping/i);
    },
  );

  it("scales and reschedules section boundaries when playback rate changes", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: /Playback speed/i }), {
      target: { value: "1.25" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Count in 4 beats at 150 BPM/i);
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(setTimeoutSpy.mock.calls.at(-1)?.[1]).toBeCloseTo(16_000, 5);

    fireEvent.change(screen.getByRole("combobox", { name: /Playback speed/i }), {
      target: { value: "0.75" },
    });

    expect(setTimeoutSpy.mock.calls.at(-1)?.[1]).toBeCloseTo(
      20_000 / 0.75,
      5,
    );
  });

  it("keeps the remaining count-in beat when playback rate changes", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();

    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );
    act(() => {
      vi.advanceTimersByTime(400);
    });

    fireEvent.change(screen.getByRole("combobox", { name: /Playback speed/i }), {
      target: { value: "0.75" },
    });
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Count in 4 beats at 90 BPM/i);

    act(() => {
      vi.advanceTimersByTime(50);
    });
    fireEvent.change(screen.getByRole("combobox", { name: /Playback speed/i }), {
      target: { value: "1.25" },
    });
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Count in 4 beats at 150 BPM/i);

    act(() => {
      vi.advanceTimersByTime(49);
    });
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Count in 4 beats at 150 BPM/i);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Count in 3 beats at 150 BPM/i);
  });

  it("applies supported playback speed while preserving pitch when available", () => {
    setNavigatorLanguage("en-US");
    const { play } = installPlayableAudioMocks();
    const song = createDemoRehearsalSong();

    const { rerender } = render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />,
    );

    const audio = screen.getByTestId(
      "rehearsal-loop-audio",
    ) as HTMLAudioElement;
    const rateSelect = screen.getByRole("combobox", {
      name: /Playback speed/i,
    }) as HTMLSelectElement;
    expect(rateSelect.value).toBe("1");

    fireEvent.change(rateSelect, { target: { value: "0.75" } });

    expect(audio.playbackRate).toBe(0.75);
    expect(audio.preservesPitch).toBe(true);
    expect(
      screen.getByText(/Pitch stays natural when the audio engine supports it/i),
    ).toBeTruthy();
    expect(play).not.toHaveBeenCalled();

    rerender(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath="/Users/test/Music/second-rehearsal.wav"
      />,
    );
    expect(audio.playbackRate).toBe(0.75);
  });

  it("keeps a live loop running across unrelated song metadata updates", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();
    const { rerender } = render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/looping/i);

    const updatedSong = {
      ...song,
      sections: song.sections.map((section, sectionIndex) =>
        sectionIndex === 0
          ? {
              ...section,
              roles: section.roles.map((role, roleIndex) =>
                roleIndex === 0 ? { ...role, practiceProgress: 50 } : role,
              ),
            }
          : section,
      ),
    };

    rerender(
      <RehearsalPlayer
        song={updatedSong}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />,
    );

    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/looping/i);
  });

  it("disables start while count-in or loop timing is already active", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();
    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />,
    );

    const startButton = screen.getByRole("button", {
      name: /Start the count-in/i,
    }) as HTMLButtonElement;
    expect(startButton.disabled).toBe(false);

    fireEvent.click(startButton);
    expect(startButton.disabled).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(startButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Pause/i }));
    expect(startButton.disabled).toBe(false);
  });

  it("restarts a paused loop from an external section-start request", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();
    const { rerender } = render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
        startNonce={0}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.click(screen.getByRole("button", { name: /Pause/i }));
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/paused/i);

    rerender(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
        startNonce={1}
      />,
    );
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Count in 4 beats/i);
  });

  it("does not restart the count-in when section selection changes under the same start nonce", () => {
    setNavigatorLanguage("en-US");
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();
    song.sections = [
      {
        ...song.sections[0]!,
        id: "verse-a",
        label: "verse",
        timeRange: { start: 10, end: 20 },
      },
      {
        ...song.sections[0]!,
        id: "chorus-b",
        label: "chorus",
        timeRange: { start: 20, end: 30 },
      },
    ];

    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
        startNonce={1}
      />,
    );
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Count in 4 beats/i);

    fireEvent.click(
      screen.getByRole("button", { name: /chorus.*0:20.*0:30/i }),
    );

    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Map chorus from 0:20–0:30\. Start the count-in/i);
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).not.toMatch(/Count in 4 beats/i);
  });

  it("keeps duplicate analysis section ids selectable by renderer position", () => {
    setNavigatorLanguage("en-US");
    installPlayableAudioMocks();
    const song = createDemoRehearsalSong();
    song.sections = [
      {
        ...song.sections[0]!,
        id: "duplicate-section",
        label: "verse",
        timeRange: { start: 10, end: 20 },
      },
      {
        ...song.sections[0]!,
        id: "duplicate-section",
        label: "chorus",
        timeRange: { start: 30, end: 40 },
      },
    ];

    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={audioSourcePath}
      />,
    );

    const verseButton = screen.getByRole("button", {
      name: /verse.*0:10.*0:20/i,
    });
    const chorusButton = screen.getByRole("button", {
      name: /chorus.*0:30.*0:40/i,
    });
    expect(verseButton.getAttribute("aria-pressed")).toBe("true");
    expect(chorusButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(chorusButton);

    expect(verseButton.getAttribute("aria-pressed")).toBe("false");
    expect(chorusButton.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Map chorus from 0:30–0:40\. Start the count-in/i);
  });

  it("stays fail-closed when no section has a usable window", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections = [];
    render(<RehearsalPlayer song={song} />);

    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Add a section with a start and end time/i);
    expect(
      (
        screen.getByRole("button", {
          name: /Start the count-in/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

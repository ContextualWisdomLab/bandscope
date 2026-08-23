import { act, fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

const originalLanguage = navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language,
  });
}

describe("RehearsalPlayer", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("names the first playable loop and blocks starting before local audio exists", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    render(<RehearsalPlayer song={song} hasLocalAudio={false} />);

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
      <RehearsalPlayer
        song={song}
        hasLocalAudio={false}
        startNonce={1}
      />,
    );

    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/Choose a local song first/i);
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).not.toMatch(/Count in 4 beats/i);
  });

  it("stops active count-in and loop ticking when local-audio authority is revoked", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    const song = createDemoRehearsalSong();
    const { rerender } = render(
      <RehearsalPlayer song={song} hasLocalAudio={true} />,
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

    rerender(<RehearsalPlayer song={song} hasLocalAudio={true} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Start the count-in/i }),
    );
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/looping/i);

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
    const song = createDemoRehearsalSong();
    render(<RehearsalPlayer song={song} hasLocalAudio={true} />);

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

  it("keeps a live loop running across unrelated song metadata updates", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    const song = createDemoRehearsalSong();
    const { rerender } = render(
      <RehearsalPlayer song={song} hasLocalAudio={true} />,
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
                roleIndex === 0
                  ? { ...role, practiceProgress: 50 }
                  : role,
              ),
            }
          : section,
      ),
    };

    rerender(<RehearsalPlayer song={updatedSong} hasLocalAudio={true} />);

    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).toMatch(/looping/i);
  });

  it("disables start while count-in or loop timing is already active", () => {
    setNavigatorLanguage("en-US");
    vi.useFakeTimers();
    const song = createDemoRehearsalSong();
    render(<RehearsalPlayer song={song} hasLocalAudio={true} />);

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

  it("does not restart the count-in when section selection changes under the same start nonce", () => {
    setNavigatorLanguage("en-US");
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

    render(<RehearsalPlayer song={song} hasLocalAudio={true} />);

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

import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it } from "vitest";
import { RangesFeature } from "./index";

const originalLanguage = navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("RangesFeature", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("names choosing a song first when Ranges has no analysis", () => {
    setNavigatorLanguage("en-US");
    render(<RangesFeature title="Ranges" />);
    expect(
      screen.getByText("Choose a song on the rehearsal map first. Ranges will name tonight's playable spans after analysis.")
    ).toBeTruthy();
  });

  it("names tonight's first playable span and the next instrument check", () => {
    setNavigatorLanguage("en-US");
    render(<RangesFeature title="Ranges" song={createDemoRehearsalSong()} />);

    const callout = screen.getByTestId("ranges-first-span");
    expect(callout).toHaveTextContent("Tonight's first range");
    expect(callout).toHaveTextContent(
      "Bass Guitar sits C#2–E3 in verse. Hear that clash on your instrument before the verse."
    );
    expect(screen.getByTestId("range-card-0-bass-guitar")).toHaveTextContent("C#2 — E3");
    expect(screen.getByTestId("range-card-0-bass-guitar")).toHaveTextContent(
      "Check this span on your instrument before verse."
    );
    expect(screen.getByText("Density warning: competing with Keyboard Left Hand in low register.")).toBeTruthy();
  });

  it("rejects inverted spans instead of calling them playable", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      range: { lowestNote: "E3", highestNote: "C#2" },
      overlapWarnings: []
    };

    render(<RangesFeature title="Ranges" song={song} />);

    const card = screen.getByTestId("range-card-0-bass-guitar");
    expect(card).toHaveTextContent("Confirm the high and low notes by ear before treating this as a playable span.");
    expect(card).not.toHaveTextContent("E3 — C#2");
  });

  it("names written notes as an instrument check", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      transcription: [
        { pitch: "C#2", onset: 0, offset: 1, velocity: 90 },
        { pitch: "E3", onset: 1, offset: 2, velocity: 90 }
      ]
    };

    render(<RangesFeature title="Ranges" song={song} />);
    expect(screen.getByText("Check 2 written notes on your instrument.")).toBeTruthy();
  });

  it("uses singular copy for one written note", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      transcription: [{ pitch: "C#2", onset: 0, offset: 1, velocity: 90 }]
    };

    render(<RangesFeature title="Ranges" song={song} />);
    expect(screen.getByText("Check 1 written note on your instrument.")).toBeTruthy();
  });

  it("keeps repeated role cards addressable across sections", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      verse,
      { ...verse, id: "chorus-1", label: "chorus", timeRange: { start: 30, end: 50 } }
    ];

    render(<RangesFeature title="Ranges" song={song} />);

    expect(screen.getByTestId("range-card-0-bass-guitar")).toBeTruthy();
    expect(screen.getByTestId("range-card-1-bass-guitar")).toBeTruthy();
  });
});

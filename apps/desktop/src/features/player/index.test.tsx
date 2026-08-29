import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it } from "vitest";
import { PlayerFeature, firstNamedSection } from "./index";

const originalLanguage = navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("firstNamedSection", () => {
  it("returns the first labeled window with a forward time range", () => {
    expect(firstNamedSection(createDemoRehearsalSong())).toEqual({ id: "verse-1", label: "verse" });
  });

  it("skips blank labels and inverted windows", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      {
        ...verse,
        id: " ",
        label: "none",
        timeRange: { start: 30, end: 10 }
      },
      {
        ...verse,
        id: "chorus-1",
        label: "chorus",
        timeRange: { start: 30, end: 50 }
      }
    ];
    expect(firstNamedSection(song)).toEqual({ id: "chorus-1", label: "chorus" });
  });

  it("rejects malformed roots instead of inventing a loop", () => {
    expect(firstNamedSection(null)).toBeNull();
    expect(firstNamedSection({ sections: "bad" } as never)).toBeNull();
  });
});

describe("PlayerFeature", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("names the rehearsal map when no song is loaded", () => {
    setNavigatorLanguage("en-US");
    render(<PlayerFeature title="Player" />);
    expect(
      screen.getByText(
        "Open the rehearsal map and choose a song first. This window does not play audio yet."
      )
    ).toBeTruthy();
  });

  it("names tonight's first map section without claiming playback", () => {
    setNavigatorLanguage("en-US");
    render(<PlayerFeature title="Player" song={createDemoRehearsalSong()} />);

    const callout = screen.getByTestId("player-next-map-loop");
    expect(callout).toHaveTextContent("Tonight's first loop");
    expect(callout).toHaveTextContent(
      "Tonight's first section is verse. Open that section on the rehearsal map to set tonight's loop."
    );
    expect(callout).toHaveTextContent("This window does not play audio yet.");
    expect(screen.getByTestId("player-song-title")).toHaveTextContent("Late Night Set");
  });

  it("asks for a named window when no section can be looped", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections = [];
    render(<PlayerFeature title="Player" song={song} />);
    expect(
      screen.getByText("Tonight's first section still needs a named window on the rehearsal map.")
    ).toBeTruthy();
  });
});

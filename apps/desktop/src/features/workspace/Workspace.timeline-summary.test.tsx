import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

const originalLanguage = navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("Workspace song timeline summary", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("uses singular English copy for a one-section song", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections = song.sections.slice(0, 1);

    render(<Workspace song={song} />);

    expect(
      screen.getByText("1 section mapped with groove, role cues, and chord confidence notes.")
    ).toBeTruthy();
  });
});

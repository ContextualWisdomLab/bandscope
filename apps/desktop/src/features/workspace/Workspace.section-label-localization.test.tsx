import { render, screen, within } from "@testing-library/react";
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

describe("Workspace song-structure localization", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("uses the localized canonical form label in the rendered Korean timeline", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();

    render(<Workspace song={song} />);

    const grid = within(screen.getByTestId("song-structure-grid"));
    expect(grid.getByText(/^벌스 · /)).toBeTruthy();
    expect(grid.queryByText(/^verse · /i)).toBeNull();
  });
});

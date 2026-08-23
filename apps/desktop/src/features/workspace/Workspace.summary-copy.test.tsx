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

describe("Workspace summary copy", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("keeps English workspace summary terms capitalized consistently", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();

    render(<Workspace song={song} />);

    expect(screen.getByText(/Groove · Roles · Chord · Confidence/)).toBeTruthy();
    expect(screen.queryByText(/Groove · Roles · Chord · confidence/)).toBeNull();
  });
});

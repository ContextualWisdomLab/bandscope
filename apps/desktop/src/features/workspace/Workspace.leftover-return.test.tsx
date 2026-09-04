import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

const originalLanguage = navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("Workspace leftover-return empty state", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("explains when a trustworthy all-active song needs no leftover-return cue", () => {
    setNavigatorLanguage("en-US");
    render(<Workspace song={createDemoRehearsalSong()} />);

    const callout = screen.getByTestId("first-leftover-return");
    expect(callout).toHaveTextContent(
      "No leftover return is needed: every named part stays active. Rehearse from the first section without a count-back cue."
    );
    expect(callout).not.toHaveTextContent("still needs a named leftover part");
  });
});

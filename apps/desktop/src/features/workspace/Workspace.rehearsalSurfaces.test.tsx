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

describe("Workspace rehearsal surfaces", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("makes the Ranges board and Player next-loop window reachable from the loaded workspace", () => {
    setNavigatorLanguage("en-US");

    render(<Workspace song={createDemoRehearsalSong()} />);

    expect(screen.getByRole("heading", { name: "Ranges" })).toBeTruthy();
    expect(screen.getByTestId("ranges-first-span")).toHaveTextContent("Bass Guitar sits C#2–E3 in verse");
    expect(screen.getByRole("heading", { name: "Player" })).toBeTruthy();
    expect(screen.getByTestId("player-next-map-loop")).toHaveTextContent("Tonight's first section is verse");
    expect(screen.getByTestId("player-next-map-loop")).toHaveTextContent("does not play audio yet");
  });
});

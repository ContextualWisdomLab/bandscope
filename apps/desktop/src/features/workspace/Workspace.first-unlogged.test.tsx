import { fireEvent, render, screen } from "@testing-library/react";
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

describe("Workspace first-unlogged practice admission", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("shows completion instead of inventing another pass after a logged part is selected", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles = song.sections[0]!.roles.map((role) => ({
      ...role,
      practiceProgress: 100
    }));

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const callout = screen.getByTestId("first-unlogged-practice");
    expect(callout).toHaveTextContent("Every named part already has a practice mark.");
    expect(callout).not.toHaveTextContent("Switch to the next unlogged part");
  });

  it("keeps an owned undefined optional practice mark in the unlogged path", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    Object.defineProperty(song.sections[0]!.roles[0]!, "practiceProgress", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: undefined
    });
    song.sections[0]!.roles[1] = {
      ...song.sections[0]!.roles[1]!,
      practiceProgress: 100
    };
    song.sections[0]!.roles[2] = {
      ...song.sections[0]!.roles[2]!,
      practiceProgress: 100
    };

    render(<Workspace song={song} />);

    expect(screen.getByTestId("first-unlogged-practice")).toHaveTextContent(
      "Bass Guitar in verse has no practice logged yet. Select that part and record tonight's first pass."
    );
  });

  it("keeps the selected next action when the optional mark is explicitly undefined", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    Object.defineProperty(song.sections[0]!.roles[0]!, "practiceProgress", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: undefined
    });

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    expect(screen.getByTestId("practice-progress-next-action")).toHaveTextContent(
      "Check Bass Guitar's first range, then mark this part started."
    );
  });
});

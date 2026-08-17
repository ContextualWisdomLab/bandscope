import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, it, expect, vi } from "vitest";
import { Workspace } from "./Workspace";

const originalLanguage = navigator.language;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

function setNavigatorLanguage(language: string): void {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

afterEach(() => {
  setNavigatorLanguage(originalLanguage);
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  vi.restoreAllMocks();
});

it("keeps cue-only roles off the first-notes action until notes or a range exist", () => {
  setNavigatorLanguage("en-US");
  const song = createDemoRehearsalSong();
  song.sections[0]!.roles[0] = {
    ...song.sections[0]!.roles[0]!,
    transcription: undefined,
    range: {
      lowestNote: "",
      highestNote: ""
    },
    cue: {
      kind: "transition",
      value: "Hold through the pickup before the downbeat."
    }
  };
  const scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;

  render(<Workspace song={song} />);
  fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

  const unavailableButton = screen.getByRole("button", {
    name: "No notes are ready yet. Stay on tonight's map."
  });
  expect(unavailableButton.getAttribute("aria-disabled")).toBe("true");

  fireEvent.click(unavailableButton);

  expect(screen.queryByText(/Tonight's Bass Guitar cue is/)).toBeNull();
  expect(document.activeElement?.id).not.toBe("workspace-groove-map");
  expect(scrollIntoView).not.toHaveBeenCalled();
});

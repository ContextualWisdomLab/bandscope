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

it("names a cue-only groove-map action instead of presenting an enabled unavailable button", () => {
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

  const cueButton = screen.getByRole("button", {
    name: "Open Bass Guitar cue Hold through the pickup before the downbeat. on tonight's groove map"
  });
  expect(cueButton.textContent).toBe(
    "See Bass Guitar cue · Hold through the pickup before the downbeat."
  );

  fireEvent.click(cueButton);

  expect(
    screen.getByText(
      "Tonight's Bass Guitar cue is Hold through the pickup before the downbeat.. Count in on the groove map."
    )
  ).toBeTruthy();
  expect(document.activeElement?.id).toBe("workspace-groove-map");
  expect(scrollIntoView).toHaveBeenCalled();
});

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

it("opens the earliest transcription for a selected role even when its first section has only range metadata", () => {
  setNavigatorLanguage("en-US");
  const song = createDemoRehearsalSong();
  const firstSection = song.sections[0]!;
  const bassRole = firstSection.roles[0]!;
  firstSection.roles[0] = {
    ...bassRole,
    transcription: undefined
  };
  song.sections.push({
    ...firstSection,
    id: "later-bass-entry",
    label: "chorus",
    timeRange: {
      start: 40,
      end: 60
    },
    roles: [
      {
        ...bassRole,
        transcription: [
          {
            pitch: "A2",
            onset: 42,
            offset: 42.5,
            velocity: 0.8
          }
        ]
      }
    ]
  });
  const scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;

  render(<Workspace song={song} />);
  fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

  const notesButton = screen.getByRole("button", {
    name: "Open Bass Guitar notes starting at A2 from 0:42 on tonight's groove map"
  });
  expect(notesButton.textContent).toBe("See Bass Guitar notes · A2 from 0:42");

  fireEvent.click(notesButton);

  expect(screen.getByText("A2")).toBeTruthy();
  expect(screen.getByText("1 notes mapped for rehearsal")).toBeTruthy();
  expect(screen.getByText("Tonight's first Bass Guitar notes are A2 from 0:42. Count in on the groove map.")).toBeTruthy();
  expect(document.activeElement?.id).toBe("workspace-groove-map");
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
});

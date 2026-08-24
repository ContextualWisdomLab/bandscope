import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstEarCheckCallout } from "./FirstEarCheckCallout";

function appendSongStructureTarget() {
  const timeline = document.createElement("div");
  timeline.setAttribute("role", "region");
  timeline.setAttribute("aria-label", "Scrollable song structure timeline");
  const target = document.createElement("div");
  target.dataset.sectionIndex = "0";
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
  timeline.appendChild(target);
  document.body.appendChild(timeline);
  return timeline;
}

function songWithThirtyThreeSections() {
  const song = createDemoRehearsalSong();
  const filler = structuredClone(song.sections[1] ?? song.sections[0]!);
  song.sections = [
    structuredClone(song.sections[0]!),
    ...Array.from({ length: 32 }, (_, index) => ({
      ...structuredClone(filler),
      id: `identity-filler-${index + 1}`,
      timeRange: {
        ...structuredClone(filler.timeRange),
        start: 100 + index * 10,
        end: 105 + index * 10
      }
    }))
  ];
  return song;
}

describe("FirstEarCheckCallout bounded song identity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resets armed guidance when same-id oversized songs differ beyond the fingerprint bound", () => {
    const firstSong = songWithThirtyThreeSections();
    const secondSong = structuredClone(firstSong);
    secondSong.sections[32]!.id = "different-tail-section";
    const timeline = appendSongStructureTarget();

    try {
      const { rerender } = render(<FirstEarCheckCallout song={firstSong} />);

      fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar ear check at 0:10" }));
      expect(screen.getByText(/Confirm Bass Guitar by ear at 0:10 before the room starts./)).toBeTruthy();

      rerender(<FirstEarCheckCallout song={secondSong} />);

      expect(screen.getByText("Bass Guitar still needs an ear check in the verse at 0:10.")).toBeTruthy();
      expect(screen.queryByText(/Confirm Bass Guitar by ear at 0:10 before the room starts./)).toBeNull();
    } finally {
      timeline.remove();
    }
  });
});

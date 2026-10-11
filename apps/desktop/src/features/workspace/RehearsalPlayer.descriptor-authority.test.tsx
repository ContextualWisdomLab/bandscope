import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

describe("RehearsalPlayer descriptor authority", () => {
  it("renders the admitted section snapshot instead of Proxy get values", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const expectedLabel = section.label;
    const expectedStart = section.timeRange.start;
    const expectedEnd = section.timeRange.end;
    song.sections = [
      new Proxy(section, {
        get(target, property, receiver) {
          if (property === "id") {
            return "proxy-injected-section";
          }
          if (property === "label") {
            return "outro";
          }
          if (property === "timeRange") {
            return { start: 90, end: 100 };
          }
          return Reflect.get(target, property, receiver);
        }
      })
    ];

    render(<RehearsalPlayer song={song} hasLocalAudio={true} />);

    expect(
      screen.getByRole("button", {
        name: new RegExp(`${expectedLabel}.*0:${String(expectedStart).padStart(2, "0")}.*0:${String(expectedEnd).padStart(2, "0")}`, "i")
      })
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /outro.*1:30.*1:40/i })).toBeNull();
  });
});

import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { expect, it, vi } from "vitest";
import { FirstEarCheckCallout } from "./FirstEarCheckCallout";

it("rejects a hostile song sections accessor without invoking it", () => {
  const song = createDemoRehearsalSong();
  const readSections = vi.fn(() => {
    throw new Error("hostile song sections getter");
  });
  Object.defineProperty(song, "sections", {
    configurable: true,
    enumerable: true,
    get: readSections
  });

  expect(() => render(<FirstEarCheckCallout song={song as RehearsalSong} />)).not.toThrow();
  expect(readSections).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      "Nothing still needs an ear check. Stay on tonight's map until a part is marked uncertain."
    )
  ).toBeTruthy();
});

it("uses the owned sections snapshot without invoking a proxy get trap", () => {
  const song = createDemoRehearsalSong();
  const readSections = vi.fn(() => {
    throw new Error("hostile sections get trap");
  });
  const proxiedSong = new Proxy(song, {
    get(target, property, receiver) {
      if (property === "sections") {
        return readSections();
      }
      return Reflect.get(target, property, receiver);
    }
  });

  expect(() => render(<FirstEarCheckCallout song={proxiedSong as RehearsalSong} />)).not.toThrow();
  expect(readSections).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Open Bass Guitar ear check at 0:10" })).toBeTruthy();
});

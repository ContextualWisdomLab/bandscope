import { describe, expect, it } from "vitest";
import { isNavigableView, resolveCurrentView } from "./lib/rehearsalViews";

describe("isNavigableView", () => {
  it("keeps placeholder destinations closed", () => {
    expect(isNavigableView(null, false)).toBe(false);
    expect(isNavigableView(null, true)).toBe(false);
  });

  it("opens workspace and Stem Lab without a song", () => {
    expect(isNavigableView("workspace", false)).toBe(true);
    expect(isNavigableView("stems", false)).toBe(true);
    expect(isNavigableView("score", false)).toBe(false);
  });

  it("opens Score only after a song exists", () => {
    expect(isNavigableView("score", true)).toBe(true);
    expect(isNavigableView("stems", true)).toBe(true);
  });
});

describe("resolveCurrentView", () => {
  it("falls back from Score when no song is loaded", () => {
    expect(resolveCurrentView("score", false)).toBe("workspace");
    expect(resolveCurrentView("score", true)).toBe("score");
  });

  it("keeps Stem Lab selected with or without a song", () => {
    expect(resolveCurrentView("stems", false)).toBe("stems");
    expect(resolveCurrentView("stems", true)).toBe("stems");
    expect(resolveCurrentView("workspace", true)).toBe("workspace");
  });
});

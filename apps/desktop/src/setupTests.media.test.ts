import { afterEach, describe, expect, it, vi } from "vitest";

describe("setupTests media element boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps HTMLMediaElement.load quiet in jsdom tests", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(vi.isMockFunction(HTMLMediaElement.prototype.load)).toBe(true);
    document.createElement("audio").load();

    expect(consoleError).not.toHaveBeenCalled();
  });
});

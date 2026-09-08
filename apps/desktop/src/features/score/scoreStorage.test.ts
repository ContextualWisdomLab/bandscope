import { afterEach, describe, expect, it, vi } from "vitest";
import { attachScorePdf, readScorePdf, removeScorePdf } from "./scoreStorage";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const BRIDGE_UNAVAILABLE_MESSAGE = "Score PDFs are only available in the desktop app.";
const INVALID_RESPONSE_MESSAGE = "Invalid score bridge response";

describe("scoreStorage bridge resolution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    const tauriWindow = window as TauriWindow;
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("fails closed on every command when there is no window (non-browser runtime)", async () => {
    // Simulate a runtime without a DOM window (e.g. SSR / bundler prerender):
    // getInvoke() must take the `typeof window === "undefined"` branch and
    // return null so callers fail closed instead of dereferencing `window`.
    vi.stubGlobal("window", undefined);

    await expect(attachScorePdf("project-1", "song-1")).rejects.toThrow(
      BRIDGE_UNAVAILABLE_MESSAGE
    );
    await expect(readScorePdf("project-1", "score-1")).rejects.toThrow(
      BRIDGE_UNAVAILABLE_MESSAGE
    );
    await expect(removeScorePdf("project-1", "score-1")).rejects.toThrow(
      BRIDGE_UNAVAILABLE_MESSAGE
    );
  });

  it("preserves exact bytes from a valid bridge array", async () => {
    (window as TauriWindow).__TAURI_INVOKE__ = vi.fn().mockResolvedValue([0, 1, 255]);

    await expect(readScorePdf("project-1", "score-1")).resolves.toEqual(
      new Uint8Array([0, 1, 255])
    );
  });

  it("accepts an empty bridge array", async () => {
    (window as TauriWindow).__TAURI_INVOKE__ = vi.fn().mockResolvedValue([]);

    await expect(readScorePdf("project-1", "score-1")).resolves.toEqual(new Uint8Array());
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative", -1],
    ["fractional", 1.5],
    ["greater than 255", 256],
    ["non-number", "1"]
  ])("rejects a %s bridge byte", async (_label, invalidByte) => {
    (window as TauriWindow).__TAURI_INVOKE__ = vi
      .fn()
      .mockResolvedValue([0, invalidByte, 255]);

    await expect(readScorePdf("project-1", "score-1")).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { attachScorePdf, readScorePdf, removeScorePdf } from "./scoreStorage";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const BRIDGE_UNAVAILABLE_MESSAGE = "Score PDFs are only available in the desktop app.";

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
});

describe("scoreStorage valid data coverage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    const tauriWindow = window as TauriWindow;
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("handles valid number array response in readScorePdf", async () => {
    const mockInvoke = vi.fn().mockResolvedValue([1, 2, 3]);
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INVOKE__ = mockInvoke;

    const result = await readScorePdf("p1", "s1");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it("handles invalid element in array response in readScorePdf", async () => {
    const mockInvoke = vi.fn().mockResolvedValue([1, "not-a-number", 3]);
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INVOKE__ = mockInvoke;

    await expect(readScorePdf("p1", "s1")).rejects.toThrow("Invalid score bridge response");
  });
});

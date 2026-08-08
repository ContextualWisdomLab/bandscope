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

  it("readScorePdf resolves a Uint8Array when response is an array of numbers", async () => {
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockImplementation((command) => {
      if (command === "read_score_pdf") {
        return Promise.resolve([1, 2, 3]);
      }
      return Promise.reject(new Error("Unexpected command"));
    });

    const result = await readScorePdf("project-1", "score-1");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
    expect(tauriWindow.__TAURI_INVOKE__).toHaveBeenCalledWith("read_score_pdf", { projectId: "project-1", scoreId: "score-1" });
  });

  it("readScorePdf throws when response is an array containing non-numbers, triggering early exit", async () => {
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockImplementation((command) => {
      if (command === "read_score_pdf") {
        return Promise.resolve([1, "2", 3]);
      }
      return Promise.reject(new Error("Unexpected command"));
    });

    await expect(readScorePdf("project-1", "score-1")).rejects.toThrow("Invalid score bridge response");
    expect(tauriWindow.__TAURI_INVOKE__).toHaveBeenCalledWith("read_score_pdf", { projectId: "project-1", scoreId: "score-1" });
  });
});

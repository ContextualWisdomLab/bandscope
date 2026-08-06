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

  it("throws INVALID_RESPONSE_MESSAGE when readScorePdf returns an array with non-number elements (early exit)", async () => {
    const mockInvoke = vi.fn().mockResolvedValue([1, 2, "not-a-number", 4]);
    const tauriWindow = {
      __TAURI_INVOKE__: mockInvoke
    } as unknown as TauriWindow;
    vi.stubGlobal("window", tauriWindow);

    await expect(readScorePdf("project-1", "score-1")).rejects.toThrow("Invalid score bridge response");
    expect(mockInvoke).toHaveBeenCalledWith("read_score_pdf", { projectId: "project-1", scoreId: "score-1" });
  });

  it.each([
    ["negative", -1],
    ["above the byte range", 256],
    ["fractional", 1.5],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY]
  ])("rejects %s numeric values before Uint8Array coercion", async (_label, invalidByte) => {
    const mockInvoke = vi.fn().mockResolvedValue([0, invalidByte, 255]);
    const tauriWindow = {
      __TAURI_INVOKE__: mockInvoke
    } as unknown as TauriWindow;
    vi.stubGlobal("window", tauriWindow);

    await expect(readScorePdf("project-1", "score-1")).rejects.toThrow("Invalid score bridge response");
    expect(mockInvoke).toHaveBeenCalledWith("read_score_pdf", { projectId: "project-1", scoreId: "score-1" });
  });

  it("returns Uint8Array when readScorePdf returns a valid number array", async () => {
    const mockInvoke = vi.fn().mockResolvedValue([1, 2, 3, 4]);
    const tauriWindow = {
      __TAURI_INVOKE__: mockInvoke
    } as unknown as TauriWindow;
    vi.stubGlobal("window", tauriWindow);

    const result = await readScorePdf("project-1", "score-1");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(mockInvoke).toHaveBeenCalledWith("read_score_pdf", { projectId: "project-1", scoreId: "score-1" });
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
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachScorePdf, readScorePdf, removeScorePdf } from "./scoreStorage";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const BRIDGE_UNAVAILABLE_MESSAGE = "Score PDFs are only available in the desktop app.";
const INVALID_RESPONSE_MESSAGE = "Invalid score bridge response";

function stubReadResponse(response: unknown): void {
  vi.stubGlobal("window", {
    __TAURI_INTERNALS__: {
      invoke: async () => response
    }
  });
}

describe("scoreStorage bridge resolution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    const tauriWindow = window as TauriWindow;
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("converts a validated numeric byte array without coercing its values", async () => {
    stubReadResponse([0, 1, 127, 254, 255]);

    const result = await readScorePdf("project-1", "score-1");

    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([0, 1, 127, 254, 255]);
  });

  it.each([
    ["string value", [104, "101", 108]],
    ["negative integer", [0, -1, 255]],
    ["integer above the byte range", [0, 256, 255]],
    ["fractional number", [0, 1.5, 255]],
    ["NaN", [0, Number.NaN, 255]],
    ["infinity", [0, Number.POSITIVE_INFINITY, 255]]
  ])("rejects a bridge array containing a %s", async (_label, response) => {
    stubReadResponse(response);

    await expect(readScorePdf("project-1", "score-1")).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
  });

  it("stops validating after the first invalid byte", async () => {
    const response: unknown[] = [-1, 0];
    Object.defineProperty(response, 1, {
      configurable: true,
      get: () => {
        throw new Error("validation read past the first invalid byte");
      }
    });
    stubReadResponse(response);

    await expect(readScorePdf("project-1", "score-1")).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
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

import { afterEach, describe, expect, it, vi } from "vitest";
import { attachScorePdf, readScorePdf, removeScorePdf } from "./scoreStorage";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const BRIDGE_UNAVAILABLE_MESSAGE = "Score PDFs are only available in the desktop app.";
const INVALID_RESPONSE_MESSAGE = "Invalid score bridge response";
const MAX_SCORE_BYTES = 25 * 1024 * 1024;
const OVERSIZED_SCORE_BYTES = MAX_SCORE_BYTES + 1;
const VALID_PROJECT_ID = "project-1-2";
const VALID_SONG_ID = "song-1";
const VALID_SCORE_ID = "6fa459ea-ee8a-4ca4-894e-db77e160355e";

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

    await expect(attachScorePdf(VALID_PROJECT_ID, VALID_SONG_ID)).rejects.toThrow(
      BRIDGE_UNAVAILABLE_MESSAGE
    );
    await expect(readScorePdf(VALID_PROJECT_ID, VALID_SCORE_ID)).rejects.toThrow(
      BRIDGE_UNAVAILABLE_MESSAGE
    );
    await expect(removeScorePdf(VALID_PROJECT_ID, VALID_SCORE_ID)).rejects.toThrow(
      BRIDGE_UNAVAILABLE_MESSAGE
    );
  });

  it("preserves valid attachment metadata from the bridge", async () => {
    (window as TauriWindow).__TAURI_INVOKE__ = vi.fn().mockResolvedValue({
      scoreId: VALID_SCORE_ID,
      fileName: "chart.pdf",
      fileSizeBytes: 2048
    });

    await expect(attachScorePdf(VALID_PROJECT_ID, VALID_SONG_ID)).resolves.toEqual({
      id: VALID_SCORE_ID,
      fileName: "chart.pdf",
      fileSizeBytes: 2048
    });
  });

  it.each(["project-1", "../project-1-2", "PROJECT-1-2", "project-1-2-extra"])(
    "rejects malformed project id before every score IPC: %s",
    async (projectId) => {
      const mockInvoke = vi.fn().mockResolvedValue({
        scoreId: VALID_SCORE_ID,
        fileName: "chart.pdf",
        fileSizeBytes: 2048
      });
      (window as TauriWindow).__TAURI_INVOKE__ = mockInvoke;

      await expect(attachScorePdf(projectId, VALID_SONG_ID)).rejects.toThrow(
        INVALID_RESPONSE_MESSAGE
      );
      await expect(readScorePdf(projectId, VALID_SCORE_ID)).rejects.toThrow(
        INVALID_RESPONSE_MESSAGE
      );
      await expect(removeScorePdf(projectId, VALID_SCORE_ID)).rejects.toThrow(
        INVALID_RESPONSE_MESSAGE
      );
      expect(mockInvoke).not.toHaveBeenCalled();
    }
  );

  it.each(["", " ", "\t"])(
    "rejects blank song id before attach IPC",
    async (songId) => {
      const mockInvoke = vi.fn().mockResolvedValue({
        scoreId: VALID_SCORE_ID,
        fileName: "chart.pdf",
        fileSizeBytes: 2048
      });
      (window as TauriWindow).__TAURI_INVOKE__ = mockInvoke;

      await expect(attachScorePdf(VALID_PROJECT_ID, songId)).rejects.toThrow(
        INVALID_RESPONSE_MESSAGE
      );
      expect(mockInvoke).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["empty score id", "", "chart.pdf"],
    ["non-canonical score id", "score-1", "chart.pdf"],
    ["uppercase score id", VALID_SCORE_ID.toUpperCase(), "chart.pdf"],
    ["empty file name", VALID_SCORE_ID, ""],
    ["whitespace-only file name", VALID_SCORE_ID, " \t "]
  ])("rejects %s attachment identity metadata", async (_label, scoreId, fileName) => {
    (window as TauriWindow).__TAURI_INVOKE__ = vi.fn().mockResolvedValue({
      scoreId,
      fileName,
      fileSizeBytes: 2048
    });

    await expect(attachScorePdf(VALID_PROJECT_ID, VALID_SONG_ID)).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative", -1],
    ["fractional", 1.5],
    ["zero", 0],
    ["oversized", OVERSIZED_SCORE_BYTES]
  ])("rejects %s attachment size metadata", async (_label, fileSizeBytes) => {
    (window as TauriWindow).__TAURI_INVOKE__ = vi.fn().mockResolvedValue({
      scoreId: VALID_SCORE_ID,
      fileName: "chart.pdf",
      fileSizeBytes
    });

    await expect(attachScorePdf(VALID_PROJECT_ID, VALID_SONG_ID)).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
  });

  it.each(["score-1", VALID_SCORE_ID.toUpperCase()])(
    "rejects malformed score id before read IPC: %s",
    async (scoreId) => {
      const mockInvoke = vi.fn().mockResolvedValue([37, 80, 68, 70, 45]);
      (window as TauriWindow).__TAURI_INVOKE__ = mockInvoke;

      await expect(readScorePdf(VALID_PROJECT_ID, scoreId)).rejects.toThrow(
        INVALID_RESPONSE_MESSAGE
      );
      expect(mockInvoke).not.toHaveBeenCalled();
    }
  );

  it.each(["score-1", VALID_SCORE_ID.toUpperCase()])(
    "rejects malformed score id before remove IPC: %s",
    async (scoreId) => {
      const mockInvoke = vi.fn().mockResolvedValue(true);
      (window as TauriWindow).__TAURI_INVOKE__ = mockInvoke;

      await expect(removeScorePdf(VALID_PROJECT_ID, scoreId)).rejects.toThrow(
        INVALID_RESPONSE_MESSAGE
      );
      expect(mockInvoke).not.toHaveBeenCalled();
    }
  );

  it("preserves exact bytes from a valid bridge array", async () => {
    (window as TauriWindow).__TAURI_INVOKE__ = vi.fn().mockResolvedValue([0, 1, 255]);

    await expect(readScorePdf(VALID_PROJECT_ID, VALID_SCORE_ID)).resolves.toEqual(
      new Uint8Array([0, 1, 255])
    );
  });

  it.each([
    ["array", () => []],
    ["Uint8Array", () => new Uint8Array()],
    ["ArrayBuffer", () => new ArrayBuffer(0)]
  ])("rejects an empty %s bridge response", async (_label, createResponse) => {
    (window as TauriWindow).__TAURI_INVOKE__ = vi.fn().mockResolvedValue(createResponse());

    await expect(readScorePdf(VALID_PROJECT_ID, VALID_SCORE_ID)).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
  });

  it("rejects an oversized bridge array before allocating or reading its bytes", async () => {
    const oversizedResponse = new Proxy(new Array(OVERSIZED_SCORE_BYTES), {
      get(target, property, receiver) {
        if (property !== "length") {
          throw new Error("oversized bridge payload should be rejected before byte access");
        }
        return Reflect.get(target, property, receiver);
      }
    });
    (window as TauriWindow).__TAURI_INVOKE__ = vi.fn().mockResolvedValue(oversizedResponse);

    await expect(readScorePdf(VALID_PROJECT_ID, VALID_SCORE_ID)).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
  });

  it.each([
    [
      "Uint8Array",
      () =>
        new Proxy(new Uint8Array(), {
          get(target, property) {
            if (property === "byteLength") {
              return OVERSIZED_SCORE_BYTES;
            }
            return Reflect.get(target, property, target);
          }
        })
    ],
    [
      "ArrayBuffer",
      () =>
        new Proxy(new ArrayBuffer(0), {
          get(target, property) {
            if (property === "byteLength") {
              return OVERSIZED_SCORE_BYTES;
            }
            return Reflect.get(target, property, target);
          }
        })
    ]
  ])("rejects an oversized %s bridge response", async (_label, createResponse) => {
    (window as TauriWindow).__TAURI_INVOKE__ = vi.fn().mockResolvedValue(createResponse());

    await expect(readScorePdf(VALID_PROJECT_ID, VALID_SCORE_ID)).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
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

    await expect(readScorePdf(VALID_PROJECT_ID, VALID_SCORE_ID)).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
  });
});
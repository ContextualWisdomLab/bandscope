import { afterEach, describe, expect, it, vi } from "vitest";
import { attachScorePdf, readScorePdf, removeScorePdf } from "./scoreStorage";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const BRIDGE_UNAVAILABLE_MESSAGE = "Score PDFs are only available in the desktop app.";
const INVALID_RESPONSE_MESSAGE = "Invalid score bridge response";
const MAX_SCORE_PDF_BYTES = 25 * 1024 * 1024;

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

  it("copies validated attach metadata from the same property reads", async () => {
    const reads = { scoreId: 0, fileName: 0, fileSizeBytes: 0 };
    const response = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(response, {
      scoreId: {
        enumerable: true,
        get: () => {
          reads.scoreId += 1;
          return reads.scoreId === 1 ? "score-1" : 42;
        }
      },
      fileName: {
        enumerable: true,
        get: () => {
          reads.fileName += 1;
          return reads.fileName === 1 ? "score.pdf" : null;
        }
      },
      fileSizeBytes: {
        enumerable: true,
        get: () => {
          reads.fileSizeBytes += 1;
          return reads.fileSizeBytes === 1 ? 512 : Number.NaN;
        }
      }
    });
    stubReadResponse(response);

    await expect(attachScorePdf("project-1", "song-1")).resolves.toEqual({
      id: "score-1",
      fileName: "score.pdf",
      fileSizeBytes: 512
    });
    expect(reads).toEqual({ scoreId: 1, fileName: 1, fileSizeBytes: 1 });
  });

  it.each([
    ["null response", null],
    ["primitive response", "score-1"]
  ])("rejects attach metadata with a %s", async (_label, response) => {
    stubReadResponse(response);

    await expect(attachScorePdf("project-1", "song-1")).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
  });

  it.each([
    ["negative size", -1],
    ["fractional size", 1.5],
    ["NaN size", Number.NaN],
    ["infinite size", Number.POSITIVE_INFINITY],
    ["unsafe integer size", Number.MAX_SAFE_INTEGER + 1],
    ["size above the Rust PDF cap", MAX_SCORE_PDF_BYTES + 1]
  ])("rejects attach metadata with a %s", async (_label, fileSizeBytes) => {
    stubReadResponse({ scoreId: "score-1", fileName: "score.pdf", fileSizeBytes });

    await expect(attachScorePdf("project-1", "song-1")).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
  });

  it("converts a validated numeric byte array without coercing its values", async () => {
    stubReadResponse([0, 1, 127, 254, 255]);

    const result = await readScorePdf("project-1", "score-1");

    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([0, 1, 127, 254, 255]);
  });

  it("copies each validated bridge byte during the same read", async () => {
    const response: unknown[] = [0];
    let reads = 0;
    Object.defineProperty(response, 0, {
      configurable: true,
      get: () => {
        reads += 1;
        return reads === 1 ? 255 : 256;
      }
    });
    stubReadResponse(response);

    const result = await readScorePdf("project-1", "score-1");

    expect(Array.from(result)).toEqual([255]);
    expect(reads).toBe(1);
  });

  it("snapshots the bridge array length before validating bytes", async () => {
    const backing: unknown[] = [1, 2];
    let lengthReads = 0;
    const response = new Proxy(backing, {
      get(target, property, receiver) {
        if (property === "length") {
          lengthReads += 1;
          return lengthReads === 1 ? 2 : 1;
        }
        return Reflect.get(target, property, receiver);
      }
    });
    stubReadResponse(response);

    const result = await readScorePdf("project-1", "score-1");

    expect(Array.from(result)).toEqual([1, 2]);
    expect(lengthReads).toBe(1);
  });

  it.each([
    ["NaN", Number.NaN],
    ["fractional", 1.5]
  ])("rejects a bridge array with a %s length before allocation", async (_label, length) => {
    const response = new Proxy([1, 2], {
      get(target, property, receiver) {
        if (property === "length") {
          return length;
        }
        return Reflect.get(target, property, receiver);
      }
    });
    stubReadResponse(response);

    await expect(readScorePdf("project-1", "score-1")).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
  });

  it("rejects a numeric bridge array above the Rust PDF cap before reading bytes", async () => {
    const response = new Proxy([] as unknown[], {
      get(target, property, receiver) {
        if (property === "length") {
          return MAX_SCORE_PDF_BYTES + 1;
        }
        if (property === "0") {
          throw new Error("oversized bridge payload was read");
        }
        return Reflect.get(target, property, receiver);
      }
    });
    stubReadResponse(response);

    await expect(readScorePdf("project-1", "score-1")).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
  });

  it("snapshots a Uint8Array bridge response before returning it", async () => {
    const response = new Uint8Array([1, 2]);
    stubReadResponse(response);

    const result = await readScorePdf("project-1", "score-1");
    response[0] = 9;

    expect(result).not.toBe(response);
    expect(Array.from(result)).toEqual([1, 2]);
  });

  it("rejects an oversized Uint8Array-shaped bridge response before copying", async () => {
    const response = new Proxy(new Uint8Array([1]), {
      get(target, property, receiver) {
        if (property === "byteLength") {
          return MAX_SCORE_PDF_BYTES + 1;
        }
        return Reflect.get(target, property, receiver);
      }
    });
    stubReadResponse(response);

    await expect(readScorePdf("project-1", "score-1")).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
  });

  it("snapshots an ArrayBuffer bridge response before returning its bytes", async () => {
    const response = new Uint8Array([3, 4]);
    stubReadResponse(response.buffer);

    const result = await readScorePdf("project-1", "score-1");
    response[0] = 9;

    expect(result.buffer).not.toBe(response.buffer);
    expect(Array.from(result)).toEqual([3, 4]);
  });

  it("rejects an oversized ArrayBuffer-shaped bridge response before copying", async () => {
    const response = new Proxy(new ArrayBuffer(1), {
      get(target, property, receiver) {
        if (property === "byteLength") {
          return MAX_SCORE_PDF_BYTES + 1;
        }
        return Reflect.get(target, property, receiver);
      }
    });
    stubReadResponse(response);

    await expect(readScorePdf("project-1", "score-1")).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
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

import { afterEach, expect, it, vi } from "vitest";

import { attachScorePdf, readScorePdf } from "./scoreStorage";

const INVALID_RESPONSE_MESSAGE = "Invalid score bridge response";
const MAX_SCORE_PDF_BYTES = 25 * 1024 * 1024;

function stubReadResponse(response: unknown): void {
  vi.stubGlobal("window", {
    __TAURI_INTERNALS__: {
      invoke: async () => response
    }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([0, 4])(
  "rejects attach metadata smaller than the Rust PDF magic boundary (%i bytes)",
  async (fileSizeBytes) => {
    stubReadResponse({ scoreId: "score-1", fileName: "score.pdf", fileSizeBytes });

    await expect(attachScorePdf("project-1", "song-1")).rejects.toThrow(
      INVALID_RESPONSE_MESSAGE
    );
  }
);

it.each([
  ["numeric array", [0, 1, 2, 3]],
  ["Uint8Array", new Uint8Array([0, 1, 2, 3])],
  ["ArrayBuffer", new Uint8Array([0, 1, 2, 3]).buffer]
])("rejects a %s bridge payload shorter than the PDF magic boundary", async (_label, response) => {
  stubReadResponse(response);

  await expect(readScorePdf("project-1", "score-1")).rejects.toThrow(
    INVALID_RESPONSE_MESSAGE
  );
});

it("rejects an oversized Uint8Array even when an own byteLength accessor lies", async () => {
  const response = new Uint8Array(MAX_SCORE_PDF_BYTES + 1);
  Object.defineProperty(response, "byteLength", {
    configurable: true,
    get: () => 5
  });
  stubReadResponse(response);

  await expect(readScorePdf("project-1", "score-1")).rejects.toThrow(
    INVALID_RESPONSE_MESSAGE
  );
});

it("rejects an oversized ArrayBuffer even when an own byteLength accessor lies", async () => {
  const response = new ArrayBuffer(MAX_SCORE_PDF_BYTES + 1);
  Object.defineProperty(response, "byteLength", {
    configurable: true,
    get: () => 5
  });
  stubReadResponse(response);

  await expect(readScorePdf("project-1", "score-1")).rejects.toThrow(
    INVALID_RESPONSE_MESSAGE
  );
});

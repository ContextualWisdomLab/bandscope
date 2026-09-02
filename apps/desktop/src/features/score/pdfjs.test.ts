import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { configureScorePdfWorker, loadScorePdf } from "./pdfjs";

vi.mock("pdfjs-dist", () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve(), destroy: vi.fn() })),
  GlobalWorkerOptions: { workerSrc: "" }
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "/assets/pdf.worker.min.mjs"
}));

describe("score PDF.js boundary", () => {
  beforeEach(() => {
    vi.mocked(getDocument).mockClear();
    GlobalWorkerOptions.workerSrc = "";
  });

  it("uses the locally bundled worker asset", () => {
    configureScorePdfWorker();

    expect(GlobalWorkerOptions.workerSrc).toBe("/assets/pdf.worker.min.mjs");

    configureScorePdfWorker();
    expect(GlobalWorkerOptions.workerSrc).toBe("/assets/pdf.worker.min.mjs");
  });

  it("translates semantic score PDF bytes to the vendor data field", () => {
    const scorePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    loadScorePdf(scorePdfBytes);

    expect(getDocument).toHaveBeenCalledTimes(1);
    const pdfDocumentParameters = vi.mocked(getDocument).mock.calls[0]?.[0];
    expect(pdfDocumentParameters).toBeTypeOf("object");
    expect(Object.keys(pdfDocumentParameters as object)).toEqual([
      "data",
      "enableXfa",
      "useWorkerFetch"
    ]);
    const hardenedPdfParameters = pdfDocumentParameters as {
      data: Uint8Array;
      enableXfa: boolean;
      useWorkerFetch: boolean;
    };
    expect(hardenedPdfParameters.data).toEqual(scorePdfBytes);
    expect(hardenedPdfParameters.data).not.toBe(scorePdfBytes);
    scorePdfBytes[0] = 0x00;
    expect(hardenedPdfParameters.data[0]).toBe(0x25);
    expect(hardenedPdfParameters.enableXfa).toBe(false);
    expect(hardenedPdfParameters.useWorkerFetch).toBe(false);
  });
});
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

  it("copies validated bytes through the supported data-only API", () => {
    const source = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    loadScorePdf(source);

    expect(getDocument).toHaveBeenCalledTimes(1);
    const parameters = vi.mocked(getDocument).mock.calls[0]?.[0];
    expect(parameters).toBeTypeOf("object");
    expect(Object.keys(parameters as object)).toEqual(["data"]);
    const copiedBytes = (parameters as { data: Uint8Array }).data;
    expect(copiedBytes).toEqual(source);
    expect(copiedBytes).not.toBe(source);
  });
});

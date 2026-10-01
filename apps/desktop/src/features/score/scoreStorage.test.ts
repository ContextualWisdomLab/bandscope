import { invoke } from "@tauri-apps/api/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachScorePdf, readScorePdf, removeScorePdf } from "./scoreStorage";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

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

describe("readScorePdf", () => {
  afterEach(() => {
    const tauriWindow = window as TauriWindow;
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("handles an array of bytes correctly", async () => {
    const mockInvoke = vi.fn().mockResolvedValue([1, 2, 3, 4]);
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INVOKE__ = mockInvoke;

    const result = await readScorePdf("project-1", "score-1");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("throws when array contains non-numbers", async () => {
    const mockInvoke = vi.fn().mockResolvedValue([1, "2", 3]);
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INVOKE__ = mockInvoke;

    await expect(readScorePdf("project-1", "score-1")).rejects.toThrow("Invalid score bridge response");
  });
});

describe("readScorePdf (more coverage)", () => {
  afterEach(() => {
    const tauriWindow = window as TauriWindow;
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("handles Uint8Array correctly", async () => {
    const mockInvoke = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INVOKE__ = mockInvoke;

    const result = await readScorePdf("project-1", "score-1");
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it("handles ArrayBuffer correctly", async () => {
    const mockInvoke = vi.fn().mockResolvedValue(new ArrayBuffer(4));
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INVOKE__ = mockInvoke;

    const result = await readScorePdf("project-1", "score-1");
    expect(result).toBeInstanceOf(Uint8Array);
  });
});

describe("attachScorePdf and removeScorePdf coverage", () => {
  afterEach(() => {
    const tauriWindow = window as TauriWindow;
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("handles attachScorePdf invalid response", async () => {
    const mockInvoke = vi.fn().mockResolvedValue({ scoreId: 123 }); // missing fields
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INVOKE__ = mockInvoke;

    await expect(attachScorePdf("project-1", "song-1")).rejects.toThrow("Invalid score bridge response");
  });

  it("handles attachScorePdf successful response", async () => {
    const mockInvoke = vi.fn().mockResolvedValue({ scoreId: "sc1", fileName: "f.pdf", fileSizeBytes: 100 });
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INVOKE__ = mockInvoke;

    const result = await attachScorePdf("project-1", "song-1");
    expect(result.id).toBe("sc1");
    expect(result.fileName).toBe("f.pdf");
    expect(result.fileSizeBytes).toBe(100);
  });

  it("handles removeScorePdf invalid response", async () => {
    const mockInvoke = vi.fn().mockResolvedValue("not a boolean");
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INVOKE__ = mockInvoke;

    await expect(removeScorePdf("project-1", "score-1")).rejects.toThrow("Invalid score bridge response");
  });

  it("handles removeScorePdf successful response", async () => {
    const mockInvoke = vi.fn().mockResolvedValue(true);
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INVOKE__ = mockInvoke;

    const result = await removeScorePdf("project-1", "score-1");
    expect(result).toBe(true);
  });
});

describe("getInvoke internals", () => {
  afterEach(() => {
    const tauriWindow = window as TauriWindow;
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
    vi.mocked(invoke).mockReset();
  });

  it("handles TAURI_INTERNALS mock without proper shape", async () => {
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INTERNALS__ = { invoke: "not a function" }; // Will fall through to TAURI_INVOKE check or null

    await expect(attachScorePdf("project-1", "song-1")).rejects.toThrow("Score PDFs are only available in the desktop app.");
  });

  it("handles TAURI_INTERNALS mock correctly", async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockResolvedValue({ scoreId: "sc1", fileName: "f.pdf", fileSizeBytes: 100 });
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INTERNALS__ = { invoke: mockInvoke };

    await expect(attachScorePdf("project-1", "song-1")).resolves.toEqual({
      id: "sc1",
      fileName: "f.pdf",
      fileSizeBytes: 100
    });
    expect(mockInvoke).toHaveBeenCalledWith("attach_score_pdf", {
      projectId: "project-1",
      songId: "song-1"
    });
  });
});

describe("readScorePdf early breaks", () => {
  afterEach(() => {
    const tauriWindow = window as TauriWindow;
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("handles valid arrays of numbers", async () => {
    const mockInvoke = vi.fn().mockResolvedValue([1, 2, 3]);
    const tauriWindow = window as TauriWindow;
    tauriWindow.__TAURI_INVOKE__ = mockInvoke;

    const result = await readScorePdf("project-1", "score-1");
    expect(result).toBeInstanceOf(Uint8Array);
  });
});

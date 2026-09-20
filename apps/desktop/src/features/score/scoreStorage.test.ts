import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachScorePdf,
  getScorePdfReceipt,
  readScorePdf,
  removeScorePdfIfReceiptMatches
} from "./scoreStorage";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const BRIDGE_UNAVAILABLE_MESSAGE = "Score PDFs are only available in the desktop app.";
const SCORE_ID = "3f2c8f0e-1a2b-4c3d-8e9f-001122334455";
const DIGEST = "ab".repeat(32);

describe("scoreStorage bridge resolution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    const tauriWindow = window as TauriWindow;
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("fails closed on every command when there is no window (non-browser runtime)", async () => {
    vi.stubGlobal("window", undefined);

    await expect(attachScorePdf("project-1", "song-1")).rejects.toThrow(
      BRIDGE_UNAVAILABLE_MESSAGE
    );
    await expect(readScorePdf("project-1", SCORE_ID)).rejects.toThrow(
      BRIDGE_UNAVAILABLE_MESSAGE
    );
    await expect(getScorePdfReceipt("project-1", SCORE_ID)).rejects.toThrow(
      BRIDGE_UNAVAILABLE_MESSAGE
    );
    await expect(
      removeScorePdfIfReceiptMatches("project-1", { scoreId: SCORE_ID, contentSha256: DIGEST })
    ).rejects.toThrow(BRIDGE_UNAVAILABLE_MESSAGE);
  });

  it("passes only path-free receipt identity through the detach bridge", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "get_score_pdf_receipt") {
        return { scoreId: SCORE_ID, contentSha256: DIGEST };
      }
      if (command === "remove_score_pdf_if_receipt_matches") {
        return true;
      }
      throw new Error(`unexpected command ${command}`);
    });
    (window as TauriWindow).__TAURI_INVOKE__ = invoke;

    const receipt = await getScorePdfReceipt("project-1", SCORE_ID);
    expect(receipt).toEqual({ scoreId: SCORE_ID, contentSha256: DIGEST });
    await expect(removeScorePdfIfReceiptMatches("project-1", receipt!)).resolves.toBe(true);

    expect(invoke).toHaveBeenNthCalledWith(1, "get_score_pdf_receipt", {
      projectId: "project-1",
      scoreId: SCORE_ID
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "remove_score_pdf_if_receipt_matches", {
      projectId: "project-1",
      scoreId: SCORE_ID,
      contentSha256: DIGEST
    });
  });

  it("rejects a receipt that does not bind the requested score id", async () => {
    (window as TauriWindow).__TAURI_INVOKE__ = vi.fn().mockResolvedValue({
      scoreId: "different-score-id",
      contentSha256: DIGEST
    });

    await expect(getScorePdfReceipt("project-1", SCORE_ID)).rejects.toThrow(
      "Invalid score bridge response"
    );
  });

  it("rejects malformed digest input before destructive bridge invocation", async () => {
    const invoke = vi.fn();
    (window as TauriWindow).__TAURI_INVOKE__ = invoke;

    await expect(
      removeScorePdfIfReceiptMatches("project-1", {
        scoreId: SCORE_ID,
        contentSha256: "not-a-sha256"
      })
    ).rejects.toThrow("Invalid score bridge response");
    expect(invoke).not.toHaveBeenCalled();
  });
});

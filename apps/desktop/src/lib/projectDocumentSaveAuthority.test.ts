import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { saveProjectDocument } from "./analysis";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: unknown;
};

const tauriWindow = window as TauriWindow;
const CONTENT_SHA256 =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const NEXT_CONTENT_SHA256 =
  "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

describe("project document save authority", () => {
  beforeEach(() => {
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("fails closed when browser preview has no durable project-save authority", async () => {
    await expect(
      saveProjectDocument({
        song: createDemoRehearsalSong(),
        preferences: { selectedPlaybackSource: "full_mix" }
      })
    ).rejects.toThrow("Local project save is not available in browser preview.");
  });

  it("forwards only an explicit project-id selector beside renderer-owned save state", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    tauriWindow.__TAURI_INVOKE__ = invoke;
    const document = {
      song: createDemoRehearsalSong(),
      preferences: { selectedPlaybackSource: "full_mix" as const }
    };

    await saveProjectDocument(document, "project-400-4");

    expect(invoke).toHaveBeenCalledWith("save_project", {
      payload: document,
      projectId: "project-400-4"
    });
  });

  it("carries the native workspace revision receipt into the next full-snapshot mutation", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(CONTENT_SHA256)
      .mockResolvedValueOnce(NEXT_CONTENT_SHA256);
    tauriWindow.__TAURI_INVOKE__ = invoke;
    const document = {
      song: createDemoRehearsalSong(),
      preferences: { selectedPlaybackSource: "full_mix" as const }
    };

    await saveProjectDocument(document, "project-400-5", true);
    await saveProjectDocument(document, "project-400-5", true);

    expect(invoke).toHaveBeenNthCalledWith(1, "save_project", {
      payload: document,
      projectId: "project-400-5",
      workspace: true
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "save_project", {
      payload: document,
      projectId: "project-400-5",
      workspace: true,
      expectedContentSha256: CONTENT_SHA256
    });
  });

  it("rejects a malformed native revision receipt instead of accepting renderer state", async () => {
    const invoke = vi.fn().mockResolvedValue("not-a-revision");
    tauriWindow.__TAURI_INVOKE__ = invoke;
    const document = {
      song: createDemoRehearsalSong(),
      preferences: { selectedPlaybackSource: "full_mix" as const }
    };

    await expect(saveProjectDocument(document, "project-400-6", true)).rejects.toThrow(
      "Invalid project save receipt"
    );
  });

  it("rejects renderer-authored source identity before persistence IPC", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    tauriWindow.__TAURI_INVOKE__ = invoke;

    await expect(
      saveProjectDocument({
        song: createDemoRehearsalSong(),
        preferences: { selectedPlaybackSource: "full_mix" },
        sourceReference: {
          projectId: "project-400-4",
          artifactName: "source.wav",
          extension: "wav",
          fileSizeBytes: 4096,
          contentSha256: CONTENT_SHA256
        }
      })
    ).rejects.toThrow("Invalid project document");

    expect(invoke).not.toHaveBeenCalled();
  });
});
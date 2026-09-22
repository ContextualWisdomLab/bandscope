import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import {
  loadProjectDocument,
  saveProjectDocument,
  type SelectedPlaybackSource
} from "./analysis";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: unknown;
};

const tauriWindow = window as TauriWindow;
const SOURCE_SEMANTICS: SelectedPlaybackSource[] = [
  "full_mix",
  "vocals",
  "bass",
  "drums",
  "other"
];
const CONTENT_SHA256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("project document bridge", () => {
  beforeEach(() => {
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it.each(SOURCE_SEMANTICS)(
    "persists the stable %s source semantic without serializing runtime authority",
    async (selectedPlaybackSource) => {
      const invoke = vi.fn().mockResolvedValue(undefined);
      tauriWindow.__TAURI_INVOKE__ = invoke;
      const song = createDemoRehearsalSong();

      await saveProjectDocument({
        song,
        preferences: { selectedPlaybackSource }
      });

      expect(invoke).toHaveBeenCalledWith("save_project", {
        payload: {
          song,
          preferences: { selectedPlaybackSource }
        }
      });
    }
  );

  it("rejects renderer-authored app-owned source evidence before persistence IPC", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    tauriWindow.__TAURI_INVOKE__ = invoke;
    const song = createDemoRehearsalSong();

    await expect(
      saveProjectDocument({
        song,
        preferences: { selectedPlaybackSource: "vocals" },
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

  it("binds a reopened app-owned document to the exact native workspace revision before returning it", async () => {
    const song = createDemoRehearsalSong();
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        song,
        preferences: { selectedPlaybackSource: "vocals" },
        sourceReference: {
          projectId: "project-400-4",
          artifactName: "source.flac",
          extension: "flac",
          fileSizeBytes: 8192,
          contentSha256: CONTENT_SHA256
        }
      })
      .mockResolvedValueOnce(CONTENT_SHA256);
    tauriWindow.__TAURI_INVOKE__ = invoke;

    await expect(loadProjectDocument()).resolves.toEqual({
      song,
      preferences: { selectedPlaybackSource: "vocals" },
      sourceReference: {
        projectId: "project-400-4",
        artifactName: "source.flac",
        extension: "flac",
        fileSizeBytes: 8192,
        contentSha256: CONTENT_SHA256
      }
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "load_project", undefined);
    expect(invoke).toHaveBeenNthCalledWith(2, "save_project", {
      payload: {
        song,
        preferences: { selectedPlaybackSource: "vocals" }
      },
      projectId: "project-400-4",
      workspace: true
    });
  });

  it("fails the reopen before renderer acceptance when native workspace bytes conflict", async () => {
    const song = createDemoRehearsalSong();
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        song,
        preferences: { selectedPlaybackSource: "full_mix" },
        sourceReference: {
          projectId: "project-400-5",
          artifactName: "source.wav",
          extension: "wav",
          fileSizeBytes: 4096,
          contentSha256: CONTENT_SHA256
        }
      })
      .mockRejectedValueOnce(new Error("Project changed since it was opened."));
    tauriWindow.__TAURI_INVOKE__ = invoke;

    await expect(loadProjectDocument()).rejects.toThrow("Project changed since it was opened.");
  });

  it("preserves the active workspace revision when a conflicting reopen is rejected", async () => {
    const projectId = "project-400-77";
    const song = createDemoRehearsalSong();
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(CONTENT_SHA256)
      .mockResolvedValueOnce({
        song,
        preferences: { selectedPlaybackSource: "full_mix" },
        sourceReference: {
          projectId,
          artifactName: "source.wav",
          extension: "wav",
          fileSizeBytes: 4096,
          contentSha256: CONTENT_SHA256
        }
      })
      .mockRejectedValueOnce(new Error("Project changed since it was opened."))
      .mockResolvedValueOnce(CONTENT_SHA256);
    tauriWindow.__TAURI_INVOKE__ = invoke;

    await saveProjectDocument(
      {
        song,
        preferences: { selectedPlaybackSource: "full_mix" }
      },
      projectId,
      true
    );
    await expect(loadProjectDocument()).rejects.toThrow("Project changed since it was opened.");
    await saveProjectDocument(
      {
        song,
        preferences: { selectedPlaybackSource: "full_mix" }
      },
      projectId,
      true
    );

    expect(invoke).toHaveBeenNthCalledWith(4, "save_project", {
      payload: {
        song,
        preferences: { selectedPlaybackSource: "full_mix" }
      },
      projectId,
      workspace: true,
      expectedContentSha256: CONTENT_SHA256
    });
  });

  it("does not manufacture workspace authority for a portable document without an app-owned source", async () => {
    const song = createDemoRehearsalSong();
    const invoke = vi.fn().mockResolvedValue({
      song,
      preferences: { selectedPlaybackSource: "drums" }
    });
    tauriWindow.__TAURI_INVOKE__ = invoke;

    await expect(loadProjectDocument()).resolves.toEqual({
      song,
      preferences: { selectedPlaybackSource: "drums" }
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("rejects a revocable playback authority returned across the project boundary", async () => {
    const song = createDemoRehearsalSong();
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockResolvedValue({
      song,
      preferences: {
        selectedPlaybackSource: "bandscope-playback://project-400-4/vocals?generation=7"
      }
    });

    await expect(loadProjectDocument()).rejects.toThrow("Invalid project document");
  });

  it("rejects user paths, missing digests, and mismatched app-owned source evidence", async () => {
    const song = createDemoRehearsalSong();
    for (const sourceReference of [
      {
        projectId: "../escape",
        artifactName: "source.wav",
        extension: "wav",
        fileSizeBytes: 4096,
        contentSha256: CONTENT_SHA256
      },
      {
        projectId: "project-400-4",
        artifactName: "../source.wav",
        extension: "wav",
        fileSizeBytes: 4096,
        contentSha256: CONTENT_SHA256
      },
      {
        projectId: "project-400-4",
        artifactName: "source.mp3",
        extension: "wav",
        fileSizeBytes: 4096,
        contentSha256: CONTENT_SHA256
      },
      {
        projectId: "project-400-4",
        artifactName: "source.wav",
        extension: "wav",
        fileSizeBytes: 4096,
        contentSha256: CONTENT_SHA256,
        sourcePath: "/Users/example/Music/private.wav"
      },
      {
        projectId: "project-400-4",
        artifactName: "source.wav",
        extension: "wav",
        fileSizeBytes: 4096
      },
      {
        projectId: "project-400-4",
        artifactName: "source.wav",
        extension: "wav",
        fileSizeBytes: 4096,
        contentSha256: "0123456789abcdef"
      },
      {
        projectId: "project-400-4",
        artifactName: "source.wav",
        extension: "wav",
        fileSizeBytes: 4096,
        contentSha256: "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF"
      }
    ]) {
      tauriWindow.__TAURI_INVOKE__ = vi.fn().mockResolvedValue({
        song,
        preferences: { selectedPlaybackSource: "full_mix" },
        sourceReference
      });

      await expect(loadProjectDocument()).rejects.toThrow("Invalid project document");
    }
  });

  it("rejects unknown preference fields instead of creating a second writable project contract", async () => {
    const song = createDemoRehearsalSong();
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockResolvedValue({
      song,
      preferences: {
        selectedPlaybackSource: "bass",
        runtimeAuthority: "bandscope-playback://project-400-4/bass?generation=7"
      }
    });

    await expect(loadProjectDocument()).rejects.toThrow("Invalid project document");
  });
});

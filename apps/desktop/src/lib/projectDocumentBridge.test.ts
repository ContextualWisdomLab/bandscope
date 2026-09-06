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

  it("returns the persisted source semantic and content identity with the reopened song", async () => {
    const song = createDemoRehearsalSong();
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockResolvedValue({
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

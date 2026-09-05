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

  it("persists only an app-owned source reference and never a user filesystem path", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    tauriWindow.__TAURI_INVOKE__ = invoke;
    const song = createDemoRehearsalSong();

    await saveProjectDocument({
      song,
      preferences: { selectedPlaybackSource: "vocals" },
      sourceReference: {
        projectId: "project-400-4",
        artifactName: "source.wav",
        extension: "wav",
        fileSizeBytes: 4096
      }
    });

    expect(invoke).toHaveBeenCalledWith("save_project", {
      payload: {
        song,
        preferences: { selectedPlaybackSource: "vocals" },
        sourceReference: {
          projectId: "project-400-4",
          artifactName: "source.wav",
          extension: "wav",
          fileSizeBytes: 4096
        }
      }
    });
    expect(JSON.stringify(invoke.mock.calls)).not.toContain("sourcePath");
  });

  it("returns the persisted source semantic with the reopened song", async () => {
    const song = createDemoRehearsalSong();
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockResolvedValue({
      song,
      preferences: { selectedPlaybackSource: "vocals" },
      sourceReference: {
        projectId: "project-400-4",
        artifactName: "source.flac",
        extension: "flac",
        fileSizeBytes: 8192
      }
    });

    await expect(loadProjectDocument()).resolves.toEqual({
      song,
      preferences: { selectedPlaybackSource: "vocals" },
      sourceReference: {
        projectId: "project-400-4",
        artifactName: "source.flac",
        extension: "flac",
        fileSizeBytes: 8192
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

  it("rejects user paths and mismatched app-owned artifact names in source references", async () => {
    const song = createDemoRehearsalSong();
    for (const sourceReference of [
      {
        projectId: "../escape",
        artifactName: "source.wav",
        extension: "wav",
        fileSizeBytes: 4096
      },
      {
        projectId: "project-400-4",
        artifactName: "../source.wav",
        extension: "wav",
        fileSizeBytes: 4096
      },
      {
        projectId: "project-400-4",
        artifactName: "source.mp3",
        extension: "wav",
        fileSizeBytes: 4096
      },
      {
        projectId: "project-400-4",
        artifactName: "source.wav",
        extension: "wav",
        fileSizeBytes: 4096,
        sourcePath: "/Users/example/Music/private.wav"
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

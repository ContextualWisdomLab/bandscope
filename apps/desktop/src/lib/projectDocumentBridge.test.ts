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

  it("returns the persisted source semantic with the reopened song", async () => {
    const song = createDemoRehearsalSong();
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockResolvedValue({
      song,
      preferences: { selectedPlaybackSource: "vocals" }
    });

    await expect(loadProjectDocument()).resolves.toEqual({
      song,
      preferences: { selectedPlaybackSource: "vocals" }
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

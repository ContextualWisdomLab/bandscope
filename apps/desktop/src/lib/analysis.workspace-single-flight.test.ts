import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveProject } from "./analysis";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: unknown;
};

const tauriWindow = window as TauriWindow;

describe("Project Persistence workspace mutation admission", () => {
  beforeEach(() => {
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("rejects an overlapping full-song workspace snapshot for the same project", async () => {
    let releaseFirstSave: (() => void) | undefined;
    const invoke = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirstSave = resolve;
          })
      )
      .mockResolvedValue(undefined);
    tauriWindow.__TAURI_INVOKE__ = invoke;

    const firstSong = createDemoRehearsalSong();
    const firstSave = saveProject(firstSong, "full_mix", "project-400-4", true);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));

    const staleSecondSong = {
      ...firstSong,
      title: "stale concurrent snapshot"
    };

    await expect(
      saveProject(staleSecondSong, "full_mix", "project-400-4", true)
    ).rejects.toThrow("Project update is already being saved.");
    expect(invoke).toHaveBeenCalledTimes(1);

    releaseFirstSave?.();
    await firstSave;
  });

  it("allows independent workspace saves for different project aggregates", async () => {
    let releaseFirstSave: (() => void) | undefined;
    const invoke = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirstSave = resolve;
          })
      )
      .mockResolvedValue(undefined);
    tauriWindow.__TAURI_INVOKE__ = invoke;

    const song = createDemoRehearsalSong();
    const firstSave = saveProject(song, "full_mix", "project-401-4", true);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));

    await expect(saveProject(song, "full_mix", "project-402-4", true)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(2);

    releaseFirstSave?.();
    await firstSave;
  });

  it("releases workspace admission after a failed native durability decision", async () => {
    const invoke = vi
      .fn()
      .mockRejectedValueOnce(new Error("native persistence failed"))
      .mockResolvedValue(undefined);
    tauriWindow.__TAURI_INVOKE__ = invoke;

    const song = createDemoRehearsalSong();
    await expect(saveProject(song, "full_mix", "project-403-4", true)).rejects.toThrow(
      "native persistence failed"
    );
    await expect(saveProject(song, "full_mix", "project-403-4", true)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("requires an app-owned project id before taking workspace mutation authority", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    tauriWindow.__TAURI_INVOKE__ = invoke;

    await expect(saveProject(createDemoRehearsalSong(), "full_mix", undefined, true)).rejects.toThrow(
      "Workspace project id is required."
    );
    expect(invoke).not.toHaveBeenCalled();
  });
});

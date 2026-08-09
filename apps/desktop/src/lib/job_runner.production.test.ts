import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import {
  cancelSong,
  enqueueSong,
  getWorkspaceState,
  retrySong,
  subscribeToWorkspaceUpdates,
} from "./job_runner";

describe("production analysis bridge boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["enqueue", () => enqueueSong({ sourceKind: "local_audio", sourceLabel: "song.wav" })],
    ["retry", () => retrySong("job-one")],
    ["cancel", () => cancelSong("job-one")],
  ])("fails closed for %s outside the Tauri runtime", async (_name, operation) => {
    await expect(operation()).rejects.toThrow("BandScope analysis requires the Tauri runtime");
  });

  it("does not manufacture browser workspace state", async () => {
    await expect(getWorkspaceState()).resolves.toBeNull();
  });

  it("allows a passive browser subscription without synthetic workspace events", async () => {
    const callback = vi.fn();
    const unsubscribe = await subscribeToWorkspaceUpdates(callback);

    expect(callback).not.toHaveBeenCalled();
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });
});

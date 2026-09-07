import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { getWorkspaceState } from "./job_runner";

const invokeMock = vi.mocked(invoke);

describe("workspace diagnostic privacy boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window.__TAURI_INVOKE__;
  });

  it("does not copy native error details into the browser console", async () => {
    invokeMock.mockRejectedValueOnce(
      new Error("workspace failed at C:\\Users\\Alice\\private.song token=super-secret")
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getWorkspaceState()).resolves.toBeNull();

    expect(consoleError).toHaveBeenCalledWith("Failed to get workspace state.");
    const rendered = consoleError.mock.calls.flat().join(" ");
    expect(rendered).not.toContain("Alice");
    expect(rendered).not.toContain("super-secret");
    expect(rendered).not.toContain("private.song");
    consoleError.mockRestore();
  });
});

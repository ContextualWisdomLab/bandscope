import { afterEach, describe, expect, it, vi } from "vitest";
import { copyFirstRangeAction } from "./copyFirstRangeAction";

const firstCheck = "Bass Guitar sits C#2–E3 in verse. Hear that clash on your instrument before the verse.";

/** jsdom no longer ships document.execCommand; install a local stub for the fallback path. */
function stubExecCommand(implementation: (commandId: string) => boolean) {
  const execCommand = vi.fn(implementation);
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    writable: true,
    value: execCommand
  });
  return execCommand;
}

describe("copyFirstRangeAction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "execCommand");
  });

  it("fails closed on blank or non-string payloads without touching the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(true);

    expect(await copyFirstRangeAction(null, { writeText })).toBe("unavailable");
    expect(await copyFirstRangeAction("", { writeText })).toBe("unavailable");
    expect(await copyFirstRangeAction("   ", { writeText })).toBe("unavailable");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("writes the exact first-check sentence through an injected writer", async () => {
    const writeText = vi.fn().mockResolvedValue(true);

    expect(await copyFirstRangeAction(firstCheck, { writeText })).toBe("copied");
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(firstCheck);
  });

  it("treats a rejected writer as unavailable without exposing the failure", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("/Users/md/secret-job.json"));

    expect(await copyFirstRangeAction(firstCheck, { writeText })).toBe("unavailable");
  });

  it("treats a false writer result as unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(false);

    expect(await copyFirstRangeAction(firstCheck, { writeText })).toBe("unavailable");
  });

  it("uses navigator.clipboard.writeText when no writer is injected", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    expect(await copyFirstRangeAction(firstCheck)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(firstCheck);
  });

  it("falls back to execCommand when the clipboard API is missing", async () => {
    const execCommand = stubExecCommand(() => true);
    vi.stubGlobal("navigator", {});

    expect(await copyFirstRangeAction(firstCheck)).toBe("copied");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.body.querySelector("textarea")).toBeNull();
  });

  it("reports unavailable when both clipboard surfaces fail", async () => {
    stubExecCommand(() => false);
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied"))
      }
    });

    expect(await copyFirstRangeAction(firstCheck)).toBe("unavailable");
  });

  it("reports unavailable when execCommand is absent after clipboard failure", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied"))
      }
    });

    expect(await copyFirstRangeAction(firstCheck)).toBe("unavailable");
  });
});

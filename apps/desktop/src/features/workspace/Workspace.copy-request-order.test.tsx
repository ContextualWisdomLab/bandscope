import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";

const originalLanguage = navigator.language;
const originalClipboard = navigator.clipboard;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function setNavigatorLanguage(language: string): void {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("Workspace copy request ordering", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard
    });
    Reflect.deleteProperty(document, "execCommand");
  });

  it("keeps the newest overlapping copy result when an older request finishes later", async () => {
    setNavigatorLanguage("en-US");
    const firstWrite = createDeferred<void>();
    const secondWrite = createDeferred<void>();
    const writeText = vi
      .fn()
      .mockImplementationOnce(() => firstWrite.promise)
      .mockImplementationOnce(() => secondWrite.promise);
    const execCommand = vi.fn().mockReturnValue(false);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
      writable: true
    });

    render(<Workspace song={createDemoRehearsalSong()} />);
    const copyButton = screen.getByRole("button", { name: "Copy tonight's first check" });
    fireEvent.click(copyButton);
    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledTimes(2);

    secondWrite.resolve();
    await waitFor(() => {
      expect(screen.getByTestId("first-range-copy-status")).toHaveTextContent(
        "Copied. Paste it in the band chat before the first section."
      );
    });

    firstWrite.reject(new Error("older clipboard request blocked"));
    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("first-range-copy-status")).toHaveTextContent(
      "Copied. Paste it in the band chat before the first section."
    );
  });

  it("does not apply a pending copy result after the displayed sentence changes", async () => {
    setNavigatorLanguage("en-US");
    const pendingWrite = createDeferred<void>();
    const writeText = vi.fn().mockImplementationOnce(() => pendingWrite.promise);
    const execCommand = vi.fn().mockReturnValue(false);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
      writable: true
    });

    render(<Workspace song={createDemoRehearsalSong()} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy tonight's first check" }));
    expect(writeText).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));
    expect(screen.getByTestId("first-range-squeeze")).toHaveTextContent(
      "Lead Vocal sits G#3–C#5 in verse. Hear that clash on your instrument before the verse."
    );
    expect(screen.getByTestId("first-range-copy-status")).toHaveTextContent("");

    pendingWrite.reject(new Error("stale clipboard request blocked"));
    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("first-range-copy-status")).toHaveTextContent("");
  });
});

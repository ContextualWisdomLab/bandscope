import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

// App mounts the Score surface, whose pdf.js bridge depends on browser canvas
// globals such as DOMMatrix that jsdom does not provide. This regression only
// exercises pre-network YouTube URL admission guidance.
vi.mock("./features/score/pdfjs", () => ({
  configureScorePdfWorker: vi.fn(),
  loadScorePdf: vi.fn(() => ({
    promise: Promise.resolve({ numPages: 1, getPage: vi.fn() }),
    destroy: vi.fn(() => Promise.resolve())
  }))
}));

const originalLanguage = navigator.language;
const originalInternals = window.__TAURI_INTERNALS__;
const originalInvoke = window.__TAURI_INVOKE__;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("App YouTube URL admission guidance", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    window.__TAURI_INTERNALS__ = originalInternals;
    window.__TAURI_INVOKE__ = originalInvoke;
  });

  it("uses format guidance for a URL rejected before any import attempt", async () => {
    setNavigatorLanguage("en-US");
    window.__TAURI_INTERNALS__ = undefined;
    window.__TAURI_INVOKE__ = undefined;

    render(<App />);
    const input = screen.getByRole("textbox", { name: /YouTube URL/i });
    fireEvent.change(input, { target: { value: "https://example.com/watch?v=abc123DEF45" } });
    fireEvent.click(screen.getByRole("button", { name: /Import YouTube/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Use a standard YouTube video link (youtube.com/watch or youtu.be).");
    expect(alert).not.toHaveTextContent(/check your connection/i);
  });
});

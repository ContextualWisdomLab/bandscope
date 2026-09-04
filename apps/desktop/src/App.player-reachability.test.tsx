import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./features/score/pdfjs", () => ({
  configureScorePdfWorker: vi.fn(),
  loadScorePdf: vi.fn(() => ({
    promise: Promise.resolve({ numPages: 1, getPage: vi.fn() }),
    destroy: vi.fn(() => Promise.resolve())
  }))
}));

vi.mock("./lib/analysis", async (importActual) => {
  const actual = await importActual<typeof import("./lib/analysis")>();

  return {
    ...actual,
    loadProject: vi.fn(async () => createDemoRehearsalSong())
  };
});

describe("App player reachability", () => {
  it("exposes the analyzed song's first-entrance guidance through the shipped Player view without a dead playback action", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    const playerButton = await screen.findByRole("button", { name: /^Player$/i });
    fireEvent.click(playerButton);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^Player$/i })).toBeTruthy();
    });
    expect(screen.getByText(/^Bass Guitar enters the verse at 0:10\./)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Hear Bass Guitar enter the verse at 0:10" })
    ).toBeNull();
  });
});

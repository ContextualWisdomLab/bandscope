import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./features/score/pdfjs", () => ({
  configureScorePdfWorker: vi.fn(),
  loadScorePdf: vi.fn(() => ({
    promise: Promise.resolve({ numPages: 1, getPage: vi.fn() }),
    destroy: vi.fn(() => Promise.resolve())
  }))
}));

it("keeps unavailable Save focusable without native-title-only help", () => {
  const languageSpy = vi.spyOn(window.navigator, "language", "get").mockReturnValue("en-US");

  try {
    render(<App />);

    const saveButton = screen.getByRole("button", { name: /save project/i });
    expect(saveButton).toHaveAttribute("aria-disabled", "true");
    expect(saveButton).not.toHaveAttribute("disabled");
    expect(saveButton).not.toHaveAttribute("title");

    const descriptionId = saveButton.getAttribute("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId!)).toHaveTextContent(
      "Analyze a song to enable saving"
    );

    fireEvent.click(saveButton);
    expect(saveButton).toHaveAttribute("aria-disabled", "true");
  } finally {
    languageSpy.mockRestore();
  }
});

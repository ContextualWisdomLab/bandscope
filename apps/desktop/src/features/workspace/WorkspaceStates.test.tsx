import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState, LoadingState, ErrorState } from "./WorkspaceStates";

describe("WorkspaceStates", () => {
  describe("EmptyState", () => {
    it("renders the empty state with correct title and text", () => {
      render(<EmptyState />);

      expect(screen.getByRole("heading", { name: "Ready to Analyze" })).toBeTruthy();
      expect(screen.getByText("Choose an audio file to prepare for your rehearsal.")).toBeTruthy();
    });
  });

  describe("LoadingState", () => {
    it("renders the loading state with correct title, text, and aria attributes", () => {
      render(<LoadingState />);

      const statusElement = screen.getByRole("status");
      expect(statusElement.getAttribute("aria-live")).toBe("polite");
      expect(statusElement.getAttribute("aria-atomic")).toBe("true");
      expect(statusElement.getAttribute("aria-busy")).toBe("true");

      expect(screen.getByRole("heading", { name: "Analyzing Audio" })).toBeTruthy();
      expect(screen.getByText("Analyzing the song's form and instrument roles...")).toBeTruthy();
    });
  });

  describe("ErrorState", () => {
    it("renders the error state with default message", () => {
      render(<ErrorState />);

      const alertElement = screen.getByRole("alert");
      expect(alertElement.getAttribute("aria-live")).toBe("assertive");
      expect(alertElement.getAttribute("aria-atomic")).toBe("true");

      expect(screen.getByRole("heading", { name: "An error occurred during analysis. Please try again." })).toBeTruthy();
    });

    it("renders the error state with custom error message", () => {
      const customError = "File format not supported";
      render(<ErrorState error={customError} />);

      expect(screen.getByText(customError)).toBeTruthy();
    });
  });
});

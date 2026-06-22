import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, LoadingState, ErrorState } from "./WorkspaceStates";

vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) => key,
  detectPreferredLocale: () => "en"
}));

describe("WorkspaceStates", () => {
  describe("EmptyState", () => {
    it("renders empty state correctly", () => {
      render(<EmptyState />);
      expect(screen.getByText("workspaceReadyToAnalyzeTitle")).toBeDefined();
      expect(screen.getByText("workspaceEmptyState")).toBeDefined();
      // check if music icon rendered
      expect(document.querySelector(".lucide-music")).toBeDefined();
    });
  });

  describe("LoadingState", () => {
    it("renders loading state correctly", () => {
      render(<LoadingState />);
      expect(screen.getByText("workspaceAnalyzingAudioTitle")).toBeDefined();
      expect(screen.getByText("workspaceLoadingState")).toBeDefined();
      expect(document.querySelector(".lucide-loader2")).toBeDefined();
    });

    it("has proper accessibility attributes", () => {
      render(<LoadingState />);
      const container = screen.getByRole("status");
      expect(container).toBeDefined();
      expect(container.getAttribute("aria-live")).toBe("polite");
      expect(container.getAttribute("aria-atomic")).toBe("true");
      expect(container.getAttribute("aria-busy")).toBe("true");
    });
  });

  describe("ErrorState", () => {
    it("renders default error state correctly", () => {
      render(<ErrorState />);
      expect(screen.getByText("workspaceErrorState")).toBeDefined();
      expect(document.querySelector(".lucide-alert-circle")).toBeDefined();
    });

    it("renders error message when provided", () => {
      const errorMessage = "Custom error occurred!";
      render(<ErrorState error={errorMessage} />);
      expect(screen.getByText("workspaceErrorState")).toBeDefined();
      expect(screen.getByText(errorMessage)).toBeDefined();
    });

    it("has proper accessibility attributes", () => {
      render(<ErrorState />);
      const container = screen.getByRole("alert");
      expect(container).toBeDefined();
      expect(container.getAttribute("aria-live")).toBe("assertive");
      expect(container.getAttribute("aria-atomic")).toBe("true");
    });
  });
});

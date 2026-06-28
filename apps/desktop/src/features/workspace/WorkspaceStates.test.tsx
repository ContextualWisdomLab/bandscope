import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoadingState } from "./WorkspaceStates";

vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) =>
    ({
      workspaceAnalyzingAudioTitle: "Analyzing Audio",
      workspaceLoadingState: "Please wait..."
    })[key] ?? key,
  detectPreferredLocale: () => "en"
}));

describe("WorkspaceStates", () => {
  describe("LoadingState", () => {
    it("renders with correct ARIA attributes", () => {
      render(<LoadingState />);
      const card = screen.getByRole("status");
      expect(card).toBeTruthy();
      expect(card.getAttribute("aria-live")).toBe("polite");
      expect(card.getAttribute("aria-atomic")).toBe("true");
      expect(card.getAttribute("aria-busy")).toBe("true");
    });

    it("displays the correct loading text", () => {
      render(<LoadingState />);
      expect(screen.getByRole("heading", { name: "Analyzing Audio" })).toBeTruthy();
      expect(screen.getByText("Please wait...")).toBeTruthy();
    });

    it("includes the loading spinner icon hidden from screen readers", () => {
      render(<LoadingState />);
      const loaderIcon = document.querySelector(".animate-spin");
      expect(loaderIcon).toBeTruthy();
      expect(loaderIcon?.getAttribute("aria-hidden")).toBe("true");
    });
  });
});

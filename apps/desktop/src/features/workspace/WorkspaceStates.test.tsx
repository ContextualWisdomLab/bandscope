import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { EmptyState, LoadingState, ErrorState } from "./WorkspaceStates";

const originalLanguage = navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("WorkspaceStates", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    vi.restoreAllMocks();
  });

  describe("EmptyState", () => {
    it("renders empty state with localized text correctly", () => {
      setNavigatorLanguage("en-US");
      render(<EmptyState />);

      expect(screen.getByRole("heading", { name: "Ready to Analyze" })).toBeTruthy();
      expect(screen.getByText("Choose an audio file to prepare for your rehearsal.")).toBeTruthy();
    });

    it("localizes empty state titles", () => {
      setNavigatorLanguage("ko-KR");
      render(<EmptyState />);

      expect(screen.getByRole("heading", { name: "분석 준비 완료" })).toBeTruthy();
      expect(screen.getByText("합주할 곡의 오디오 파일을 선택해주세요.")).toBeTruthy();
    });

    it("has aria-hidden icon for accessibility", () => {
      const { container } = render(<EmptyState />);
      const icon = container.querySelector('svg');
      expect(icon).toBeTruthy();
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
    });
  });

  describe("LoadingState", () => {
    it("renders loading state with localized text correctly", () => {
      setNavigatorLanguage("en-US");
      render(<LoadingState />);

      expect(screen.getByRole("heading", { name: "Analyzing Audio" })).toBeTruthy();
      expect(screen.getByText("Analyzing the song's form and instrument roles...")).toBeTruthy();
    });

    it("localizes loading state titles", () => {
      setNavigatorLanguage("ko-KR");
      render(<LoadingState />);

      expect(screen.getByRole("heading", { name: "오디오 분석 중" })).toBeTruthy();
      expect(screen.getByText("곡의 폼과 악기별 역할을 분석하고 있습니다...")).toBeTruthy();
    });

    it("includes proper aria attributes for loading status", () => {
      render(<LoadingState />);
      const card = screen.getByRole("status");
      expect(card).toBeTruthy();
      expect(card.getAttribute("aria-live")).toBe("polite");
      expect(card.getAttribute("aria-busy")).toBe("true");
    });
  });

  describe("ErrorState", () => {
    it("renders general error state with localized text correctly", () => {
      setNavigatorLanguage("en-US");
      render(<ErrorState />);

      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("heading", { name: "An error occurred during analysis. Please try again." })).toBeTruthy();
    });

    it("localizes general error state titles", () => {
      setNavigatorLanguage("ko-KR");
      render(<ErrorState />);

      expect(screen.getByRole("heading", { name: "분석 중 오류가 발생했습니다. 다시 시도해주세요." })).toBeTruthy();
    });

    it("renders specific error message when provided", () => {
      render(<ErrorState error="Connection timeout" />);
      expect(screen.getByText("Connection timeout")).toBeTruthy();
    });

    it("includes proper aria attributes for alert status", () => {
      render(<ErrorState />);
      const alert = screen.getByRole("alert");
      expect(alert.getAttribute("aria-live")).toBe("assertive");
      expect(alert.getAttribute("aria-atomic")).toBe("true");
    });
  });
});

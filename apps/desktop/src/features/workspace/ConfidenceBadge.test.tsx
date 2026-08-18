import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfidenceBadge } from "./ConfidenceBadge";

vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) =>
    ({
      confidenceLevelLow: "확신이 낮음",
      confidenceLevelMedium: "귀로 한 번 더 확인",
      confidenceLevelHigh: "믿고 가져가도 됨"
    })[key] ?? key,
  detectPreferredLocale: () => "ko"
}));

describe("ConfidenceBadge", () => {
  it("keeps the pointer tooltip on the localized confidence contract", () => {
    render(<ConfidenceBadge level="high" />);

    const badge = screen.getByText("믿고 가져가도 됨");
    expect(badge).toHaveAttribute("title", "믿고 가져가도 됨");
    expect(badge).not.toHaveAttribute("title", "Confidence: high");
  });

  it("mirrors the Figma compact and default size variants without changing existing call sites", () => {
    const { rerender } = render(<ConfidenceBadge level="low" />);

    expect(screen.getByText("확신이 낮음")).toHaveClass(
      "h-[var(--bandscope-confidence-compact-height)]"
    );

    rerender(<ConfidenceBadge level="low" size="default" />);

    expect(screen.getByText("확신이 낮음")).toHaveClass(
      "h-[var(--bandscope-confidence-default-height)]"
    );
  });
});

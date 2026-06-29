import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfidenceBadge } from "./ConfidenceBadge";

vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) =>
    ({
      confidenceLevelLow: "Low Confidence",
      confidenceLevelMedium: "Medium Confidence",
      confidenceLevelHigh: "High Confidence"
    })[key] ?? key,
  detectPreferredLocale: () => "en"
}));

describe("ConfidenceBadge", () => {
  it("renders a low confidence badge", () => {
    render(<ConfidenceBadge level="low" />);
    const badge = screen.getByText("Low Confidence");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-rose-100");
  });

  it("renders a medium confidence badge", () => {
    render(<ConfidenceBadge level="medium" />);
    const badge = screen.getByText("Medium Confidence");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-amber-100");
  });

  it("renders a high confidence badge", () => {
    render(<ConfidenceBadge level="high" />);
    const badge = screen.getByText("High Confidence");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-emerald-100");
  });
});

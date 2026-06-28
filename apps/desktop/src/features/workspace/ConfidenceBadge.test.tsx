import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfidenceBadge } from "./ConfidenceBadge";

vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) =>
    ({
      confidenceLevelLow: "Low Confidence",
      confidenceLevelMedium: "Medium Confidence",
      confidenceLevelHigh: "High Confidence",
    })[key] ?? key,
  detectPreferredLocale: () => "en",
}));

describe("ConfidenceBadge", () => {
  it.each([
    ["low", "Low Confidence", "bg-rose-100"],
    ["medium", "Medium Confidence", "bg-amber-100"],
    ["high", "High Confidence", "bg-emerald-100"],
  ] as const)("renders the %s confidence badge", (level, label, colorClass) => {
    render(<ConfidenceBadge level={level} />);

    const badge = screen.getByText(label);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass(colorClass);
    expect(badge).toHaveAttribute("title", `Confidence: ${level}`);
  });
});

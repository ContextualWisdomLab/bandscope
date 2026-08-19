import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("keeps confidence colors mapped to the live Figma 19:239 semantic status variables", () => {
    const tokenSource = readFileSync(
      resolve(process.cwd(), "src/styles/workspace-tokens.css"),
      "utf8"
    ).replace(/\s+/g, " ");

    expect(tokenSource).toContain("--bandscope-status-danger: #fda4af;");
    expect(tokenSource).toContain("--bandscope-status-danger-bg: #fda4af14;");
    expect(tokenSource).toContain("--bandscope-status-danger-border: #fda4af4d;");
    expect(tokenSource).toContain("--bandscope-status-warning: #fcd34d;");
    expect(tokenSource).toContain("--bandscope-status-warning-bg: #fcd34d12;");
    expect(tokenSource).toContain("--bandscope-status-warning-border: #fcd34d33;");
    expect(tokenSource).toContain("--bandscope-status-success: #6ee7b7;");
    expect(tokenSource).toContain("--bandscope-status-success-bg: #6ee7b712;");
    expect(tokenSource).toContain("--bandscope-status-success-border: #6ee7b733;");

    expect(tokenSource).toContain(
      "--bandscope-confidence-low-fg: var(--bandscope-status-danger);"
    );
    expect(tokenSource).toContain(
      "--bandscope-confidence-low-bg: var(--bandscope-status-danger-bg);"
    );
    expect(tokenSource).toContain(
      "--bandscope-confidence-low-border: var(--bandscope-status-danger-border);"
    );
    expect(tokenSource).toContain(
      "--bandscope-confidence-medium-fg: var(--bandscope-status-warning);"
    );
    expect(tokenSource).toContain(
      "--bandscope-confidence-medium-bg: var(--bandscope-status-warning-bg);"
    );
    expect(tokenSource).toContain(
      "--bandscope-confidence-medium-border: var(--bandscope-status-warning-border);"
    );
    expect(tokenSource).toContain(
      "--bandscope-confidence-high-fg: var(--bandscope-status-success);"
    );
    expect(tokenSource).toContain(
      "--bandscope-confidence-high-bg: var(--bandscope-status-success-bg);"
    );
    expect(tokenSource).toContain(
      "--bandscope-confidence-high-border: var(--bandscope-status-success-border);"
    );
  });
});

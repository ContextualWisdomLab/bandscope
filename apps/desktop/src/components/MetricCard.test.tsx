import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricCard } from "./MetricCard";

describe("MetricCard", () => {
  it("renders the label, value, and detail", () => {
    render(
      <MetricCard
        icon={<span data-testid="test-icon" />}
        label="TEST LABEL"
        value="TEST VALUE"
        detail="TEST DETAIL"
      />
    );

    expect(screen.getByText("TEST LABEL")).toBeInTheDocument();
    expect(screen.getByText("TEST VALUE")).toBeInTheDocument();
    expect(screen.getByText("TEST DETAIL")).toBeInTheDocument();
    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
  });

  it("applies the custom accent color", () => {
    render(
      <MetricCard
        icon={<span />}
        label="LABEL"
        value="VALUE"
        detail="DETAIL"
        accent="text-rose-500"
      />
    );

    // The parent div of the icon should have the accent class
    const iconContainer = screen.getByText("LABEL").parentElement?.parentElement?.firstChild as HTMLElement;
    expect(iconContainer.className).toContain("text-rose-500");
  });
});

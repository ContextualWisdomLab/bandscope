import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "./WorkspaceStates";

vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) =>
    ({
      workspaceErrorState: "Analysis Failed"
    })[key] ?? key,
  detectPreferredLocale: () => "en"
}));

describe("ErrorState", () => {
  it("renders the default error message when no error prop is provided", () => {
    render(<ErrorState />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Analysis Failed")).toBeInTheDocument();
  });

  it("renders the custom error message when the error prop is provided", () => {
    const customErrorMessage = "Custom error message regarding audio parsing";
    render(<ErrorState error={customErrorMessage} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Analysis Failed")).toBeInTheDocument();
    expect(screen.getByText(customErrorMessage)).toBeInTheDocument();
  });
});

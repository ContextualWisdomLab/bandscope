import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoadingState } from "./WorkspaceStates";

describe("LoadingState", () => {
  it("renders as a busy status region", () => {
    render(<LoadingState />);

    const card = screen.getByRole("status");
    expect(card).toHaveAttribute("aria-live", "polite");
    expect(card).toHaveAttribute("aria-atomic", "true");
    expect(card).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { name: "Analyzing Audio" })).toBeInTheDocument();
    expect(
      screen.getByText("Analyzing the song's form and instrument roles..."),
    ).toBeInTheDocument();
  });

  it("hides the scoped spinner from assistive tech", () => {
    render(<LoadingState />);

    const card = screen.getByRole("status");
    const spinner = card.querySelector(".animate-spin");
    expect(spinner).toHaveAttribute("aria-hidden", "true");
  });
});

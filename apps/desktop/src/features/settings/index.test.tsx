import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SettingsFeature } from "./index";

describe("SettingsFeature", () => {
  it("renders the title and sections", () => {
    render(<SettingsFeature title="Test Settings Title" />);

    expect(screen.getByRole("heading", { name: "Test Settings Title", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Supported Audio Formats", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Analysis Pipeline", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "About", level: 3 })).toBeInTheDocument();
    expect(screen.getByText(".wav")).toBeInTheDocument();
    expect(screen.getByText(/local-first rehearsal prep tool/i)).toBeInTheDocument();
  });
});

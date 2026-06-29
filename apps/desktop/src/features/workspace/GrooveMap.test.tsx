import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GrooveMap } from "./GrooveMap";

describe("GrooveMap", () => {
  it("renders a loading state", () => {
    render(<GrooveMap isLoading={true} />);
    expect(screen.getByText(/Checking the bass line/i)).toBeTruthy();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GrooveMap } from "./GrooveMap";

describe("GrooveMap", () => {
  it("renders nothing when data is empty", () => {
    const { container } = render(<GrooveMap data={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders timeline blocks correctly", () => {
    const mockData = [
      { pitch: "E1", start_time: 0.0, duration: 1.0 },
      { pitch: "A1", start_time: 1.0, duration: 2.0 }
    ];

    // maxTime = 1.0 + 2.0 = 3.0

    render(<GrooveMap data={mockData} />);

    const e1Block = screen.getByText("E1");
    const a1Block = screen.getByText("A1");

    expect(e1Block).toBeInTheDocument();
    expect(a1Block).toBeInTheDocument();

    // E1 title should include its time range
    expect(e1Block).toHaveAttribute("title", "E1 (0.00s - 1.00s)");

    // A1 title should include its time range
    expect(a1Block).toHaveAttribute("title", "A1 (1.00s - 3.00s)");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverlapWarningList } from "./OverlapWarningList";

describe("OverlapWarningList", () => {
  it("renders nothing when there are no clashes", () => {
    const { container } = render(<OverlapWarningList warnings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each clash so the next player action is visible", () => {
    render(<OverlapWarningList warnings={["Bass and vocal share C3", "Keys cover the guitar hook"]} />);
    expect(screen.getByRole("list", { name: "Clash warning" })).toBeTruthy();
    expect(screen.getByText("Bass and vocal share C3")).toBeTruthy();
    expect(screen.getByText("Keys cover the guitar hook")).toBeTruthy();
  });

  it("keeps repeated clash evidence distinct without duplicate React keys", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      render(<OverlapWarningList warnings={["Bass and vocal share C3", "Bass and vocal share C3"]} />);

      expect(screen.getAllByText("Bass and vocal share C3")).toHaveLength(2);
      expect(
        consoleError.mock.calls.some((call) => call.map(String).join(" ").includes("same key")),
      ).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});

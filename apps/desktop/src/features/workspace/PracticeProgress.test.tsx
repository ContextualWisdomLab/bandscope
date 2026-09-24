import { act, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PracticeProgress } from "./PracticeProgress";

vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) => key,
  detectPreferredLocale: () => "en-US",
}));

describe("PracticeProgress", () => {
  it("renders the minimum boundary with a persistent accessible reason", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress onChange={handleChange} />);

    expect(screen.getByText("0%")).toBeTruthy();
    const decreaseBtn = screen.getByRole("button", { name: "decreasePracticeProgressLabel" });
    expect(decreaseBtn).toHaveAttribute("aria-disabled", "true");
    expect(decreaseBtn).not.toHaveAttribute("title");

    const descriptionId = decreaseBtn.getAttribute("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId ?? "")).toHaveTextContent("practiceProgressAtMin");

    const clickEvent = createEvent.click(decreaseBtn);
    fireEvent(decreaseBtn, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("uses the visible practice-progress label as the slider accessible name", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={50} onChange={handleChange} />);

    expect(screen.getByRole("slider", { name: "practiceProgressLabel" })).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("shows the boundary tooltip on keyboard focus and dismisses it with Escape", async () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={0} onChange={handleChange} />);

    const decreaseBtn = screen.getByRole("button", { name: "decreasePracticeProgressLabel" });
    fireEvent.focus(decreaseBtn);

    expect(
      await screen.findByText("decreasePracticeProgressLabel: practiceProgressAtMin"),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(
        screen.queryByText("decreasePracticeProgressLabel: practiceProgressAtMin"),
      ).not.toBeInTheDocument();
    });
  });

  it("shows the action tooltip after pointer hover", async () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={50} onChange={handleChange} />);

    const increaseBtn = screen.getByRole("button", { name: "increasePracticeProgressLabel" });
    fireEvent.mouseMove(increaseBtn);

    expect(await screen.findByText("increasePracticeProgressLabel")).toBeInTheDocument();
  });

  it("changes progress from the increment and decrement controls", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={50} onChange={handleChange} />);

    fireEvent.click(screen.getByRole("button", { name: "increasePracticeProgressLabel" }));
    expect(handleChange).toHaveBeenLastCalledWith(60);

    fireEvent.click(screen.getByRole("button", { name: "decreasePracticeProgressLabel" }));
    expect(handleChange).toHaveBeenLastCalledWith(40);
  });

  it("clamps button changes to the 0-100 range", () => {
    const handleIncrease = vi.fn();
    const { rerender } = render(<PracticeProgress progress={95} onChange={handleIncrease} />);

    fireEvent.click(screen.getByRole("button", { name: "increasePracticeProgressLabel" }));
    expect(handleIncrease).toHaveBeenCalledWith(100);

    const handleDecrease = vi.fn();
    rerender(<PracticeProgress progress={5} onChange={handleDecrease} />);
    fireEvent.click(screen.getByRole("button", { name: "decreasePracticeProgressLabel" }));
    expect(handleDecrease).toHaveBeenCalledWith(0);
  });

  it("changes progress through the Base UI slider keyboard contract", async () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={50} onChange={handleChange} />);

    const slider = screen.getByRole("slider", { name: "practiceProgressLabel" });
    await act(async () => {
      slider.focus();
      fireEvent.keyDown(slider, { key: "ArrowRight", code: "ArrowRight" });
    });

    expect(handleChange).toHaveBeenCalledWith(51);
  });

  it("keeps 44 CSS px interaction envelopes without making the visible track oversized", () => {
    const handleChange = vi.fn();
    const { container } = render(<PracticeProgress progress={50} onChange={handleChange} />);

    const decreaseBtn = screen.getByRole("button", { name: "decreasePracticeProgressLabel" });
    const increaseBtn = screen.getByRole("button", { name: "increasePracticeProgressLabel" });
    const slider = screen.getByRole("slider", { name: "practiceProgressLabel" });
    const thumb = slider.parentElement;
    const control = container.querySelector('[data-slot="slider-control"]');
    const track = container.querySelector('[data-slot="slider-track"]');

    expect(decreaseBtn).toHaveClass("size-11");
    expect(increaseBtn).toHaveClass("size-11");
    expect(control).toHaveClass("h-11", "min-h-11");
    expect(track).toHaveClass("h-3");
    expect(track).not.toHaveClass("overflow-hidden");
    expect(thumb).toHaveClass("after:inset-[-12px]");
  });

  it("keeps focus on interactive controls instead of the progress region", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={50} onChange={handleChange} />);

    expect(screen.getByRole("region", { name: "practiceProgressRegionLabel" })).not.toHaveAttribute("tabindex");
    expect(screen.getByRole("slider", { name: "practiceProgressLabel" })).toBeInTheDocument();
  });

  it("keeps the maximum boundary focusable with a persistent accessible reason", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={100} onChange={handleChange} />);

    const increaseBtn = screen.getByRole("button", { name: "increasePracticeProgressLabel" });
    expect(increaseBtn).toHaveAttribute("aria-disabled", "true");
    expect(increaseBtn).not.toHaveAttribute("title");

    const descriptionId = increaseBtn.getAttribute("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId ?? "")).toHaveTextContent("practiceProgressAtMax");

    const clickEvent = createEvent.click(increaseBtn);
    fireEvent(increaseBtn, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(handleChange).not.toHaveBeenCalled();
  });
});

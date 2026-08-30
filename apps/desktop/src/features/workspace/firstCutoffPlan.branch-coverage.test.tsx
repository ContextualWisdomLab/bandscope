import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstCutoffPlanCallout } from "./FirstCutoffPlanCallout";
import { resolveFirstCutoffPlan } from "./firstCutoffPlan";

function installGlobalRenderer() {
  const grid = document.createElement("div");
  grid.dataset.testid = "song-structure-grid";
  const target = document.createElement("div");
  target.dataset.sectionIndex = "0";
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  grid.appendChild(target);
  document.body.appendChild(grid);
  return { grid, scrollIntoView };
}

describe("first cutoff plan branch contracts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.querySelectorAll('[data-testid="song-structure-grid"]').forEach((node) => node.remove());
  });

  it("keeps the lowest stable section id when the comparator receives descending ids", () => {
    const song = createDemoRehearsalSong();
    const first = structuredClone(song.sections[0]!);
    first.id = "a-cutoff";
    const second = structuredClone(first);
    second.id = "z-cutoff";
    song.sections = [first, second];

    expect(resolveFirstCutoffPlan(song)?.sectionId).toBe("a-cutoff");
  });

  it("uses smooth scrolling when matchMedia exists but reduced motion is not requested", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    const { grid, scrollIntoView } = installGlobalRenderer();

    render(<FirstCutoffPlanCallout song={createDemoRehearsalSong()} />);
    const action = screen.getByRole("button", { name: "Open Bass Guitar cutoff at 0:30" });
    vi.spyOn(Element.prototype, "closest").mockReturnValue(null);
    fireEvent.click(action);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    grid.remove();
  });

  it("fails closed when the owning workspace contains multiple song-structure renderers", () => {
    const { container } = render(
      <div>
        <FirstCutoffPlanCallout song={createDemoRehearsalSong()} />
        <div data-testid="song-structure-grid">
          <div data-section-index="0" />
        </div>
        <div data-testid="song-structure-grid">
          <div data-section-index="0" />
        </div>
      </div>
    );
    const targets = container.querySelectorAll<HTMLElement>('[data-section-index="0"]');
    const firstScrollIntoView = vi.fn();
    const secondScrollIntoView = vi.fn();
    Object.defineProperty(targets[0]!, "scrollIntoView", {
      configurable: true,
      value: firstScrollIntoView
    });
    Object.defineProperty(targets[1]!, "scrollIntoView", {
      configurable: true,
      value: secondScrollIntoView
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar cutoff at 0:30" }));

    expect(firstScrollIntoView).not.toHaveBeenCalled();
    expect(secondScrollIntoView).not.toHaveBeenCalled();
  });
});

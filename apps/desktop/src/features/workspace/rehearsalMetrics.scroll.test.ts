import { afterEach, describe, expect, it, vi } from "vitest";
import {
  preferredMetricScrollBehavior,
  scrollToWorkspaceSurface,
  WORKSPACE_SURFACE_HARMONY,
  WORKSPACE_SURFACE_TEMPO,
  WORKSPACE_SURFACE_TRANSPOSE
} from "./rehearsalMetrics";

describe("scrollToWorkspaceSurface", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("scrolls the first renderer-owned surface and uses reduced-motion auto scrolling", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    expect(preferredMetricScrollBehavior()).toBe("auto");

    const missing = document.createElement("div");
    missing.id = WORKSPACE_SURFACE_TRANSPOSE;
    const target = document.createElement("div");
    target.id = WORKSPACE_SURFACE_HARMONY;
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    document.body.append(missing, target);

    expect(
      scrollToWorkspaceSurface([
        "   ",
        WORKSPACE_SURFACE_TEMPO,
        WORKSPACE_SURFACE_TRANSPOSE,
        WORKSPACE_SURFACE_HARMONY
      ])
    ).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
  });

  it("uses smooth scrolling when reduced motion is not requested", () => {
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
    expect(preferredMetricScrollBehavior()).toBe("smooth");

    const target = document.createElement("div");
    target.id = WORKSPACE_SURFACE_TEMPO;
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    document.body.append(target);

    expect(scrollToWorkspaceSurface([WORKSPACE_SURFACE_TEMPO])).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("returns false when no renderer-owned surface can scroll", () => {
    expect(scrollToWorkspaceSurface([])).toBe(false);
    expect(scrollToWorkspaceSurface([WORKSPACE_SURFACE_TEMPO])).toBe(false);
    expect(preferredMetricScrollBehavior()).toBe("smooth");
  });

  it("skips a DOM node that cannot scroll", () => {
    const target = document.createElement("div");
    target.id = WORKSPACE_SURFACE_TEMPO;
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: undefined
    });
    document.body.append(target);
    expect(scrollToWorkspaceSurface([WORKSPACE_SURFACE_TEMPO])).toBe(false);
  });

  it("defaults to smooth scrolling when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(preferredMetricScrollBehavior()).toBe("smooth");
  });
});

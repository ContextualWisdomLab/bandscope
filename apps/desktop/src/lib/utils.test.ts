import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges basic classes", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("handles conditional classes", () => {
    const isTrue = true;
    const isFalse = false;
    expect(cn("a", isTrue && "b", isFalse && "c")).toBe("a b");
  });

  it("resolves tailwind conflicts", () => {
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
    expect(cn("px-2 py-1", "p-4")).toBe("p-4");
  });

  it("handles arrays and objects", () => {
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });

  it("handles falsy inputs", () => {
    expect(cn("a", null, undefined, "", 0, false)).toBe("a");
  });
});

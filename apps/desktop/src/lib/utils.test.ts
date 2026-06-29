import { describe, it, expect } from "vitest"
import { cn } from "./utils"

describe("cn", () => {
  it("merges basic class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("handles conditional classes", () => {
    const applyBar = true;
    const applyBaz = false;
    expect(cn("foo", applyBar && "bar", applyBaz && "baz")).toBe("foo bar")
  })

  it("merges arrays of class names", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar")
  })

  it("handles undefined, null, and empty strings gracefully", () => {
    expect(cn("foo", undefined, null, "", "bar")).toBe("foo bar")
  })

  it("merges tailwind classes intelligently", () => {
    expect(cn("p-4", "p-8")).toBe("p-8")
    expect(cn("px-2 py-4", "p-8")).toBe("p-8")
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500")
  })

  it("handles complex combinations of inputs", () => {
    expect(
      cn(
        "text-sm font-medium",
        ["flex", "items-center"],
        { "text-red-500": true, "bg-blue-200": false },
        "p-4",
        "p-8"
      )
    ).toBe("text-sm font-medium flex items-center text-red-500 p-8")
  })
})

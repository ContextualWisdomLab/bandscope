import { describe, expect, it } from "vitest"

import { cn } from "./utils"

describe("cn", () => {
  it("merges basic class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("handles conditional classes", () => {
    const activeClasses = new Set(["bar"])

    expect(cn("foo", activeClasses.has("bar") && "bar", activeClasses.has("baz") && "baz")).toBe(
      "foo bar",
    )
  })

  it("merges arrays of class names", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar")
  })

  it("ignores empty values", () => {
    expect(cn("foo", undefined, null, "", "bar")).toBe("foo bar")
  })

  it("lets later tailwind classes win", () => {
    expect(cn("p-4", "p-8")).toBe("p-8")
    expect(cn("px-2 py-4", "p-8")).toBe("p-8")
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500")
  })
})

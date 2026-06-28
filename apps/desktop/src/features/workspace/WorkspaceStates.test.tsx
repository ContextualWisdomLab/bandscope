import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ErrorState } from "./WorkspaceStates"

vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) =>
    ({
      workspaceErrorState: "Analysis Failed",
    })[key] ?? key,
  detectPreferredLocale: () => "en",
}))

describe("ErrorState", () => {
  it("renders the default error message without details", () => {
    render(<ErrorState />)

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByText("Analysis Failed")).toBeInTheDocument()
  })

  it("renders a custom error message when provided", () => {
    render(<ErrorState error="Custom error message regarding audio parsing" />)

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByText("Analysis Failed")).toBeInTheDocument()
    expect(screen.getByText("Custom error message regarding audio parsing")).toBeInTheDocument()
  })
})

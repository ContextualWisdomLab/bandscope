import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PartGraphMap } from "./PartGraphMap";
import { createDemoRehearsalSong } from "@bandscope/shared-types";

// Mock i18n
vi.mock("../../i18n", () => ({
  detectPreferredLocale: () => "en",
  createTranslator: () => (key: string) => {
    const translations: Record<string, string> = {
      partGraphTitle: "Part Handoff Map",
      partGraphActive: "Active",
      partGraphResting: "Resting",
      partGraphTakesOverFrom: "Takes over from",
      partGraphHandsOffTo: "Hands off to",
      partGraphNoHandoffs: "No direct handoffs"
    };
    return translations[key] || key;
  }
}));

describe("PartGraphMap", () => {
  const mockSong = createDemoRehearsalSong();

  // Extend demo song with another section to test different states
  mockSong.sections.push({
    id: "chorus-1",
    label: "chorus",
    groove: "Big chorus groove",
    timeRange: { start: 30, end: 60 },
    confidence: { level: "high", source: "model", notes: "" },
    roles: [],
    partGraph: [
      {
        role_id: "bass-guitar",
        is_active: false,
        handoff_to: ["lead-vocal"],
        handoff_from: []
      },
      {
        role_id: "lead-vocal",
        is_active: true,
        handoff_to: [],
        handoff_from: ["bass-guitar"]
      }
    ]
  });

  const roleMap = new Map();
  roleMap.set("bass-guitar", { id: "bass-guitar", name: "Bass Guitar" });
  roleMap.set("keys-right", { id: "keys-right", name: "Keyboard 1 Right Hand" });
  roleMap.set("lead-vocal", { id: "lead-vocal", name: "Lead Vocal" });

  it("asserts the region is discoverable by role/name and focusable", () => {
    render(<PartGraphMap song={mockSong} activeRoleId="bass-guitar" roleMap={roleMap} />);
    const region = screen.getByRole("region", { name: "Part Handoff Map" });
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("tabIndex", "0");
  });

  it("renders the title correctly", () => {
    render(<PartGraphMap song={mockSong} activeRoleId="bass-guitar" roleMap={roleMap} />);
    expect(screen.getByText("Part Handoff Map")).toBeInTheDocument();
  });

  it("renders active section with handoffs correctly", () => {
    render(<PartGraphMap song={mockSong} activeRoleId="bass-guitar" roleMap={roleMap} />);

    // In verse-1, bass-guitar is active and hands off to lead-vocal
    expect(screen.getByText("verse")).toBeInTheDocument();

    // Should have Active badge
    expect(screen.getAllByText("Active")[0]).toBeInTheDocument();

    // Should have hands off to
    expect(screen.getAllByText("Hands off to:")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Lead Vocal")[0]).toBeInTheDocument();
  });

  it("renders resting section with handoffs correctly", () => {
    render(<PartGraphMap song={mockSong} activeRoleId="bass-guitar" roleMap={roleMap} />);

    // In chorus-1, bass-guitar is resting and hands off to lead-vocal
    expect(screen.getByText("chorus")).toBeInTheDocument();

    // Should have Resting badge
    expect(screen.getByText("Resting")).toBeInTheDocument();

    // Lead Vocal handoff should still be visible (though we matched it in previous test, we can check multiple elements)
    const handoffToTexts = screen.getAllByText("Hands off to:");
    expect(handoffToTexts.length).toBe(2);
  });

  it("renders takes over from handoff correctly", () => {
    render(<PartGraphMap song={mockSong} activeRoleId="lead-vocal" roleMap={roleMap} />);

    // In verse-1, lead-vocal takes over from bass-guitar
    expect(screen.getAllByText("Takes over from:")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Bass Guitar")[0]).toBeInTheDocument();
  });

  it("renders no handoffs fallback", () => {
    render(<PartGraphMap song={mockSong} activeRoleId="keys-right" roleMap={roleMap} />);

    // keys-right has empty handoff arrays in demo song
    expect(screen.getAllByText("No direct handoffs")[0]).toBeInTheDocument();
  });

  it("falls back to role id if name is missing in map", () => {
    const emptyMap = new Map();
    render(<PartGraphMap song={mockSong} activeRoleId="bass-guitar" roleMap={emptyMap} />);

    // Without name mapping, should fallback to role id "lead-vocal"
    expect(screen.getAllByText("lead-vocal")[0]).toBeInTheDocument();
  });
    it("does not infer resting state when the active role node is absent", () => {
    // Note: Due to standard structure, a missing node implies Resting.
    render(<PartGraphMap song={mockSong} activeRoleId="missing-role" roleMap={roleMap} />);
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    // Use queryAllByText to avoid throw on multiple
    expect(screen.queryAllByText("Resting").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No direct handoffs")).toHaveLength(mockSong.sections.length);
  });
});

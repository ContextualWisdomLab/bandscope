import type { ButtonHTMLAttributes } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MetadataHandoffArtifact } from "@bandscope/shared-types";
import { App } from "./App";
import { importYoutubeUrl } from "./lib/analysis";
import { readMetadataHandoffFile } from "./lib/handoff";

vi.mock("./features/score/ScoreView", () => ({
  ScoreView: () => <div>Score view</div>
}));

vi.mock("./features/workspace/Workspace", () => ({
  Workspace: () => <div>Workspace result</div>
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} data-disabled={disabled ? "true" : "false"} />
  )
}));

vi.mock("./lib/analysis", () => ({
  MAX_YOUTUBE_URL_LENGTH: 2048,
  createDefaultAnalysisRequest: vi.fn(() => ({
    sourceKind: "demo",
    sourceLabel: "Late Night Set",
    roleFocus: ["keys-right"]
  })),
  getAnalysisJobStatus: vi.fn(),
  importYoutubeUrl: vi.fn(),
  isSupportedYoutubeUrl: vi.fn(() => true),
  loadProject: vi.fn(),
  saveProject: vi.fn(),
  selectLocalAudioSource: vi.fn(),
  startAnalysisJob: vi.fn(),
  subscribeToAnalysisJobUpdates: vi.fn(async () => () => undefined)
}));

vi.mock("./lib/handoff", async (importActual) => {
  const actual = await importActual<typeof import("./lib/handoff")>();
  return {
    ...actual,
    readMetadataHandoffFile: vi.fn()
  };
});

const mockedImportYoutubeUrl = vi.mocked(importYoutubeUrl);
const mockedReadMetadataHandoffFile = vi.mocked(readMetadataHandoffFile);

function handoff(): MetadataHandoffArtifact {
  return {
    artifactKind: "bandscope.metadata-handoff",
    artifactVersion: 1,
    createdAt: "2026-08-16T00:00:00.000Z",
    workspace: { id: "workspace-1", title: "Friday rehearsal", workspaceVersion: 1 },
    song: {
      id: "song-1",
      title: "Late Night Set",
      exportSummary: {
        format: "cue-sheet",
        headline: "Start with the chorus entrance.",
        focusSections: ["chorus"]
      }
    },
    sections: [
      {
        id: "chorus-1",
        label: "chorus",
        timeRange: { start: 0, end: 30 },
        confidence: { level: "high", source: "model", notes: "" },
        roleBuckets: [
          {
            id: "keys-right",
            name: "Keys Right",
            roleType: "instrument",
            confidence: { level: "high", source: "model", notes: "" },
            rehearsalPriority: "high"
          }
        ]
      }
    ],
    sourceAssets: []
  };
}

describe("App handoff YouTube defense in depth", () => {
  beforeEach(() => {
    mockedImportYoutubeUrl.mockReset();
    mockedReadMetadataHandoffFile.mockReset();
  });

  it("keeps the handler fail-closed if the UI disablement boundary is bypassed", async () => {
    mockedReadMetadataHandoffFile.mockResolvedValueOnce({
      ok: true,
      fileName: "handoff.json",
      artifact: handoff(),
      roleFocus: ["keys-right"]
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/youtube url/i), {
      target: { value: "https://youtu.be/abc123DEF45" }
    });
    const importButton = screen.getByRole("button", { name: /import youtube/i });

    fireEvent.change(screen.getByLabelText(/handoff JSON file/i), {
      target: {
        files: [new File(["{}"], "handoff.json", { type: "application/json" })]
      }
    });

    await screen.findByText("Friday rehearsal");
    expect(importButton).toHaveAttribute("data-disabled", "true");

    // The test Button deliberately records but does not enforce `disabled`,
    // modeling a compromised UI primitive. The handler must still reject the
    // stale YouTube action while validated handoff authority is pending.
    fireEvent.click(importButton);

    expect(mockedImportYoutubeUrl).not.toHaveBeenCalled();
  });
});

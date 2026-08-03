import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MetadataHandoffArtifact } from "@bandscope/shared-types";
import { HandoffImportControl } from "./HandoffImportControl";
import { readMetadataHandoffFile } from "../../lib/handoff";

vi.mock("../../lib/handoff", async (importActual) => {
  const actual = await importActual<typeof import("../../lib/handoff")>();
  return {
    ...actual,
    readMetadataHandoffFile: vi.fn()
  };
});

const mockedReadMetadataHandoffFile = vi.mocked(readMetadataHandoffFile);

function handoff(): MetadataHandoffArtifact {
  return {
    artifactKind: "bandscope.metadata-handoff",
    artifactVersion: 1,
    createdAt: "2026-08-03T03:20:00.000Z",
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
        id: "verse-1",
        label: "verse",
        timeRange: { start: 0, end: 30 },
        confidence: { level: "medium", source: "model", notes: "" },
        roleBuckets: [
          {
            id: "bass-guitar",
            name: "Bass Guitar",
            roleType: "instrument",
            confidence: { level: "high", source: "model", notes: "" },
            rehearsalPriority: "high"
          },
          {
            id: "lead-vocal",
            name: "Lead Vocal",
            roleType: "vocal",
            confidence: { level: "medium", source: "model", notes: "" },
            rehearsalPriority: "medium"
          }
        ]
      }
    ],
    sourceAssets: []
  };
}

function uploadFile(): File {
  return new File(["{}"], "friday-handoff.json", { type: "application/json" });
}

describe("HandoffImportControl", () => {
  beforeEach(() => {
    mockedReadMetadataHandoffFile.mockReset();
  });

  it("opens the hidden file picker from the visible import action", () => {
    render(
      <HandoffImportControl
        disabled={false}
        handoff={null}
        onHandoffChange={vi.fn()}
        onImportError={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/handoff JSON file/i) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => undefined);

    fireEvent.click(screen.getByRole("button", { name: /import handoff/i }));

    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it("opens an accessible JSON file picker and publishes a valid import", async () => {
    const onHandoffChange = vi.fn();
    const onImportError = vi.fn();
    mockedReadMetadataHandoffFile.mockResolvedValueOnce({
      ok: true,
      fileName: "friday-handoff.json",
      artifact: handoff(),
      roleFocus: ["bass-guitar", "lead-vocal"]
    });
    const { rerender } = render(
      <HandoffImportControl
        disabled={false}
        handoff={null}
        onHandoffChange={onHandoffChange}
        onImportError={onImportError}
      />
    );

    const input = screen.getByLabelText(/handoff JSON file/i);
    expect(input).toHaveAttribute("accept", ".json,application/json");
    fireEvent.change(input, { target: { files: [uploadFile()] } });

    await waitFor(() => {
      expect(onHandoffChange).toHaveBeenCalledWith(handoff());
    });
    expect(onImportError).toHaveBeenCalledWith(null);

    rerender(
      <HandoffImportControl
        disabled={false}
        handoff={handoff()}
        onHandoffChange={onHandoffChange}
        onImportError={onImportError}
      />
    );
    expect(screen.getByText("Friday rehearsal")).toBeTruthy();
    expect(screen.getByText(/Late Night Set · 2 focused roles/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /clear imported handoff/i })).toBeTruthy();
  });

  it("reports safe import failures without publishing state", async () => {
    const onHandoffChange = vi.fn();
    const onImportError = vi.fn();
    mockedReadMetadataHandoffFile.mockResolvedValueOnce({
      ok: false,
      code: "invalid_json"
    });
    render(
      <HandoffImportControl
        disabled={false}
        handoff={null}
        onHandoffChange={onHandoffChange}
        onImportError={onImportError}
      />
    );

    fireEvent.change(screen.getByLabelText(/handoff JSON file/i), {
      target: { files: [uploadFile()] }
    });

    await waitFor(() => {
      expect(onImportError).toHaveBeenCalledWith("invalid_json");
    });
    expect(onHandoffChange).not.toHaveBeenCalled();
  });

  it("ignores an empty picker result", () => {
    const onHandoffChange = vi.fn();
    const onImportError = vi.fn();
    render(
      <HandoffImportControl
        disabled={false}
        handoff={null}
        onHandoffChange={onHandoffChange}
        onImportError={onImportError}
      />
    );

    fireEvent.change(screen.getByLabelText(/handoff JSON file/i), {
      target: { files: [] }
    });

    expect(mockedReadMetadataHandoffFile).not.toHaveBeenCalled();
    expect(onHandoffChange).not.toHaveBeenCalled();
    expect(onImportError).not.toHaveBeenCalled();
  });

  it("clears the pending handoff and any related error", () => {
    const onHandoffChange = vi.fn();
    const onImportError = vi.fn();
    render(
      <HandoffImportControl
        disabled={false}
        handoff={handoff()}
        onHandoffChange={onHandoffChange}
        onImportError={onImportError}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /clear imported handoff/i }));

    expect(onHandoffChange).toHaveBeenCalledWith(null);
    expect(onImportError).toHaveBeenCalledWith(null);
  });

  it("disables both import and clear actions while analysis owns the source controls", () => {
    render(
      <HandoffImportControl
        disabled={true}
        handoff={handoff()}
        onHandoffChange={vi.fn()}
        onImportError={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /replace handoff/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /clear imported handoff/i })).toBeDisabled();
    expect(screen.getByLabelText(/handoff JSON file/i)).toBeDisabled();
  });

  it("shows bounded progress while the selected file is being validated", async () => {
    let resolveImport: ((value: Awaited<ReturnType<typeof readMetadataHandoffFile>>) => void) | null = null;
    mockedReadMetadataHandoffFile.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveImport = resolve;
      })
    );
    render(
      <HandoffImportControl
        disabled={false}
        handoff={null}
        onHandoffChange={vi.fn()}
        onImportError={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/handoff JSON file/i), {
      target: { files: [uploadFile()] }
    });
    expect(await screen.findByRole("button", { name: /validating handoff/i })).toBeDisabled();

    resolveImport?.({ ok: false, code: "invalid_artifact" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /import handoff/i })).not.toBeDisabled();
    });
  });
});

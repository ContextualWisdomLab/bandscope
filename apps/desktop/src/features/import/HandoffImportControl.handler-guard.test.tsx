import type { ButtonHTMLAttributes } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MetadataHandoffArtifact } from "@bandscope/shared-types";
import { HandoffImportControl } from "./HandoffImportControl";
import { readMetadataHandoffFile } from "../../lib/handoff";

vi.mock("@/components/ui/button", () => ({
  Button: ({ disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} data-disabled={disabled ? "true" : "false"} />
  )
}));

vi.mock("../../lib/handoff", async (importActual) => {
  const actual = await importActual<typeof import("../../lib/handoff")>();
  return {
    ...actual,
    readMetadataHandoffFile: vi.fn()
  };
});

const mockedReadMetadataHandoffFile = vi.mocked(readMetadataHandoffFile);

/** Return a valid pending handoff for stale-control tests. */
function pendingHandoff(): MetadataHandoffArtifact {
  return {
    artifactKind: "bandscope.metadata-handoff",
    artifactVersion: 1,
    createdAt: "2026-08-16T03:30:00.000Z",
    workspace: { id: "workspace-guard", title: "Guarded rehearsal", workspaceVersion: 1 },
    song: {
      id: "song-guard",
      title: "Guarded song",
      exportSummary: {
        format: "cue-sheet",
        headline: "Preserve the active source transition.",
        focusSections: ["chorus"]
      }
    },
    sections: [],
    sourceAssets: []
  };
}

/** Return one browser-owned JSON file for stale picker tests. */
function uploadFile(): File {
  return new File(["{}"], "stale-handoff.json", { type: "application/json" });
}

describe("HandoffImportControl handler guards", () => {
  beforeEach(() => {
    mockedReadMetadataHandoffFile.mockReset();
  });

  it("rejects a bypassed picker-open action while the control is disabled", () => {
    render(
      <HandoffImportControl
        disabled={true}
        handoff={null}
        onHandoffChange={vi.fn()}
        onImportError={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/handoff JSON file/i) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => undefined);
    const importButton = screen.getByRole("button", { name: /import handoff/i });
    expect(importButton).toHaveAttribute("data-disabled", "true");

    fireEvent.click(importButton);

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("rejects a stale file-change event after the parent disables handoff import", () => {
    const onHandoffChange = vi.fn();
    const onImportError = vi.fn();
    const { rerender } = render(
      <HandoffImportControl
        disabled={false}
        handoff={null}
        onHandoffChange={onHandoffChange}
        onImportError={onImportError}
      />
    );

    const input = screen.getByLabelText(/handoff JSON file/i) as HTMLInputElement;
    rerender(
      <HandoffImportControl
        disabled={true}
        handoff={null}
        onHandoffChange={onHandoffChange}
        onImportError={onImportError}
      />
    );
    expect(input).toBeDisabled();

    // A browser/custom shell can deliver a picker result after the parent state
    // changed. Remove only the DOM enforcement so the component handler remains
    // the final authority for the current disabled prop.
    input.disabled = false;
    fireEvent.change(input, { target: { files: [uploadFile()] } });

    expect(mockedReadMetadataHandoffFile).not.toHaveBeenCalled();
    expect(onHandoffChange).not.toHaveBeenCalled();
    expect(onImportError).not.toHaveBeenCalled();
  });

  it("rejects a bypassed clear action while the control is disabled", () => {
    const onHandoffChange = vi.fn();
    const onImportError = vi.fn();
    render(
      <HandoffImportControl
        disabled={true}
        handoff={pendingHandoff()}
        onHandoffChange={onHandoffChange}
        onImportError={onImportError}
      />
    );

    const clearButton = screen.getByRole("button", { name: /clear imported handoff/i });
    expect(clearButton).toHaveAttribute("data-disabled", "true");

    fireEvent.click(clearButton);

    expect(onHandoffChange).not.toHaveBeenCalled();
    expect(onImportError).not.toHaveBeenCalled();
  });
});
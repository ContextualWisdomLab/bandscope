import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { parseProjectDocument } from "./projectDocument";

class ProjectDocumentWithPrototype {
  song = createDemoRehearsalSong();
  preferences = { selectedPlaybackSource: "vocals" };
}

class ProjectPreferencesWithPrototype {
  selectedPlaybackSource = "vocals";
}

describe("project document plain-record admission", () => {
  it("rejects a project document with a custom prototype before persistence IPC", () => {
    expect(() => parseProjectDocument(new ProjectDocumentWithPrototype())).toThrow(
      "Invalid project document"
    );
  });

  it("rejects custom-prototype preferences even when the outer document is plain", () => {
    expect(() =>
      parseProjectDocument({
        song: createDemoRehearsalSong(),
        preferences: new ProjectPreferencesWithPrototype()
      })
    ).toThrow("Invalid project document");
  });

  it("continues to admit ordinary JSON-shaped project documents", () => {
    const song = createDemoRehearsalSong();
    expect(
      parseProjectDocument({
        song,
        preferences: { selectedPlaybackSource: "vocals" }
      })
    ).toEqual({
      song,
      preferences: { selectedPlaybackSource: "vocals" }
    });
  });
});

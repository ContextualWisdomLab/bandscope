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

  it("fails closed when prototype inspection itself throws", () => {
    const trappedDocument = new Proxy(
      {
        song: createDemoRehearsalSong(),
        preferences: { selectedPlaybackSource: "vocals" }
      },
      {
        getPrototypeOf() {
          throw new Error("prototype trap");
        }
      }
    );

    expect(() => parseProjectDocument(trappedDocument)).toThrow("Invalid project document");
  });

  it("fails closed with the public contract when own-key enumeration throws", () => {
    const trappedDocument = new Proxy(
      {
        song: createDemoRehearsalSong(),
        preferences: { selectedPlaybackSource: "vocals" }
      },
      {
        ownKeys() {
          throw new Error("own-key trap");
        }
      }
    );

    expect(() => parseProjectDocument(trappedDocument)).toThrow("Invalid project document");
  });

  it("rejects accessor-backed preference fields without invoking the accessor", () => {
    let getterCalls = 0;
    const document = {
      song: createDemoRehearsalSong()
    } as Record<string, unknown>;
    Object.defineProperty(document, "preferences", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("preference getter must not run");
      }
    });

    expect(() => parseProjectDocument(document)).toThrow("Invalid project document");
    expect(getterCalls).toBe(0);
  });

  it("rejects accessor-backed selected-source fields without invoking the accessor", () => {
    let getterCalls = 0;
    const preferences = {} as Record<string, unknown>;
    Object.defineProperty(preferences, "selectedPlaybackSource", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("selected source getter must not run");
      }
    });

    expect(() =>
      parseProjectDocument({
        song: createDemoRehearsalSong(),
        preferences
      })
    ).toThrow("Invalid project document");
    expect(getterCalls).toBe(0);
  });

  it("admits null-prototype JSON records without widening the durable field set", () => {
    const song = createDemoRehearsalSong();
    const preferences = Object.assign(Object.create(null) as Record<string, unknown>, {
      selectedPlaybackSource: "bass"
    });
    const document = Object.assign(Object.create(null) as Record<string, unknown>, {
      song,
      preferences
    });

    expect(parseProjectDocument(document)).toEqual({
      song,
      preferences: { selectedPlaybackSource: "bass" }
    });
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

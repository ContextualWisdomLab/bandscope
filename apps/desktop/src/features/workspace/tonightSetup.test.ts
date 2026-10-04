import { describe, expect, it } from "vitest";
import * as tonightSetup from "./tonightSetup";

describe("earliest analyzed note for tonight's setup", () => {
  it("finds an earlier attack in unsorted analysis without mutating the notes", () => {
    const later = { pitch: "A2", onset: 8, offset: 9, velocity: 0.7 };
    const earliest = { pitch: "E2", onset: 1, offset: 2, velocity: 0.7 };
    const notes = [later, earliest];
    const snapshot = structuredClone(notes);

    expect(tonightSetup).toHaveProperty("earliestAnalyzedNote", expect.any(Function));
    expect(tonightSetup.earliestAnalyzedNote(notes)).toBe(earliest);
    expect(notes).toEqual(snapshot);
    expect(notes[0]).toBe(later);
    expect(notes[1]).toBe(earliest);
  });

  it("has no first attack when analysis is absent", () => {
    expect(tonightSetup.earliestAnalyzedNote(undefined)).toBeUndefined();
  });

  it("has no first attack when analysis contains no notes", () => {
    expect(tonightSetup.earliestAnalyzedNote([])).toBeUndefined();
  });

  it("retains the only analyzed note by reference", () => {
    const note = { pitch: "E2", onset: 1, offset: 2, velocity: 0.7 };
    expect(tonightSetup.earliestAnalyzedNote([note])).toBe(note);
  });

  it("retains the first analyzed note when attacks are already sorted", () => {
    const earliest = { pitch: "E2", onset: 1, offset: 2, velocity: 0.7 };
    const later = { pitch: "A2", onset: 8, offset: 9, velocity: 0.7 };
    expect(tonightSetup.earliestAnalyzedNote([earliest, later])).toBe(earliest);
  });

  it("retains the first encountered earliest attack when onsets tie without mutating analysis", () => {
    const later = { pitch: "A2", onset: 8, offset: 9, velocity: 0.7 };
    const earliest = { pitch: "E2", onset: 1, offset: 2, velocity: 0.7 };
    const tied = { pitch: "G2", onset: 1, offset: 3, velocity: 0.8 };
    const notes = [later, earliest, tied];
    const snapshot = structuredClone(notes);
    notes.forEach(Object.freeze);
    Object.freeze(notes);

    expect(tonightSetup.earliestAnalyzedNote(notes)).toBe(earliest);
    expect(notes).toEqual(snapshot);
    expect(notes[0]).toBe(later);
    expect(notes[2]).toBe(tied);
  });
});

describe("capability-bound tonight's setup activation", () => {
  it("does not activate a setup without a selected role", () => {
    let activations = 0;

    expect(tonightSetup).toHaveProperty("activateTonightSetup", expect.any(Function));
    tonightSetup.activateTonightSetup({
      roleId: null,
      canArmTonightSetup: true,
      onActivate: () => { activations += 1; }
    });

    expect(activations).toBe(0);
  });

  it("does not activate a setup for an empty selected role id", () => {
    let activations = 0;
    tonightSetup.activateTonightSetup({
      roleId: "",
      canArmTonightSetup: true,
      onActivate: () => { activations += 1; }
    });
    expect(activations).toBe(0);
  });

  it("does not activate a selected role without setup capability", () => {
    let activations = 0;
    tonightSetup.activateTonightSetup({
      roleId: "bass-guitar",
      canArmTonightSetup: false,
      onActivate: () => { activations += 1; }
    });
    expect(activations).toBe(0);
  });

  it("does not activate when both role selection and setup capability are absent", () => {
    let activations = 0;
    tonightSetup.activateTonightSetup({
      roleId: null,
      canArmTonightSetup: false,
      onActivate: () => { activations += 1; }
    });
    expect(activations).toBe(0);
  });

  it("activates a capable selected role exactly once per command", () => {
    let activations = 0;
    const command = {
      roleId: "bass-guitar",
      canArmTonightSetup: true,
      onActivate: () => { activations += 1; }
    };
    Object.freeze(command);

    tonightSetup.activateTonightSetup(command);

    expect(activations).toBe(1);
    expect(command.roleId).toBe("bass-guitar");
    expect(command.canArmTonightSetup).toBe(true);
  });
});

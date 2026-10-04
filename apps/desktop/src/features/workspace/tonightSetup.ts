import type { RehearsalRole } from "@bandscope/shared-types";

type TranscriptionNote = NonNullable<RehearsalRole["transcription"]>[number];

/** Return the earliest analyzed note so setup can name the first attack. */
export function earliestAnalyzedNote(notes: RehearsalRole["transcription"]): TranscriptionNote | undefined {
  if (!notes || notes.length === 0) {
    return undefined;
  }

  let earliest = notes[0]!;
  for (const note of notes) {
    if (note.onset < earliest.onset) {
      earliest = note;
    }
  }
  return earliest;
}

interface TonightSetupActivation {
  roleId: string | null;
  canArmTonightSetup: boolean;
  onActivate: () => void;
}

/** Activate the selected part's setup only when its setup/start evidence permits it. */
export function activateTonightSetup({ roleId, canArmTonightSetup, onActivate }: TonightSetupActivation): void {
  if (!roleId || !canArmTonightSetup) {
    return;
  }
  onActivate();
}

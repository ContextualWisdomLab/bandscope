import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { Workspace } from "./Workspace";

/**
 * Build a Late Night Set with a repeated verse before the chorus so Storybook
 * can show display-unique lock-in pairs instead of two identical verse lines.
 */
function createLateNightSetWithRepeatedVerse(): RehearsalSong {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: 30, end: 50 };
  chorus.roles = chorus.roles.map((role) => ({
    ...role,
    rehearsalPriority: role.id === "lead-vocal" ? "high" : "low"
  }));
  const verseRepeat = structuredClone(verse);
  verseRepeat.id = "verse-2";
  verseRepeat.timeRange = { start: 50, end: 70 };
  song.sections = [verse, verseRepeat, chorus];
  return song;
}

/**
 * Build a song with no priority roles and no focus sections so the empty
 * rehearsal-priority card can be inspected in Storybook.
 */
function createEmptyPrioritySong(): RehearsalSong {
  const song = createDemoRehearsalSong();
  song.sections = [];
  song.exportSummary = {
    ...song.exportSummary,
    focusSections: []
  };
  return song;
}

const meta = {
  title: "Workspace/Rehearsal Priorities",
  component: Workspace,
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof Workspace>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Demo song: names Bass Guitar and Keyboard 1 Right Hand on verse. */
export const LockInHighPriorityParts: Story = {
  args: { song: createDemoRehearsalSong() }
};

/** Repeated verse plus chorus: the third slot is Lead Vocal · chorus. */
export const DedupedRepeatedVerse: Story = {
  args: { song: createLateNightSetWithRepeatedVerse() }
};

/** No priority evidence: honest empty copy that points at the roadmap. */
export const EmptyPriorityCard: Story = {
  args: { song: createEmptyPrioritySong() }
};

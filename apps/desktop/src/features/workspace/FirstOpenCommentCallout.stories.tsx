import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDemoRehearsalSong } from "@bandscope/shared-types";

import { FirstOpenCommentCallout } from "./FirstOpenCommentCallout";

const availableSong = createDemoRehearsalSong();
const unavailableSong = createDemoRehearsalSong();
for (const comment of unavailableSong.collaboration?.comments ?? []) {
  comment.status = "resolved";
}

const meta = {
  title: "Workspace/First Open Comment Callout",
  component: FirstOpenCommentCallout,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="min-h-72 bg-slate-950 p-6 text-white">
        <div data-testid="song-structure-grid" className="mb-6 rounded-xl border border-slate-700 p-3">
          <div data-section-index="0" className="text-xs text-slate-400">
            Song structure target · section 1
          </div>
        </div>
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof FirstOpenCommentCallout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Figma workspace next-action pattern with the earliest owned open rehearsal note. */
export const Available: Story = {
  args: { song: availableSong }
};

/** Guidance-only state when tonight's map has no owned open rehearsal note. */
export const Unavailable: Story = {
  args: { song: unavailableSong }
};

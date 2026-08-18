import type { Meta, StoryObj } from "@storybook/react-vite";
import { RoleSwitcher } from "./RoleSwitcher";

const roles = [
  { id: "bass-guitar", name: "Bass" },
  { id: "lead-vocal", name: "Lead vocal" },
  { id: "keys-right", name: "Keys RH" },
];

/** Storybook metadata for the rehearsal role-switching tabs. */
const meta = {
  title: "Workspace/RoleSwitcher",
  component: RoleSwitcher,
  parameters: { layout: "padded" },
} satisfies Meta<typeof RoleSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All-roles state with Storybook controls bound directly to the switcher props. */
export const AllRoles: Story = {
  args: { roles, activeRole: null, onRoleChange: () => undefined },
};

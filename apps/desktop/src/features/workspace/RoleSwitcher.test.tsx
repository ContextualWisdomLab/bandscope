import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoleSwitcher, tabValueToRoleId } from "./RoleSwitcher";

vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) =>
    ({
      allRoles: "All Roles",
      roleSwitcherTitle: "Role-specific View"
    })[key] ?? key,
  detectPreferredLocale: () => "en"
}));

describe("tabValueToRoleId", () => {
  const roles = [
    { id: "bass-guitar", name: "Bass Guitar" },
    { id: "lead-vocal", name: "Lead Vocal" }
  ];

  it("returns null for the ALL_ROLES_VALUE", () => {
    // using raw value to verify the final string result
    expect(tabValueToRoleId("__bandscope_all_roles__", roles)).toBeNull();
  });

  it("returns null for values that do not start with the role prefix", () => {
    expect(tabValueToRoleId("raw-unknown-role", roles)).toBeNull();
  });

  it("returns null for tab values that are not in the provided role allowlist", () => {
    expect(tabValueToRoleId("role:unknown-role", roles)).toBeNull();
  });

  it("returns the role id for valid role tab values", () => {
    expect(tabValueToRoleId("role:bass-guitar", roles)).toBe("bass-guitar");
  });
});

describe("RoleSwitcher", () => {
  it("keeps the all-roles control distinct from a real role whose id is all", () => {
    const onRoleChange = vi.fn();

    render(
      <RoleSwitcher
        roles={[
          { id: "all", name: "Alloy Synth" },
          { id: "bass-guitar", name: "Bass Guitar" }
        ]}
        activeRole="bass-guitar"
        onRoleChange={onRoleChange}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Alloy Synth" }));
    expect(onRoleChange).toHaveBeenLastCalledWith("all");

    fireEvent.click(screen.getByRole("tab", { name: "All Roles" }));
    expect(onRoleChange).toHaveBeenLastCalledWith(null);
  });

  it("uses the project-standard active tab data selector", () => {
    render(
      <RoleSwitcher
        roles={[{ id: "bass-guitar", name: "Bass Guitar" }]}
        activeRole={null}
        onRoleChange={vi.fn()}
      />
    );

    const allRolesTrigger = screen.getByRole("tab", { name: "All Roles" });
    expect(allRolesTrigger.className).toContain("data-active:bg-cyan-300");
    expect(allRolesTrigger.className).not.toContain("data-[state=active]:");
  });
});

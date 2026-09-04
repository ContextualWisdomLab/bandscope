import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoleSwitcher, tabValueToRoleId } from "./RoleSwitcher";

vi.mock("../../i18n", () => ({
  createTranslator: () => (translationKey: string) =>
    ({
      allRoles: "All Roles",
      roleSwitcherTitle: "Role-specific View"
    })[translationKey] ?? translationKey,
  detectPreferredLocale: () => "en"
}));

describe("RoleSwitcher", () => {
  it("renders the title and role options", () => {
    const roleOptions = [
      { roleId: "bass-guitar", roleName: "Bass Guitar" },
      { roleId: "lead-vocal", roleName: "Lead Vocal" }
    ];

    render(<RoleSwitcher roleOptions={roleOptions} activeRole={null} onRoleChange={vi.fn()} />);

    expect(screen.getByText("Role-specific View")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All Roles" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Bass Guitar" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Lead Vocal" })).toBeInTheDocument();
  });

  it("keeps the all-roles control distinct from a real role whose id is all", () => {
    const roleChangeHandler = vi.fn();

    render(
      <RoleSwitcher
        roleOptions={[
          { roleId: "all", roleName: "Alloy Synth" },
          { roleId: "bass-guitar", roleName: "Bass Guitar" }
        ]}
        activeRole="bass-guitar"
        onRoleChange={roleChangeHandler}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Alloy Synth" }));
    expect(roleChangeHandler).toHaveBeenLastCalledWith("all");

    fireEvent.click(screen.getByRole("tab", { name: "All Roles" }));
    expect(roleChangeHandler).toHaveBeenLastCalledWith(null);
  });

  it("uses the project-standard active tab data selector", () => {
    render(
      <RoleSwitcher
        roleOptions={[{ roleId: "bass-guitar", roleName: "Bass Guitar" }]}
        activeRole={null}
        onRoleChange={vi.fn()}
      />
    );

    const allRolesTab = screen.getByRole("tab", { name: "All Roles" });
    expect(allRolesTab.className).toContain("data-active:bg-cyan-300");
    expect(allRolesTab.className).not.toContain("data-[state=active]:");
  });

  it("ignores tab values that are not in the rendered role allowlist", () => {
    const roleOptions = [
      { roleId: "bass-guitar", roleName: "Bass Guitar" },
      { roleId: "lead-vocal", roleName: "Lead Vocal" }
    ];

    expect(tabValueToRoleId("role:bass-guitar", roleOptions)).toBe("bass-guitar");
    expect(tabValueToRoleId("role:unknown-role", roleOptions)).toBeNull();
    expect(tabValueToRoleId("raw-unknown-role", roleOptions)).toBeNull();
  });

  it("keeps the previous role projection behind the compatibility boundary", () => {
    const roleChangeHandler = vi.fn();

    render(
      <RoleSwitcher
        roles={[{ id: "legacy-bass", name: "Legacy Bass" }]}
        activeRole={null}
        onRoleChange={roleChangeHandler}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Legacy Bass" }));
    expect(roleChangeHandler).toHaveBeenLastCalledWith("legacy-bass");
  });
});

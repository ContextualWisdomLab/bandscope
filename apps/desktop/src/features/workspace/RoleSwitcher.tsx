import { useEffect } from "react";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users } from "lucide-react";

/** Renderable role option accepted by the role tab allowlist. */
export interface RehearsalRoleOption {
  id: string;
  name: string;
}

interface RoleSwitcherProps {
  roles: RehearsalRoleOption[];
  activeRole: string | null;
  onRoleChange: (roleId: string | null) => void;
}

const ALL_ROLES_VALUE = "__bandscope_all_roles__";
const ROLE_VALUE_PREFIX = "role:";

/** Documented. */
function roleTabValue(roleId: string): string {
  return `${ROLE_VALUE_PREFIX}${roleId}`;
}

/** Documented. */
export function tabValueToRoleId(value: string, roles: RehearsalRoleOption[]): string | null {
  if (value === ALL_ROLES_VALUE) {
    return null;
  }

  if (!value.startsWith(ROLE_VALUE_PREFIX)) {
    return null;
  }

  const roleId = value.slice(ROLE_VALUE_PREFIX.length);
  return roles.some((role) => role.id === roleId) ? roleId : null;
}

/** Documented. */
export function RoleSwitcher({ roles, activeRole, onRoleChange }: RoleSwitcherProps) {
  const t = createTranslator(detectPreferredLocale());

  useEffect(() => {
    if (activeRole !== null && !roles.some((role) => role.id === activeRole)) {
      onRoleChange(null);
    }
  }, [activeRole, onRoleChange, roles]);

  return (
    <div className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center">
      <div className="flex whitespace-nowrap text-sm font-semibold text-slate-200">
        <Users className="mr-2 size-4 text-cyan-300" aria-hidden="true" />
        {t("roleSwitcherTitle")}
      </div>
      <Tabs
        value={activeRole === null ? ALL_ROLES_VALUE : roleTabValue(activeRole)}
        onValueChange={(val) => onRoleChange(tabValueToRoleId(val, roles))}
        className="w-full sm:w-auto"
      >
        <TabsList className="h-auto w-full flex-wrap justify-start border border-white/10 bg-white/[0.05] p-1 sm:h-10 sm:w-auto">
          <TabsTrigger
            value={ALL_ROLES_VALUE}
            className="rounded-md px-4 text-slate-300 data-active:bg-cyan-300 data-active:text-slate-950 data-active:shadow-[0_8px_24px_rgba(34,211,238,0.24)]"
          >
            {t("allRoles")}
          </TabsTrigger>
          {roles.map((role) => (
            <TabsTrigger
              key={role.id}
              value={roleTabValue(role.id)}
              className="rounded-md px-4 text-slate-300 data-active:bg-cyan-300 data-active:text-slate-950 data-active:shadow-[0_8px_24px_rgba(34,211,238,0.24)]"
            >
              {role.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

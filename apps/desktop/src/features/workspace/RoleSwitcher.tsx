import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users } from "lucide-react";

/** Renderable role option accepted by the role tab allowlist. */
export interface RehearsalRoleOption {
  roleId: string;
  roleName: string;
}

/** Compatibility-only projection for the pre-naming-contract component API. */
interface LegacyRehearsalRoleOption {
  id: string;
  name: string;
}

interface RoleSwitcherSharedProps {
  activeRole: string | null;
  onRoleChange: (roleId: string | null) => void;
}

type RoleSwitcherProps = RoleSwitcherSharedProps &
  (
    | {
        roleOptions: RehearsalRoleOption[];
        roles?: never;
      }
    | {
        roleOptions?: never;
        /** @deprecated Use roleOptions with roleId/roleName. */
        roles: LegacyRehearsalRoleOption[];
      }
  );

const ALL_ROLES_VALUE = "__bandscope_all_roles__";
const ROLE_VALUE_PREFIX = "role:";

/** Translate the legacy component projection at one compatibility boundary. */
function normalizeLegacyRoleOptions(
  legacyRoleOptions: LegacyRehearsalRoleOption[]
): RehearsalRoleOption[] {
  return legacyRoleOptions.map((legacyRoleOption) => ({
    roleId: legacyRoleOption.id,
    roleName: legacyRoleOption.name
  }));
}

/** Documented. */
function roleTabValue(roleId: string): string {
  return `${ROLE_VALUE_PREFIX}${roleId}`;
}

/** Documented. */
export function tabValueToRoleId(
  tabValue: string,
  roleOptions: RehearsalRoleOption[]
): string | null {
  if (tabValue === ALL_ROLES_VALUE) {
    return null;
  }

  if (!tabValue.startsWith(ROLE_VALUE_PREFIX)) {
    return null;
  }

  const roleId = tabValue.slice(ROLE_VALUE_PREFIX.length);
  return roleOptions.some((roleOption) => roleOption.roleId === roleId) ? roleId : null;
}

/** Documented. */
export function RoleSwitcher({
  roleOptions,
  roles: legacyRoleOptions,
  activeRole,
  onRoleChange
}: RoleSwitcherProps) {
  const resolvedRoleOptions =
    roleOptions ?? normalizeLegacyRoleOptions(legacyRoleOptions ?? []);
  const translatedText = createTranslator(detectPreferredLocale());

  return (
    <div className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center">
      <div className="flex whitespace-nowrap text-sm font-semibold text-slate-200">
        <Users className="mr-2 size-4 text-cyan-300" aria-hidden="true" />
        {translatedText("roleSwitcherTitle")}
      </div>
      <Tabs
        value={activeRole === null ? ALL_ROLES_VALUE : roleTabValue(activeRole)}
        onValueChange={(tabValue) =>
          onRoleChange(tabValueToRoleId(tabValue, resolvedRoleOptions))
        }
        className="w-full sm:w-auto"
      >
        <TabsList className="h-auto w-full flex-wrap justify-start border border-white/10 bg-white/[0.05] p-1 sm:h-10 sm:w-auto">
          <TabsTrigger
            value={ALL_ROLES_VALUE}
            className="rounded-md px-4 text-slate-300 data-active:bg-cyan-300 data-active:text-slate-950 data-active:shadow-[0_8px_24px_rgba(34,211,238,0.24)]"
          >
            {translatedText("allRoles")}
          </TabsTrigger>
          {resolvedRoleOptions.map((roleOption) => (
            <TabsTrigger
              key={roleOption.roleId}
              value={roleTabValue(roleOption.roleId)}
              className="rounded-md px-4 text-slate-300 data-active:bg-cyan-300 data-active:text-slate-950 data-active:shadow-[0_8px_24px_rgba(34,211,238,0.24)]"
            >
              {roleOption.roleName}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

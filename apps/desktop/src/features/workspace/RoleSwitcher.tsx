import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users } from "lucide-react";

interface RoleSwitcherProps {
  roles: { id: string; name: string }[];
  activeRole: string | null;
  onRoleChange: (roleId: string | null) => void;
}

/** Documented. */
export function RoleSwitcher({ roles, activeRole, onRoleChange }: RoleSwitcherProps) {
  const t = createTranslator(detectPreferredLocale());

  return (
    <div className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center">
      <div className="flex whitespace-nowrap text-sm font-semibold text-slate-200">
        <Users className="mr-2 size-4 text-cyan-300" />
        {t("roleSwitcherTitle")}
      </div>
      <Tabs 
        value={activeRole === null ? "all" : activeRole} 
        onValueChange={(val) => onRoleChange(val === "all" ? null : val)}
        className="w-full sm:w-auto"
      >
        <TabsList className="h-auto w-full flex-wrap justify-start border border-white/10 bg-white/[0.05] p-1 sm:h-10 sm:w-auto">
          <TabsTrigger 
            value="all" 
            className="rounded-md px-4 text-slate-300 data-[state=active]:bg-cyan-300 data-[state=active]:text-slate-950 data-[state=active]:shadow-[0_8px_24px_rgba(34,211,238,0.24)]"
          >
            {t("allRoles")}
          </TabsTrigger>
          {roles.map((role) => (
            <TabsTrigger
              key={role.id}
              value={role.id}
              className="rounded-md px-4 text-slate-300 data-[state=active]:bg-cyan-300 data-[state=active]:text-slate-950 data-[state=active]:shadow-[0_8px_24px_rgba(34,211,238,0.24)]"
            >
              {role.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

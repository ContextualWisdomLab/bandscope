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
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 py-2">
      <div className="flex items-center text-sm font-semibold text-zinc-700 whitespace-nowrap">
        <Users className="w-4 h-4 mr-2" />
        {t("roleSwitcherTitle")}
      </div>
      <Tabs 
        value={activeRole === null ? "all" : activeRole} 
        onValueChange={(val) => onRoleChange(val === "all" ? null : val)}
        className="w-full sm:w-auto"
      >
        <TabsList className="h-10 p-1 flex-wrap h-auto sm:h-10 justify-start w-full sm:w-auto bg-zinc-200/50">
          <TabsTrigger 
            value="all" 
            className="rounded-md px-4 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm"
          >
            {t("allRoles")}
          </TabsTrigger>
          {roles.map((role) => (
            <TabsTrigger
              key={role.id}
              value={role.id}
              className="rounded-md px-4 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm"
            >
              {role.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

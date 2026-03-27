import { createTranslator, detectPreferredLocale } from "../../i18n";

interface RoleSwitcherProps {
  roles: { id: string; name: string }[];
  activeRole: string | null;
  onRoleChange: (roleId: string | null) => void;
}

export function RoleSwitcher({ roles, activeRole, onRoleChange }: RoleSwitcherProps) {
  const t = createTranslator(detectPreferredLocale());

  return (
    <div style={{ margin: "16px 0" }}>
      <strong style={{ marginRight: "16px" }}>{t("roleSwitcherTitle")}:</strong>
      <button
        type="button"
        onClick={() => onRoleChange(null)}
        style={{
          marginRight: "8px",
          padding: "4px 12px",
          borderRadius: "16px",
          border: "1px solid #ccc",
          backgroundColor: activeRole === null ? "#1890ff" : "#fff",
          color: activeRole === null ? "#fff" : "#333",
          cursor: "pointer",
        }}
      >
        {t("allRoles")}
      </button>
      {roles.map((role) => (
        <button
          key={role.id}
          type="button"
          onClick={() => onRoleChange(role.id)}
          style={{
            marginRight: "8px",
            padding: "4px 12px",
            borderRadius: "16px",
            border: "1px solid #ccc",
            backgroundColor: activeRole === role.id ? "#1890ff" : "#fff",
            color: activeRole === role.id ? "#fff" : "#333",
            cursor: "pointer",
          }}
        >
          {role.name}
        </button>
      ))}
    </div>
  );
}

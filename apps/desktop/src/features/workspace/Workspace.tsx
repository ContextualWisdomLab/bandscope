import { useState, useMemo } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { RoleSwitcher } from "./RoleSwitcher";
import { SectionRoadmap } from "./SectionRoadmap";

interface WorkspaceProps {
  song: RehearsalSong;
}

export function Workspace({ song }: WorkspaceProps) {
  const [activeRole, setActiveRole] = useState<string | null>(null);

  // Extract all unique roles from the song's sections
  const allRoles = useMemo(() => {
    const roleMap = new Map<string, string>();
    song.sections.forEach(section => {
      section.roles.forEach(role => {
        if (!roleMap.has(role.id)) {
          roleMap.set(role.id, role.name);
        }
      });
    });
    return Array.from(roleMap.entries()).map(([id, name]) => ({ id, name }));
  }, [song]);

  return (
    <div style={{ marginTop: "32px", padding: "24px", border: "1px solid #e8e8e8", borderRadius: "12px", backgroundColor: "#fff" }}>
      <header>
        <h2 style={{ fontSize: "1.8em", margin: "0 0 8px 0" }}>{song.title}</h2>
        <p style={{ color: "#666", margin: "0 0 16px 0" }}>{song.exportSummary.headline}</p>
      </header>

      <RoleSwitcher 
        roles={allRoles} 
        activeRole={activeRole} 
        onRoleChange={setActiveRole} 
      />

      <SectionRoadmap 
        song={song} 
        activeRole={activeRole} 
      />
    </div>
  );
}

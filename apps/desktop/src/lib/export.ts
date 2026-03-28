import type { RehearsalSong } from "@bandscope/shared-types";

// Security notes:
// 1. Filename sanitization to prevent directory traversal or invalid characters.
// 2. CSV formula injection prevention (fields starting with =, +, -, @ must be prefixed with a single quote).

/** Documented. */
export function sanitizeFilename(title: string): string {
  // Replace invalid filename characters with underscores
  return title.replace(/[^a-zA-Z0-9_\-\s]/g, "_").trim() || "export";
}

/** Documented. */
export function escapeCsvField(value: string): string {
  let escapedValue = value;
  // Prevent CSV formula injection by prefixing problematic leading characters with a single quote
  if (/^[=+\-@]/.test(value)) {
    escapedValue = `'${value}`;
  }
  // Enclose in double quotes if there's a comma, newline, or double quote
  if (escapedValue.includes(",") || escapedValue.includes("\n") || escapedValue.includes('"')) {
    const escapedQuotes = escapedValue.replace(/"/g, '""');
    return `"${escapedQuotes}"`;
  }
  return escapedValue;
}

/** Documented. */
export function generateCueSheetCsv(song: RehearsalSong): string {
  const headers = ["Section", "Groove", "Role", "Harmony", "Cue", "Priority", "Notes"];
  const rows: string[] = [headers.join(",")];

  for (const section of song.sections) {
    for (const role of section.roles) {
      const notes = [role.setupNote, role.simplification].filter(Boolean).join(" | ");
      const row = [
        section.label,
        section.groove,
        role.name,
        role.harmony.chord,
        role.cue.value,
        role.rehearsalPriority,
        notes
      ].map(escapeCsvField);
      
      rows.push(row.join(","));
    }
  }

  return rows.join("\n");
}

/** Documented. */
export function generateChartSummaryJson(song: RehearsalSong): string {
  // Just a clean JSON stringification for now, focusing on the core chart data
  const summary = {
    title: song.title,
    headline: song.exportSummary?.headline || "",
    sections: song.sections.map(s => ({
      label: s.label,
      groove: s.groove,
      roles: s.roles.map(r => ({
        name: r.name,
        chord: r.harmony.chord,
        cue: r.cue.value,
        priority: r.rehearsalPriority
      }))
    }))
  };
  return JSON.stringify(summary, null, 2);
}

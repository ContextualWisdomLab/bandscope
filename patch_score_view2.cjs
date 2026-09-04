const fs = require('fs');
const path = require('path');

function patchScoreView() {
    const filePath = path.resolve('apps/desktop/src/features/score/ScoreView.tsx');
    let content = fs.readFileSync(filePath, 'utf-8');

    const search1 = `function bridgeErrorDetail(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  const firstLine = raw?.split(/\\r?\\n/)[0]?.trim();
  return firstLine ? firstLine : fallback;
}`;
    const replace1 = `function bridgeErrorDetail(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  const firstLine = raw?.split(/\\r?\\n/)[0]?.trim();
  if (!firstLine) return fallback;

  // Protect against dependency information leakage (paths and secrets)
  if (firstLine.includes("/") || firstLine.includes("\\\\") || firstLine.toLowerCase().includes("token=")) {
    return fallback;
  }

  return firstLine;
}`;

    // Check if `ScoreView.tsx` hasn't already been patched. We checked in git show `d2addef` that it was modified.
    // Wait, let's just grep `bridgeErrorDetail` in `ScoreView.tsx` first to see what's there.
}

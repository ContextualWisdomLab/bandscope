import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "node:url";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

/** Production files whose V8 coverage is owned by the desktop test gate. */
export const DESKTOP_OWNED_PRODUCTION_COVERAGE = [
  "src/App.tsx",
  "src/lib/export.ts",
  "src/i18n/index.ts",
  "src/features/score/ScoreViewer.tsx",
  "src/features/score/ScoreView.tsx",
  "src/features/score/scoreStorage.ts",
  "src/features/workspace/firstTuningPlan.ts",
  "src/features/workspace/FirstTuningPlanCallout.tsx"
];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(configDirectory, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    coverage: {
      provider: "v8",
      include: DESKTOP_OWNED_PRODUCTION_COVERAGE,
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90
      }
    }
  }
});

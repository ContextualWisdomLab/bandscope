import { defineConfig } from "vitest/config";

export const coverageThresholds = {
  lines: 100,
  functions: 100,
  branches: 100,
  statements: 100
} as const;

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/index.ts"],
      thresholds: coverageThresholds
    }
  }
});

const BROWSER_PROGRESS_STEPS = [
  { progressLabel: "Decoding audio", progressStage: "decode", progressPercent: 20 },
  { progressLabel: "Separating stems... (45%)", progressStage: "separate", progressPercent: 45 },
  { progressLabel: "Building rehearsal cues", progressStage: "analyze", progressPercent: 70 },
  { progressLabel: "Saving reusable features", progressStage: "persist", progressPercent: 90 }
] as const;

function findNextStepFind(currentPercent: number) {
  return BROWSER_PROGRESS_STEPS.find((step) => step.progressPercent > currentPercent);
}

function findNextStepForLoop(currentPercent: number) {
  for (let i = 0; i < BROWSER_PROGRESS_STEPS.length; i++) {
    const step = BROWSER_PROGRESS_STEPS[i];
    if (step.progressPercent > currentPercent) {
      return step;
    }
  }
  return undefined;
}

const ITERATIONS = 10_000_000;

console.time("find");
for (let i = 0; i < ITERATIONS; i++) {
  findNextStepFind(50);
}
console.timeEnd("find");

console.time("for");
for (let i = 0; i < ITERATIONS; i++) {
  findNextStepForLoop(50);
}
console.timeEnd("for");

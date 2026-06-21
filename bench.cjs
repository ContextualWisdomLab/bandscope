const { performance } = require('perf_hooks');

const mockWorkspace = {
  id: "mock-ws",
  title: "Browser Mock Workspace",
  songs: [],
  workspaceVersion: 1
};

// Add some fake songs to make the workspace a bit larger
for (let i = 0; i < 100; i++) {
  mockWorkspace.songs.push({
    id: `pack-${i}`,
    packState: "ready",
    sourceLabel: `Demo Song ${i}`,
    engineState: "succeeded",
    song: {
      id: `song-${i}`,
      title: `Song ${i}`,
      sections: [],
      tracks: []
    }
  });
}

const mockListeners = new Set();
mockListeners.add((event) => {
  // simulate the parseRehearsalWorkspace overhead
  const parsed = structuredClone(event.payload);
});

function triggerMockUpdateBaseline() {
  const payload = structuredClone(mockWorkspace);
  mockListeners.forEach(listener => listener({ payload }));
}

function triggerMockUpdateOptimized() {
  const payload = mockWorkspace;
  mockListeners.forEach(listener => listener({ payload }));
}

const N = 10000;

// warm up
for (let i = 0; i < 1000; i++) {
  triggerMockUpdateBaseline();
  triggerMockUpdateOptimized();
}

let start = performance.now();
for (let i = 0; i < N; i++) {
  triggerMockUpdateBaseline();
}
let end = performance.now();
const baselineTime = end - start;
console.log(`Baseline: ${baselineTime.toFixed(2)} ms`);

start = performance.now();
for (let i = 0; i < N; i++) {
  triggerMockUpdateOptimized();
}
end = performance.now();
const optimizedTime = end - start;
console.log(`Optimized: ${optimizedTime.toFixed(2)} ms`);
console.log(`Improvement: ${(baselineTime / optimizedTime).toFixed(2)}x faster`);

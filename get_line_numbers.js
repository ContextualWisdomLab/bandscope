const fs = require('fs');
const content = fs.readFileSync('apps/desktop/src/features/workspace/SectionRoadmap.tsx', 'utf8');
const lines = content.split('\n');

let inRender = false;
lines.forEach((line, i) => {
  if (line.includes('section.roles')) {
    console.log(`Line ${i + 1}: ${line}`);
    console.log(`Line ${i + 2}: ${lines[i + 1]}`);
    console.log(`Line ${i + 3}: ${lines[i + 2]}`);
  }
});

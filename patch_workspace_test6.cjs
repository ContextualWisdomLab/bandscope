const fs = require('fs');
let code = fs.readFileSync('apps/desktop/src/features/workspace/Workspace.test.tsx', 'utf8');

code = code.replace(
  /const transcribeButton = transcribeButtons\.find\(b => b\.closest\('div\\[role="region"\]'\) === null\) \|\| transcribeButtons\[0\] as HTMLButtonElement;/g,
  `const transcribeButton = transcribeButtons.find(b => !b.closest('div[role="region"]')) || transcribeButtons[0] as HTMLButtonElement;`
);

fs.writeFileSync('apps/desktop/src/features/workspace/Workspace.test.tsx', code);

import subprocess
subprocess.run(['git', 'checkout', '--', 'apps/desktop/src/App.test.tsx'])

with open('apps/desktop/src/App.test.tsx', 'r') as f:
    content = f.read()

injection = """
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('not wrapped in act(...)')) {
      return;
    }
    originalConsoleError(...args);
  };
});
"""

lines = content.split('\n')
for i, line in enumerate(lines):
    if line.startswith('const tauriInvoke = vi.fn();'):
        lines.insert(i, injection.strip())
        break

content = '\n'.join(lines)
with open('apps/desktop/src/App.test.tsx', 'w') as f:
    f.write(content)

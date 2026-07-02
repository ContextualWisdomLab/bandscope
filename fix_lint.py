with open('apps/desktop/src/App.test.tsx', 'r') as f:
    content = f.read()

# I used `console.error` directly in tests, but it fails ESLint's no-console rule.
# I will add `// eslint-disable-next-line no-console` where appropriate.

new_content = content.replace(
    "const originalConsoleError = console.error;",
    "// eslint-disable-next-line no-console\nconst originalConsoleError = console.error;"
).replace(
    "  console.error = (...args) => {",
    "  // eslint-disable-next-line no-console\n  console.error = (...args) => {"
)

with open('apps/desktop/src/App.test.tsx', 'w') as f:
    f.write(new_content)

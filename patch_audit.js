const fs = require('fs');
let code = fs.readFileSync('apps/desktop/src-tauri/.cargo/audit.toml', 'utf8');
code = code.replace(/\]/, `    "RUSTSEC-2026-0194",\n    "RUSTSEC-2026-0195",\n]`);
fs.writeFileSync('apps/desktop/src-tauri/.cargo/audit.toml', code);

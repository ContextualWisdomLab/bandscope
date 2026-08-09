const fs = require('fs');

const path = 'package.json';
const packageJson = JSON.parse(fs.readFileSync(path, 'utf8'));

if (!packageJson.overrides) {
  packageJson.overrides = {};
}
packageJson.overrides["pdfjs-dist"] = "6.2.108";

fs.writeFileSync(path, JSON.stringify(packageJson, null, 2) + "\n");

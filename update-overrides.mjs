import fs from 'fs';

const pkgJsonPath = './package.json';
const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

pkgJson.overrides = pkgJson.overrides || {};
pkgJson.overrides['nanoid'] = '^3.3.17';
pkgJson.overrides['pdfjs-dist'] = '^6.2.108';
pkgJson.overrides['undici'] = '^7.28.1';

fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');

const fs = require('fs');

const enCommonPath = 'apps/desktop/src/locales/en/common.json';
const koCommonPath = 'apps/desktop/src/locales/ko/common.json';
const testPath = 'apps/desktop/src/features/workspace/PartGraphMap.test.tsx';

try {
  let enCommon = JSON.parse(fs.readFileSync(enCommonPath, 'utf8'));
  let koCommon = JSON.parse(fs.readFileSync(koCommonPath, 'utf8'));

  if (enCommon.partGraphNoRoleEvidence) {
      delete enCommon.partGraphNoRoleEvidence;
      fs.writeFileSync(enCommonPath, JSON.stringify(enCommon, null, 2) + "\n", 'utf8');
      console.log("Deleted from en");
  }

  if (koCommon.partGraphNoRoleEvidence) {
      delete koCommon.partGraphNoRoleEvidence;
      fs.writeFileSync(koCommonPath, JSON.stringify(koCommon, null, 2) + "\n", 'utf8');
      console.log("Deleted from ko");
  }
} catch (e) {
  console.log("Error reading json files", e.message);
}

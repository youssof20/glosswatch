import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const packages = ['webextension-polyfill','jschardet','dexie','mediabunny'];
let notice = `Glosswatch\n\n${await readFile('LICENSE','utf8')}\n\n`;
for (const name of packages) {
  const directory = path.join('node_modules',name);
  const info = JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));
  const license = (await readdir(directory)).find(file => /^licen[cs]e(?:\.|$)/i.test(file));
  if (!license) throw new Error(`Missing license for ${name}`);
  notice += `${'='.repeat(72)}\n${name} ${info.version} — ${info.license}\nSource: ${typeof info.repository === 'string' ? info.repository : info.repository?.url}\n`;
  notice += `Unmodified library code. Source is available from the URL above and via npm.\nThe repo's package-lock.json pins the source version; npm ci installs it for rebuilding.\n\n${await readFile(path.join(directory,license),'utf8')}\n\n`;
}
await writeFile('public/THIRD-PARTY-NOTICES.txt', notice.trimEnd() + '\n');
console.log('Wrote dependency license notices.');

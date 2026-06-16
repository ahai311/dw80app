import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const www = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'www');
fs.mkdirSync(www, { recursive: true });
for (const name of ['index.html', 'error.html']) {
  const p = path.join(www, name);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, `<!DOCTYPE html><html><body></body></html>\n`, 'utf8');
    console.log('ensure-www: created placeholder', name);
  }
}

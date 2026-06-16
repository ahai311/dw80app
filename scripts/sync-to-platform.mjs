#!/usr/bin/env node
/** 同步 scripts / workflow 到 server/appBuilder */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const shellRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const platformRoot = path.join(shellRoot, '..', 'server', 'appBuilder');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('copied', path.relative(shellRoot, src), '->', path.relative(platformRoot, dest));
}

for (const wf of ['build-android.yml', 'build-ios2.yml']) {
  const src = path.join(shellRoot, '.github/workflows', wf);
  if (fs.existsSync(src)) copyFile(src, path.join(platformRoot, 'workflows', wf));
}

const scriptDir = path.join(shellRoot, 'scripts');
for (const f of fs.readdirSync(scriptDir)) {
  if (!f.endsWith('.mjs') && f !== 'fix-apk-installable.py' && f !== 'dump-apk-sdk.py') continue;
  if (f === 'sync-to-platform.mjs') continue;
  copyFile(path.join(scriptDir, f), path.join(platformRoot, 'shell-scripts', f));
}
const libDir = path.join(scriptDir, 'lib');
if (fs.existsSync(libDir)) {
  for (const f of fs.readdirSync(libDir).filter((x) => x.endsWith('.mjs'))) {
    copyFile(path.join(libDir, f), path.join(platformRoot, 'shell-scripts/lib', f));
  }
}
for (const [srcRel, destRel] of [
  ['capacitor.config.json', 'shell-scripts/capacitor.config.json'],
  ['www/index.html', 'shell-scripts/www/index.html'],
  ['www/error.html', 'shell-scripts/www/error.html'],
  ['package.json', 'shell-scripts/package.json.stub'],
  ['README.md', 'shell-scripts/README.md.stub'],
]) {
  const src = path.join(shellRoot, srcRel);
  if (fs.existsSync(src)) copyFile(src, path.join(platformRoot, destRel));
}
console.log('\nDone.');

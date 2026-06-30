/**
 * CI / 离线构建：从 resources/bundled 复制默认 icon/splash（GitHub Actions 拉不到本地 xh.ms）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundled = path.join(root, 'resources', 'bundled');
const out = path.join(root, 'resources');

const FILES = {
  'icon.png': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'splash.png':
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
};

fs.mkdirSync(bundled, { recursive: true });
fs.mkdirSync(out, { recursive: true });

for (const [name, b64] of Object.entries(FILES)) {
  const bundledPath = path.join(bundled, name);
  if (!fs.existsSync(bundledPath)) {
    fs.writeFileSync(bundledPath, Buffer.from(b64, 'base64'));
  }
  const dest = path.join(out, name);
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 32) {
    fs.copyFileSync(bundledPath, dest);
    console.log('ensure-bundled-assets: copied', name);
  }
}

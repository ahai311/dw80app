/** 允许 HTTP cleartext + networkSecurityConfig（按 TARGET_URL 判断） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTargetUrl } from './lib/target-url.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = normalizeTargetUrl(process.env.TARGET_URL || process.env.APP_TARGET_URL, '');
const allowCleartext = target.startsWith('http://');

const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) {
  console.warn('patch-android-network: AndroidManifest missing, skip');
  process.exit(0);
}

let manifest = fs.readFileSync(manifestPath, 'utf8');

if (allowCleartext && !manifest.includes('usesCleartextTraffic')) {
  manifest = manifest.replace(
    /<application\b/,
    '<application android:usesCleartextTraffic="true"',
  );
}

const xmlDir = path.join(root, 'android/app/src/main/res/xml');
const nscPath = path.join(xmlDir, 'network_security_config.xml');
fs.mkdirSync(xmlDir, { recursive: true });

const nsc = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="${allowCleartext ? 'true' : 'false'}">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;
fs.writeFileSync(nscPath, nsc, 'utf8');

if (!manifest.includes('networkSecurityConfig')) {
  manifest = manifest.replace(
    /<application\b([^>]*)>/,
    (m, attrs) => {
      if (attrs.includes('networkSecurityConfig')) return m;
      return `<application${attrs} android:networkSecurityConfig="@xml/network_security_config">`;
    },
  );
}

manifest = manifest.replace(/<application\b([^>]*)>/, (m, attrs) => {
  let a = attrs;
  if (!/android:hardwareAccelerated=/.test(a)) {
    a += ' android:hardwareAccelerated="true"';
  } else {
    a = a.replace(/android:hardwareAccelerated="[^"]*"/, 'android:hardwareAccelerated="true"');
  }
  return `<application${a}>`;
});

fs.writeFileSync(manifestPath, manifest, 'utf8');
console.log(`patch-android-network: cleartext=${allowCleartext}`);

/**
 * GitHub Actions 构建完成后，将 APK 直传到 U-Station 平台
 */
import fs from 'node:fs';
import path from 'node:path';

const platformUrl = (process.env.PLATFORM_URL || process.env.APP_PLATFORM_URL || '').replace(/\/$/, '');
const token = process.env.CALLBACK_TOKEN || process.env.APP_CALLBACK_TOKEN || '';
const buildId = process.env.BUILD_ID || '';
const platform = process.env.BUILD_PLATFORM || 'android';
const releaseTag = process.env.RELEASE_TAG || '';
const apkPath = process.env.APK_PATH || '';
const versionName = process.env.VERSION_NAME || 'latest';

if (!platformUrl || !token || !apkPath) {
  console.warn('skip upload: PLATFORM_URL, CALLBACK_TOKEN or APK_PATH missing');
  process.exit(0);
}

if (!fs.existsSync(apkPath)) {
  console.error('APK not found:', apkPath);
  process.exit(1);
}

const buf = fs.readFileSync(apkPath);
const form = new FormData();
form.append('file', new Blob([buf]), path.basename(apkPath));
if (buildId) form.append('buildId', buildId);
form.append('platform', platform);
if (releaseTag) form.append('releaseTag', releaseTag);
form.append('versionName', versionName);
form.append('publishLatest', '1');

const res = await fetch(`${platformUrl}/api/app-builder/webhook/artifact`, {
  method: 'POST',
  headers: { 'X-App-Builder-Token': token },
  body: form,
});
const text = await res.text();
if (!res.ok) {
  console.error('artifact upload failed', res.status, text);
  process.exit(1);
}
console.log('artifact upload ok', text);

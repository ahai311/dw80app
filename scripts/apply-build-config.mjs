/**
 * CI / 本地：写入 Capacitor 生产配置（redirect shell，无 server.url，无调试资产）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTargetUrl, targetWithNativeParam } from './lib/target-url.mjs';
import { resolveCiAppDisplayName, writeAppNameStrings } from './lib/app-display-name.mjs';

const BUILD_CONFIG_VERSION = 30;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = path.join(root, 'capacitor.config.json');
const wwwDir = path.join(root, 'www');

function req(name, fallback = '') {
  const v = process.env[name];
  return v != null && String(v).trim() !== '' ? String(v).trim() : fallback;
}

const appId = req('BUNDLE_ID', req('APP_BUNDLE_ID', 'com.uzhan.app'));
const appName = resolveCiAppDisplayName(process.env, root);
const url = normalizeTargetUrl(req('TARGET_URL', req('APP_TARGET_URL', 'https://example.com/')));

const isHttp = url.startsWith('http://');
const productionMode = process.env.CAPACITOR_DEV_LOCAL !== '1';

function writeTargetStrings(target) {
  const dest = targetWithNativeParam(target);
  const androidRes = path.join(root, 'android/app/src/main/res/values');
  fs.mkdirSync(androidRes, { recursive: true });
  const safe = dest.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  fs.writeFileSync(
    path.join(androidRes, 'ustation_target.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="app_target_url">${safe}</string>\n</resources>\n`,
    'utf8',
  );
  return dest;
}

function writeProductionRedirectShell(target) {
  const dest = targetWithNativeParam(target);
  const safe = JSON.stringify(dest);
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;" />
  <title></title>
  <style>html,body{margin:0;height:100%;background:#0B0F1A}</style>
</head>
<body>
  <script>
    (function () {
      try { localStorage.setItem('IS_NATIVE_APP', '1'); document.title = ''; } catch (e) {}
      var t = ${safe};
      if (location.href === t || location.href === t.replace(/\\/$/, '')) return;
      location.replace(t);
    })();
  </script>
</body>
</html>
`;
  fs.writeFileSync(path.join(wwwDir, 'index.html'), html, 'utf8');
}

const defaultConfig = {
  appId: 'com.uzhan.app',
  appName: 'UStation',
  webDir: 'www',
  server: {
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: ['*'],
    hostname: 'localhost',
    errorPath: 'error.html',
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#ffffffff',
    appendUserAgent: ' UStationApp/1.0',
    webContentsDebuggingEnabled: false,
  },
};
if (!fs.existsSync(cfgPath)) {
  fs.writeFileSync(cfgPath, `${JSON.stringify(defaultConfig, null, 2)}\n`, 'utf8');
  console.warn('apply-build-config: created missing capacitor.config.json');
}
const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
config.appId = appId;
config.appName = appName;

config.android = {
  ...(config.android || {}),
  allowMixedContent: true,
  backgroundColor: '#ffffffff',
  appendUserAgent: ' UStationApp/1.0',
  webContentsDebuggingEnabled: false,
};

delete config.plugins;

delete config.server?.url;
config.server = {
  ...(config.server || {}),
  cleartext: isHttp,
  androidScheme: 'https',
  allowNavigation: ['*'],
  hostname: 'localhost',
  errorPath: 'error.html',
};

fs.mkdirSync(wwwDir, { recursive: true });
const finalUrl = writeTargetStrings(url);
writeProductionRedirectShell(url);
const modeLabel = productionMode ? 'pure_webview_no_cordova' : 'dev_local_shell';
console.log(`apply-build-config v${BUILD_CONFIG_VERSION} (${modeLabel}):`, { appId, appName, url: finalUrl });

fs.writeFileSync(cfgPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

const versionName = req('VERSION_NAME', '1.0.0');
const versionCode = req('VERSION_CODE', '1');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  const safeId = appId.replace(/[^a-zA-Z0-9._]/g, '') || 'com.uzhan.app';
  gradle = gradle.replace(/namespace\s+"[^"]*"/, `namespace "${safeId}"`);
  gradle = gradle.replace(/applicationId\s+"[^"]*"/, `applicationId "${safeId}"`);
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${Number(versionCode) || 1}`);
  gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
  fs.writeFileSync(gradlePath, gradle, 'utf8');
  console.log('android/app/build.gradle id/version updated');
}

if (fs.existsSync(path.join(root, 'android'))) {
  writeAppNameStrings(root, appName);
}

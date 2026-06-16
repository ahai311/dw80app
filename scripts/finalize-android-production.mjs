/**
 * Gradle 前：强制系统 WebView MainActivity、清除调试资产、清空标题
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMainActivitySource } from './main-activity-java.mjs';
import { resolveCiAppDisplayName, writeAppNameStrings } from './lib/app-display-name.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHELL_PATCH_MARKER = 'shellPatchVersion=33';

const FORBIDDEN_JAVA = [
  'appendDebug',
  'setupDebugOverlay',
  'debugPatchVersion',
  'debugEnabled',
  'debugTextView',
  'debugScroll',
  'loadDebugConfig',
  'extends BridgeActivity',
  'com.getcapacitor',
  'Capacitor',
  'com.tencent.smtt',
  'org.mozilla.geckoview',
  'GeckoView',
  '0xFF00FF00',
  '0xE6000000',
];

const FORBIDDEN_ASSET_NAMES = [
  'debug-overlay.js',
  'debug-info.json',
  'debug_overlay.js',
];

function findMainActivity() {
  const base = path.join(root, 'android/app/src/main/java');
  if (!fs.existsSync(base)) return null;
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) stack.push(p);
      else if (name === 'MainActivity.java') return p;
    }
  }
  return null;
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

let failed = false;
function fail(msg) {
  console.error(`::error::${msg}`);
  failed = true;
}

const mainPath = findMainActivity();
if (!mainPath) {
  fail('MainActivity.java not found');
} else {
  const pkg = mainPath
    .replace(/\\/g, '/')
    .split('/java/')[1]
    .replace('/MainActivity.java', '')
    .replace(/\//g, '.');
  fs.writeFileSync(mainPath, getMainActivitySource(pkg), 'utf8');
  console.log('finalize: MainActivity -> system WebView');
}

for (const base of [path.join(root, 'www'), path.join(root, 'android/app/src/main/assets')]) {
  if (!fs.existsSync(base)) continue;
  for (const p of walkFiles(base)) {
    const baseName = path.basename(p).toLowerCase();
    if (FORBIDDEN_ASSET_NAMES.some((n) => baseName === n)) {
      fs.unlinkSync(p);
      console.log('finalize: removed', path.relative(root, p));
      continue;
    }
    if (/\.(html|js|json)$/i.test(p)) {
      const text = fs.readFileSync(p, 'utf8');
      if (/debug-overlay|debug-info\.json|appendDebug/i.test(text)) {
        if (baseName.endsWith('.html')) {
          const cleaned = text.replace(/<script[^>]*debug[^>]*><\/script>\s*/gi, '');
          fs.writeFileSync(p, cleaned, 'utf8');
          console.log('finalize: cleaned html', path.relative(root, p));
        } else {
          fs.unlinkSync(p);
          console.log('finalize: removed', path.relative(root, p));
        }
      }
    }
  }
}

writeAppNameStrings(root, resolveCiAppDisplayName(process.env, root));

const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  manifest = manifest.replace(/<application\b([^>]*)>/, (m, attrs) => {
    let a = attrs.replace(/\s*android:label="[^"]*"/g, '');
    a += ' android:label="@string/app_name"';
    return `<application${a}>`;
  });
  manifest = manifest.replace(
    /android:name="\.MainActivity"([^>]*?)\s*android:label="[^"]*"/,
    'android:name=".MainActivity"$1 android:label="@string/app_name"',
  );
  if (!/android:name="\.MainActivity"[^>]*android:label=/.test(manifest)) {
    manifest = manifest.replace(
      /android:name="\.MainActivity"/,
      'android:name=".MainActivity"\n            android:label="@string/app_name"',
    );
  }
  fs.writeFileSync(manifestPath, manifest, 'utf8');
  console.log('finalize: manifest labels cleared');
}

const layoutPath = path.join(root, 'android/app/src/main/res/layout/activity_main.xml');
if (fs.existsSync(layoutPath)) {
  fs.unlinkSync(layoutPath);
  console.log('finalize: removed unused activity_main.xml');
}

const javaRoot = path.join(root, 'android/app/src/main/java');
for (const p of walkFiles(javaRoot)) {
  if (!p.endsWith('.java')) continue;
  const text = fs.readFileSync(p, 'utf8');
  if (p.endsWith('MainActivity.java')) continue;
  if (/BridgeActivity|UStationApplication|com\.getcapacitor|com\.tencent\.smtt|geckoview/i.test(text)) {
    fs.unlinkSync(p);
    console.log('finalize: removed', path.relative(root, p));
    continue;
  }
  for (const bad of FORBIDDEN_JAVA) {
    if (text.includes(bad)) {
      fail(`${path.relative(root, p)} contains forbidden: ${bad}`);
    }
  }
}

const mainJava = mainPath && fs.existsSync(mainPath) ? fs.readFileSync(mainPath, 'utf8') : '';
if (mainJava) {
  for (const bad of FORBIDDEN_JAVA) {
    if (mainJava.includes(bad)) {
      fail(`MainActivity.java contains forbidden: ${bad}`);
    }
  }
  if (!mainJava.includes(SHELL_PATCH_MARKER)) {
    fail(`MainActivity.java missing ${SHELL_PATCH_MARKER}`);
  }
}

if (failed) process.exit(1);
console.log('finalize-android-production: OK');

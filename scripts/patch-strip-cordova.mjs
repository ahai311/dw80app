/**
 * 彻底移除 Cordova / Capacitor Bridge 原生模块，仅保留纯 AppCompat + 系统 WebView 工程
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAppGradleDeps } from './lib/normalize-app-gradle-deps.mjs';
import { resolveTargetSdkLevels } from './lib/resolve-target-sdk.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidRoot = path.join(root, 'android');

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}
function write(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf8');
}

// settings.gradle：仅 :app
const settingsPath = path.join(androidRoot, 'settings.gradle');
if (fs.existsSync(settingsPath)) {
  write(
    settingsPath,
    `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "android"
include ':app'
`,
  );
  console.log('patch-strip-cordova: settings.gradle → app only');
}

// 删除 cordova / capacitor 子工程目录
for (const dir of ['capacitor-cordova-android-plugins', 'capacitor-android']) {
  const p = path.join(androidRoot, dir);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log('patch-strip-cordova: removed', dir);
  }
}

const appGradlePath = path.join(androidRoot, 'app/build.gradle');
if (fs.existsSync(appGradlePath)) {
  let g = read(appGradlePath);
  g = g.replace(/apply from: ['"]capacitor\.build\.gradle['"]\s*\n?/g, '');
  g = g.replace(/apply from: ['"]\.\.\/capacitor-cordova-android-plugins\/cordova\.variables\.gradle['"]\s*\n?/g, '');
  g = g.replace(/^\s*implementation\s+project\(['"]:capacitor-[^'"]+['"]\)\s*\n/gm, '');
  g = g.replace(/^\s*implementation\s+project\(['"]path:\s*':capacitor-[^'"]+['"]\)\s*\n/gm, '');
  g = g.replace(/^\s*implementation\s+["']org\.apache\.cordova:[^"']+["']\s*\n/gm, '');
  g = g.replace(
    /repositories\s*\{\s*flatDir\s*\{[^}]*\}\s*\}\s*\n?/s,
    'repositories {\n    google()\n    mavenCentral()\n}\n\n',
  );
  g = g.replace(/^\s*implementation\s+["']androidx\.coordinatorlayout:[^"']+["']\s*\n/gm, '');
  g = normalizeAppGradleDeps(g);
  write(appGradlePath, g);
  console.log('patch-strip-cordova: app/build.gradle lean');
}

// variables.gradle：精简（无 Cordova）
const { minSdk, compileSdk, targetSdk } = resolveTargetSdkLevels();
const varsPath = path.join(androidRoot, 'variables.gradle');
write(
  varsPath,
  `ext {
    minSdkVersion = ${minSdk}
    compileSdkVersion = ${compileSdk}
    targetSdkVersion = ${targetSdk}
    coreSplashScreenVersion = '1.0.1'
    junitVersion = '4.13.2'
    androidxJunitVersion = '1.2.1'
    androidxEspressoCoreVersion = '3.6.1'
}
`,
);

// 根 build.gradle 去掉 capacitor 引用
const rootGradle = path.join(androidRoot, 'build.gradle');
if (fs.existsSync(rootGradle)) {
  let g = read(rootGradle);
  g = g.replace(/apply from:.*cordova.*\n/gi, '');
  g = g.replace(/apply from:.*capacitor\.settings\.gradle.*\n/gi, '');
  write(rootGradle, g);
}

const capSettings = path.join(androidRoot, 'capacitor.settings.gradle');
if (fs.existsSync(capSettings)) {
  fs.unlinkSync(capSettings);
  console.log('patch-strip-cordova: removed capacitor.settings.gradle');
}

// AndroidManifest：仅 INTERNET
const manifestPath = path.join(androidRoot, 'app/src/main/AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let m = read(manifestPath);
  m = m.replace(/<uses-permission[^>]*\/>\s*/g, '');
  if (!m.includes('INTERNET')) {
    m = m.replace(
      /<manifest[^>]*>/,
      (head) => `${head}\n\n    <uses-permission android:name="android.permission.INTERNET" />`,
    );
  }
  m = m.replace(/\s*<provider[\s\S]*?com\.getcapacitor[\s\S]*?<\/provider>\s*/g, '\n');
  m = m.replace(/\s*<provider[\s\S]*?FileProvider[\s\S]*?<\/provider>\s*/g, '\n');
  write(manifestPath, m);
  console.log('patch-strip-cordova: manifest INTERNET only');
}

const colorsPath = path.join(androidRoot, 'app/src/main/res/values/colors.xml');
if (fs.existsSync(path.dirname(colorsPath))) {
  write(
    colorsPath,
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#FFFFFFFF</color>
    <color name="colorPrimaryDark">#FFFFFFFF</color>
    <color name="colorAccent">#FFFFFFFF</color>
</resources>
`,
  );
  console.log('patch-strip-cordova: colors.xml');
}

console.log('patch-strip-cordova: OK (no Cordova, no Capacitor Bridge)');

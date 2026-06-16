/**
 * CI：纯系统 WebView 壳（无 Cordova / Capacitor Bridge / X5 / Gecko / androidx.webkit）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTargetUrl, hostFromTargetUrl } from './lib/target-url.mjs';
import { resolveTargetSdkLevels } from './lib/resolve-target-sdk.mjs';
import { resolveCiAppDisplayName } from './lib/app-display-name.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHELL_PATCH_MARKER = 'shellPatchVersion=33';
const targetUrl = normalizeTargetUrl(
  process.env.TARGET_URL || process.env.APP_TARGET_URL,
  'https://example.com/',
);
const expectedHost = hostFromTargetUrl(targetUrl);

const FORBIDDEN = [
  'appendDebug',
  'setupDebugOverlay',
  'debugPatchVersion',
  'debugTextView',
  'debugScroll',
  'loadDebugConfig',
  'extends BridgeActivity',
  'com.getcapacitor',
  'com.tencent.smtt',
  'org.mozilla.geckoview',
  'androidx.webkit',
  'GeckoView',
  '0xFF00FF00',
  '0xE6000000',
  'debug-overlay',
  'debug-info.json',
];

let failed = false;
function fail(msg) {
  console.error(`::error::${msg}`);
  failed = true;
}

const cfgPath = path.join(root, 'capacitor.config.json');
if (!fs.existsSync(cfgPath)) {
  fail('capacitor.config.json missing');
} else {
  const cfgText = fs.readFileSync(cfgPath, 'utf8');
  if (/"url"\s*:/.test(cfgText) && /"server"[\s\S]*"url"/.test(cfgText)) {
    fail('capacitor.config.json 仍含 server.url');
  }
  if (/["']plugins["']/.test(cfgText) && /SplashScreen|CapacitorHttp|Camera|Geolocation/i.test(cfgText)) {
    fail('capacitor.config.json 不得含原生插件配置');
  }
}

for (const rel of [
  'www/debug-info.json',
  'www/debug-overlay.js',
  'android/app/src/main/assets/public/debug-info.json',
  'android/app/src/main/assets/public/debug-overlay.js',
]) {
  if (fs.existsSync(path.join(root, rel))) {
    fail(`禁止存在 ${rel}`);
  }
}

const xmlPath = path.join(root, 'android/app/src/main/res/values/ustation_target.xml');
if (!fs.existsSync(xmlPath)) {
  fail('ustation_target.xml missing');
} else {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  if (expectedHost && !xml.toLowerCase().includes(expectedHost)) {
    fail(`ustation_target.xml 未包含 ${expectedHost}`);
  }
}

const appGradlePath = path.join(root, 'android/app/build.gradle');
const settingsPath = path.join(root, 'android/settings.gradle');
if (fs.existsSync(appGradlePath)) {
  const appGradle = fs.readFileSync(appGradlePath, 'utf8');
  if (/geckoview|mozilla\.geckoview/i.test(appGradle)) fail('禁止 geckoview 依赖');
  if (/tencent\.tbs|tbssdk/i.test(appGradle)) fail('禁止 X5 依赖');
  if (/cordova|capacitor-android|capacitor-cordova/i.test(appGradle)) {
    fail('app/build.gradle 不得依赖 Cordova/Capacitor 原生模块');
  }
  if (/androidx\.webkit/i.test(appGradle)) fail('禁止 androidx.webkit');
}
if (fs.existsSync(settingsPath)) {
  const settings = fs.readFileSync(settingsPath, 'utf8');
  if (/capacitor-cordova|capacitor-android/i.test(settings)) {
    fail('settings.gradle 不得 include Cordova/Capacitor 子工程');
  }
}

function findMainJava() {
  const base = path.join(root, 'android/app/src/main/java');
  if (!fs.existsSync(base)) return '';
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) stack.push(p);
      else if (name === 'MainActivity.java') return fs.readFileSync(p, 'utf8');
    }
  }
  return '';
}

const mainJava = findMainJava();
if (!mainJava) {
  fail('MainActivity.java missing');
} else {
  for (const bad of FORBIDDEN) {
    if (mainJava.includes(bad)) fail(`MainActivity.java 含禁止内容: ${bad}`);
  }
  if (!mainJava.includes(SHELL_PATCH_MARKER)) fail(`MainActivity.java 缺少 ${SHELL_PATCH_MARKER}`);
  if (!mainJava.includes('android.webkit.WebView')) fail('MainActivity 必须使用系统 WebView');
  if (!mainJava.includes('R.drawable.splash')) fail('MainActivity 须使用 R.drawable.splash');
  if (!mainJava.includes('R.bool.launch_has_splash')) {
    fail('MainActivity 须根据 R.bool.launch_has_splash 显示启动图');
  }
  if (!mainJava.includes('splashSkipButton') || !mainJava.includes('"SKIP"')) {
    fail('MainActivity 启动图须含右上角 SKIP 按钮');
  }
  if (mainJava.includes('SplashScreen.installSplashScreen')) {
    fail('MainActivity 不得使用 SplashScreen API（与全屏启动图冲突）');
  }
}

const productionReady = process.env.CHECK_PRODUCTION_READY === '1';
const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');

if (productionReady && fs.existsSync(manifestPath)) {
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  if (!/android:label="@string\/app_name"/.test(manifest)) {
    fail('AndroidManifest application 须 android:label="@string/app_name"');
  }
  if (!/android:hardwareAccelerated="true"/.test(manifest)) {
    fail('AndroidManifest 须 android:hardwareAccelerated="true"');
  }
  const perms = manifest.match(/<uses-permission[^>]+>/g) || [];
  for (const p of perms) {
    if (!/INTERNET/.test(p)) fail(`禁止多余权限: ${p}`);
  }
}

const varsPath = path.join(root, 'android/variables.gradle');
if (productionReady && fs.existsSync(varsPath)) {
  const vars = fs.readFileSync(varsPath, 'utf8');
  const { minSdk, compileSdk, targetSdk } = resolveTargetSdkLevels();
  if (!new RegExp(`compileSdkVersion\\s*=\\s*${compileSdk}`).test(vars)) {
    fail(`compileSdkVersion 须为 ${compileSdk}`);
  }
  if (!new RegExp(`targetSdkVersion\\s*=\\s*${targetSdk}`).test(vars)) {
    fail(`targetSdkVersion 须为 ${targetSdk}`);
  }
  if (!new RegExp(`minSdkVersion\\s*=\\s*${minSdk}`).test(vars)) {
    fail(`minSdkVersion 须为 ${minSdk}`);
  }
  if (/cordovaAndroidVersion/i.test(vars)) fail('variables.gradle 不得含 cordovaAndroidVersion');
}

if (productionReady && fs.existsSync(appGradlePath)) {
  const appGradle = fs.readFileSync(appGradlePath, 'utf8');
  if (!/abiFilters/.test(appGradle) || !/arm64-v8a/.test(appGradle)) {
    fail('须含 ndk abiFilters arm64-v8a');
  }
  const propsPath = path.join(root, 'android/gradle.properties');
  if (fs.existsSync(propsPath)) {
    const props = fs.readFileSync(propsPath, 'utf8');
    if (!/android\.enableV1Signing=(true|false)/.test(props)) fail('gradle.properties 须 enableV1Signing');
    if (!/android\.enableV2Signing=true/.test(props)) fail('gradle.properties 须 enableV2Signing');
    if (!/android\.enableV3Signing=true/.test(props)) fail('gradle.properties 须 enableV3Signing');
    if (/enableNativeLibraryPageAlignment=true/.test(props)) {
      fail('纯 Capacitor 壳不应开启 enableNativeLibraryPageAlignment');
    }
  }
}

if (productionReady) {
  const stringsPath = path.join(root, 'android/app/src/main/res/values/strings.xml');
  if (fs.existsSync(stringsPath)) {
    const xml = fs.readFileSync(stringsPath, 'utf8');
    const m = xml.match(/<string name="app_name">([^<]*)<\/string>/);
    const label = m?.[1] || '';
    if (/\?\?/.test(label)) fail(`app_name 中文乱码: ${label}`);
    const expected = resolveCiAppDisplayName(process.env, root);
    if (expected && label !== expected) {
      fail(`app_name 期望「${expected}」实际「${label}」`);
    }
  }

  const launcherBg = path.join(root, 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_background.png');
  const launcherSize = fs.existsSync(launcherBg) ? fs.statSync(launcherBg).size : 0;
  if (launcherSize < 4096) {
    fail(`自定义 launcher 未生效 (${launcherBg} ${launcherSize} bytes)，请检查 resources/icon.png 与 apply-android-assets`);
  }
  const adaptiveXml = path.join(root, 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
  if (fs.existsSync(adaptiveXml)) {
    const ax = fs.readFileSync(adaptiveXml, 'utf8');
    if (/@mipmap\/ic_launcher[^_"]/.test(ax)) {
      fail('adaptive-icon 不得引用 @mipmap/ic_launcher（会导致图标空白）');
    }
    if (!/@mipmap\/ic_launcher_background/.test(ax) || !/@mipmap\/ic_launcher_foreground/.test(ax)) {
      fail('adaptive-icon 须使用 ic_launcher_background + ic_launcher_foreground');
    }
  }
}

if (failed) process.exit(1);
console.log(`OK: pure_webview_no_cordova target=${targetUrl}`);

/** cap sync 后：写入系统 WebView MainActivity + NoActionBar 主题 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMainActivitySource } from './main-activity-java.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesPath = path.join(root, 'android/app/src/main/res/values/styles.xml');

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

const noActionBarBlock = `    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@android:color/white</item>
        <item name="android:windowBackground">@android:color/white</item>
        <item name="android:statusBarColor">@android:color/white</item>
        <item name="android:navigationBarColor">@android:color/white</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:windowLightNavigationBar">true</item>
        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>
    </style>`;

const launchBlock = `    <style name="AppTheme.NoActionBarLaunch" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowBackground">@android:color/white</item>
        <item name="android:statusBarColor">@android:color/white</item>
        <item name="android:navigationBarColor">@android:color/white</item>
    </style>`;

const resourcesDir = path.join(root, 'resources');
const hasSplashAsset =
  fs.existsSync(path.join(resourcesDir, 'splash.png')) &&
  fs.statSync(path.join(resourcesDir, 'splash.png')).size >= 32;

if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, 'utf8');
  styles = styles.replace(/<style name="AppTheme\.NoActionBar"[\s\S]*?<\/style>/, noActionBarBlock);
  if (!hasSplashAsset) {
    styles = styles.replace(/<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/, launchBlock);
  }
  fs.writeFileSync(stylesPath, styles, 'utf8');
}

const mainPath = findMainActivity();
if (!mainPath) {
  console.error('::error::MainActivity.java not found — run cap add android first');
  process.exit(1);
}
const pkg = mainPath
  .replace(/\\/g, '/')
  .split('/java/')[1]
  .replace('/MainActivity.java', '')
  .replace(/\//g, '.');
fs.writeFileSync(mainPath, getMainActivitySource(pkg), 'utf8');
console.log('patch-android-webview: system WebView production');

const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  manifest = manifest.replace(/<application\b([^>]*)>/, (m, attrs) => {
    let a = attrs.replace(/\s*android:hardwareAccelerated="[^"]*"/g, '');
    if (!/android:hardwareAccelerated=/.test(a)) {
      a += ' android:hardwareAccelerated="true"';
    }
    return `<application${a}>`;
  });
  manifest = manifest.replace(/android:theme="@style\/AppTheme"/g, 'android:theme="@style/AppTheme.NoActionBar"');
  if (!hasSplashAsset) {
    manifest = manifest.replace(
      /android:theme="@style\/AppTheme\.NoActionBarLaunch"/,
      'android:theme="@style/AppTheme.NoActionBar"',
    );
  }
  manifest = manifest.replace(
    /android:name="\.MainActivity"([^>]*?)android:label="[^"]*"/,
    'android:name=".MainActivity"$1android:label=""',
  );
  if (!manifest.includes('android:windowSoftInputMode')) {
    manifest = manifest.replace(
      /android:launchMode="singleTask"/,
      'android:launchMode="singleTask"\n            android:windowSoftInputMode="adjustResize"',
    );
  }
  manifest = manifest.replace(/<application\b([^>]*)>/, (m, attrs) => {
    let a = attrs.replace(/\s*android:label="[^"]*"/g, '');
    if (!/android:label=/.test(a)) {
      a += ' android:label=""';
    }
    return `<application${a}>`;
  });
  fs.writeFileSync(manifestPath, manifest, 'utf8');
}

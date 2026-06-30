/**
 * 将 resources/*.png 写入 Android 启动图标、自适应图标、启动图
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const resRoot = path.join(root, 'android/app/src/main/res');
const resources = path.join(root, 'resources');
const MIPMAP_DENSITIES = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];
const SPLASH_DRAWABLE_DIRS = ['drawable-nodpi', 'drawable'];
const MIN_ICON_BYTES = 4096;

function copyIfExists(src, destPath) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(src, destPath);
  console.log('apply-android-assets:', path.relative(root, destPath));
  return true;
}

function iconSourceSize(iconPath) {
  try {
    return fs.statSync(iconPath).size;
  } catch {
    return 0;
  }
}

/** 删除 Capacitor sync 生成的默认 splash */
function removeCapacitorDefaultSplashes() {
  if (!fs.existsSync(resRoot)) return;
  for (const name of fs.readdirSync(resRoot)) {
    if (!name.startsWith('drawable')) continue;
    if (name === 'drawable-nodpi') continue;
    const p = path.join(resRoot, name, 'splash.png');
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log('apply-android-assets: removed default', path.relative(root, p));
    }
  }
}

/** 删除 Capacitor 默认 launcher（避免 Python 失败时仍显示蓝 C 图标） */
function removeCapacitorDefaultLaunchers() {
  if (!fs.existsSync(resRoot)) return;
  for (const name of fs.readdirSync(resRoot)) {
    if (!name.startsWith('mipmap')) continue;
    const dir = path.join(resRoot, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (/^ic_launcher/.test(file)) {
        const p = path.join(dir, file);
        fs.unlinkSync(p);
        console.log('apply-android-assets: removed default', path.relative(root, p));
      }
    }
  }
}

function patchAdaptiveLauncherIcons(dominantColor) {
  const anydpi = path.join(resRoot, 'mipmap-anydpi-v26');
  fs.mkdirSync(anydpi, { recursive: true });

  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    fs.writeFileSync(path.join(anydpi, name), adaptiveXml, 'utf8');
    console.log('apply-android-assets:', path.relative(root, path.join(anydpi, name)));
  }

  const bgPath = path.join(resRoot, 'values/ic_launcher_background.xml');
  const color = dominantColor || '#6F4CFA';
  fs.mkdirSync(path.dirname(bgPath), { recursive: true });
  fs.writeFileSync(
    bgPath,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${color}</color>\n</resources>\n`,
    'utf8',
  );
}

function applyLauncherIconFallback(iconPath) {
  removeCapacitorDefaultLaunchers();
  for (const dir of MIPMAP_DENSITIES) {
    const base = path.join(resRoot, dir);
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png', 'ic_launcher_background.png']) {
      copyIfExists(iconPath, path.join(base, name));
    }
  }
  patchAdaptiveLauncherIcons('#6F4CFA');
  console.log('apply-android-assets: launcher icons (fallback copy)');
  return true;
}

function applyLauncherIconWithPython(iconPath) {
  const pyScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'generate-adaptive-icons.py');
  const py = spawnSync(process.env.PYTHON_BIN || 'python3', [pyScript, iconPath, resRoot], {
    encoding: 'utf8',
  });
  if (py.status !== 0) {
    const py2 = spawnSync(process.env.PYTHON_BIN || 'python', [pyScript, iconPath, resRoot], {
      encoding: 'utf8',
    });
    if (py2.status !== 0) {
      console.warn('apply-android-assets: generate-adaptive-icons failed', (py2.stderr || py.stderr || '').trim());
      return false;
    }
    return finishPythonIcon(py2.stdout);
  }
  return finishPythonIcon(py.stdout);
}

function finishPythonIcon(stdout) {
  let meta = {};
  try {
    meta = JSON.parse(String(stdout || '').trim().split('\n').pop() || '{}');
  } catch {
    meta = {};
  }
  patchAdaptiveLauncherIcons(meta.dominantColor);
  console.log('apply-android-assets: adaptive icons', meta.dominantColor || '', `safe=${meta.safeScale || 0.72}`);
  return true;
}

function applyLauncherIcon(iconPath) {
  if (!fs.existsSync(iconPath)) return false;
  if (iconSourceSize(iconPath) < MIN_ICON_BYTES) {
    console.warn(`apply-android-assets: icon too small (${iconSourceSize(iconPath)} bytes), skip`);
    return false;
  }
  removeCapacitorDefaultLaunchers();
  if (applyLauncherIconWithPython(iconPath)) return true;
  console.warn('apply-android-assets: Python 失败，使用 Node 回退复制');
  return applyLauncherIconFallback(iconPath);
}

function verifyLauncherIconApplied() {
  const probe = path.join(resRoot, 'mipmap-xxhdpi/ic_launcher_background.png');
  const size = fs.existsSync(probe) ? fs.statSync(probe).size : 0;
  if (size < MIN_ICON_BYTES) {
    console.error(`::error::自定义 launcher 未写入 (${probe} ${size} bytes)`);
    process.exit(1);
  }
  const anydpi = path.join(resRoot, 'mipmap-anydpi-v26/ic_launcher.xml');
  if (!fs.existsSync(anydpi)) {
    console.error('::error::缺少 mipmap-anydpi-v26/ic_launcher.xml');
    process.exit(1);
  }
  const xml = fs.readFileSync(anydpi, 'utf8');
  if (/@mipmap\/ic_launcher[^_"]/.test(xml)) {
    console.error('::error::adaptive-icon 不得引用 @mipmap/ic_launcher（循环引用）');
    process.exit(1);
  }
  console.log('apply-android-assets: launcher verify OK', size, 'bytes');
}

function applySplash(splashPath) {
  if (!fs.existsSync(splashPath)) return false;
  if (iconSourceSize(splashPath) < 10_000) return false;
  removeCapacitorDefaultSplashes();
  for (const dir of SPLASH_DRAWABLE_DIRS) {
    copyIfExists(splashPath, path.join(resRoot, dir, 'splash.png'));
  }
  return true;
}

function writeSplashColors() {
  const colorsPath = path.join(resRoot, 'values/colors.xml');
  const block = `    <color name="splash_backdrop">#0B0F1A</color>\n`;
  if (fs.existsSync(colorsPath)) {
    let xml = fs.readFileSync(colorsPath, 'utf8');
    if (!xml.includes('splash_backdrop')) {
      xml = xml.replace('</resources>', `${block}</resources>`);
      fs.writeFileSync(colorsPath, xml, 'utf8');
    }
  } else {
    fs.mkdirSync(path.dirname(colorsPath), { recursive: true });
    fs.writeFileSync(
      colorsPath,
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${block}</resources>\n`,
      'utf8',
    );
  }
}

function writeSplashLaunchDrawable() {
  const xmlPath = path.join(resRoot, 'drawable/splash_launch.xml');
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/splash_backdrop" />
    <item>
        <bitmap android:gravity="center" android:src="@drawable/splash" />
    </item>
</layer-list>
`;
  fs.mkdirSync(path.dirname(xmlPath), { recursive: true });
  fs.writeFileSync(xmlPath, xml, 'utf8');
  console.log('apply-android-assets:', path.relative(root, xmlPath));
}

function writeLaunchHasSplashBool(hasSplash) {
  const boolPath = path.join(resRoot, 'values/launch_splash.xml');
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <bool name="launch_has_splash">${hasSplash ? 'true' : 'false'}</bool>
</resources>
`;
  fs.mkdirSync(path.dirname(boolPath), { recursive: true });
  fs.writeFileSync(boolPath, xml, 'utf8');
}

function patchLaunchStyles(hasSplash) {
  const stylesPath = path.join(resRoot, 'values/styles.xml');
  if (!fs.existsSync(stylesPath)) return;

  let styles = fs.readFileSync(stylesPath, 'utf8');
  const launchBlock = hasSplash
    ? `    <style name="AppTheme.NoActionBarLaunch" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowBackground">@drawable/splash_launch</item>
        <item name="android:statusBarColor">@color/splash_backdrop</item>
        <item name="android:navigationBarColor">@color/splash_backdrop</item>
    </style>`
    : `    <style name="AppTheme.NoActionBarLaunch" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowBackground">@android:color/white</item>
        <item name="android:statusBarColor">@android:color/white</item>
        <item name="android:navigationBarColor">@android:color/white</item>
    </style>`;

  if (styles.includes('AppTheme.NoActionBarLaunch')) {
    styles = styles.replace(/<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/, launchBlock);
  } else {
    styles = styles.replace('</resources>', `${launchBlock}\n</resources>`);
  }
  if (/parent="Theme\.SplashScreen"/.test(styles)) {
    console.error('::error::styles.xml 仍含 Theme.SplashScreen');
    process.exit(1);
  }
  fs.writeFileSync(stylesPath, styles, 'utf8');
  console.log('apply-android-assets: launch theme', hasSplash ? 'fullscreen splash' : 'white only');
}

if (!fs.existsSync(resRoot)) {
  console.warn('apply-android-assets: res/ missing, skip');
  process.exit(0);
}

const iconPathCandidate = path.join(resources, 'icon.png');
const iconPath = fs.existsSync(iconPathCandidate) && iconSourceSize(iconPathCandidate) >= MIN_ICON_BYTES 
  ? iconPathCandidate 
  : null;
const splashPath = path.join(resources, 'splash.png');

const hasIcon = iconPath ? applyLauncherIcon(iconPath) : false;
const hasSplash = applySplash(splashPath);
if (hasSplash) {
  writeSplashColors();
  writeSplashLaunchDrawable();
}
writeLaunchHasSplashBool(hasSplash);
patchLaunchStyles(hasSplash);

if (hasIcon) {
  verifyLauncherIconApplied();
} else {
  const rawIcon = path.join(resources, 'icon.png');
  if (fs.existsSync(rawIcon) && iconSourceSize(rawIcon) >= MIN_ICON_BYTES) {
    console.error('::error::resources/icon.png 存在但 launcher 写入失败');
    process.exit(1);
  }
  console.warn('apply-android-assets: no valid icon.png — using Capacitor default launcher');
}

if (!hasSplash) console.warn('apply-android-assets: no splash.png — white launch screen only');

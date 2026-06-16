#!/usr/bin/env node
/**
 * 校验 APK 合并后的 Manifest SDK（避免 Gradle 缓存产出旧 minSdk/targetSdk）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveTargetSdkLevels } from './lib/resolve-target-sdk.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dumpPy = path.join(scriptDir, 'dump-apk-sdk.py');

const apkPath = path.resolve(process.argv[2] || '');
if (!fs.existsSync(apkPath)) {
  console.error('::error::APK not found:', apkPath);
  process.exit(1);
}

const { minSdk, targetSdk } = resolveTargetSdkLevels();

function parseAapt(stdout) {
  const minM = stdout.match(/sdkVersion:'(\d+)'/);
  const targetM = stdout.match(/targetSdkVersion:'(\d+)'/);
  const pkgM = stdout.match(/^package: name='([^']+)'/m);
  return {
    minSdkVersion: minM ? Number(minM[1]) : NaN,
    targetSdkVersion: targetM ? Number(targetM[1]) : NaN,
    package: pkgM?.[1] || '?',
  };
}

function readViaAapt() {
  const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
  if (!home) return null;
  const btRoot = path.join(home, 'build-tools');
  if (!fs.existsSync(btRoot)) return null;
  const versions = fs
    .readdirSync(btRoot)
    .filter((n) => fs.existsSync(path.join(btRoot, n, process.platform === 'win32' ? 'aapt.exe' : 'aapt')))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const aapt = versions[0]
    ? path.join(btRoot, versions[0], process.platform === 'win32' ? 'aapt.exe' : 'aapt')
    : '';
  if (!aapt) return null;
  const r = spawnSync(aapt, ['dump', 'badging', apkPath], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return parseAapt(r.stdout || '');
}

function readViaPython() {
  const py = spawnSync(process.env.PYTHON_BIN || 'python', [dumpPy, apkPath], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  if (py.status !== 0) return null;
  const vals = Object.fromEntries(
    (py.stdout || '')
      .trim()
      .split('\n')
      .map((l) => l.split(/\s+/, 2)),
  );
  return {
    minSdkVersion: Number(vals.minSdkVersion?.[1]),
    targetSdkVersion: Number(vals.targetSdkVersion?.[1]),
    package: vals.package?.[1] || '?',
  };
}

const vals = readViaAapt() || readViaPython();
if (!vals) {
  console.error('::error::verify-apk-sdk: need aapt (ANDROID_HOME) or python+androguard');
  process.exit(1);
}

let ok = true;
if (vals.minSdkVersion !== minSdk) {
  console.error(`::error::APK minSdkVersion=${vals.minSdkVersion} expected ${minSdk}`);
  ok = false;
}
if (vals.targetSdkVersion !== targetSdk) {
  console.error(`::error::APK targetSdkVersion=${vals.targetSdkVersion} expected ${targetSdk}`);
  ok = false;
}
if (!ok) process.exit(1);
console.log(
  `verify-apk-sdk: minSdk=${vals.minSdkVersion} targetSdk=${vals.targetSdkVersion} package=${vals.package}`,
);

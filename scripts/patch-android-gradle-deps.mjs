/**
 * Gradle：纯 Capacitor WebView 壳 — SDK 36 / minSdk 24 / V1+V2+V3（无 16KB native 对齐）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTargetSdkLevels, resolveGradleSigningFlags } from './lib/resolve-target-sdk.mjs';
import { normalizeAppGradleDeps } from './lib/normalize-app-gradle-deps.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = path.join(root, 'android/app/build.gradle');
const variablesPath = path.join(root, 'android/variables.gradle');
const rootGradlePath = path.join(root, 'android/build.gradle');
const wrapperPath = path.join(root, 'android/gradle/wrapper/gradle-wrapper.properties');
const gradlePropsPath = path.join(root, 'android/gradle.properties');

const REQUIRED_ABIS = "'arm64-v8a', 'armeabi-v7a'";

function patchSdkLevels() {
  const { minSdk, compileSdk, targetSdk } = resolveTargetSdkLevels();
  if (fs.existsSync(variablesPath)) {
    let v = fs.readFileSync(variablesPath, 'utf8');
    v = v.replace(/minSdkVersion\s*=\s*\d+/, `minSdkVersion = ${minSdk}`);
    v = v.replace(/compileSdkVersion\s*=\s*\d+/, `compileSdkVersion = ${compileSdk}`);
    v = v.replace(/targetSdkVersion\s*=\s*\d+/, `targetSdkVersion = ${targetSdk}`);
    fs.writeFileSync(variablesPath, v, 'utf8');
  }
  if (fs.existsSync(rootGradlePath)) {
    let g = fs.readFileSync(rootGradlePath, 'utf8');
    g = g.replace(/com\.android\.tools\.build:gradle:[\d.]+/, 'com.android.tools.build:gradle:8.7.3');
    fs.writeFileSync(rootGradlePath, g, 'utf8');
  }
  if (fs.existsSync(wrapperPath)) {
    let w = fs.readFileSync(wrapperPath, 'utf8');
    w = w.replace(/gradle-[\d.]+-all\.zip/, 'gradle-8.9-all.zip');
    fs.writeFileSync(wrapperPath, w, 'utf8');
  }
  patchGradleProperties();
}

function patchGradleProperties() {
  const sign = resolveGradleSigningFlags();
  let props = fs.existsSync(gradlePropsPath) ? fs.readFileSync(gradlePropsPath, 'utf8') : '';
  props = props.replace(/android\.native\.enableNativeLibraryPageAlignment=.*\n/g, '');
  props = props.replace(/android\.enableV1Signing=.*\n/g, '');
  props = props.replace(/android\.enableV2Signing=.*\n/g, '');
  props = props.replace(/android\.enableV3Signing=.*\n/g, '');
  props = props.replace(/android\.enableV4Signing=.*\n/g, '');
  if (!props.includes('android.useAndroidX')) {
    props += 'android.useAndroidX=true\n';
  }
  props += `android.enableV1Signing=${sign.v1}\n`;
  props += `android.enableV2Signing=${sign.v2}\n`;
  props += `android.enableV3Signing=${sign.v3}\n`;
  fs.writeFileSync(gradlePropsPath, props, 'utf8');
}

function patchAndroidResourcesNoCompress(gradle) {
  const block = `
    androidResources {
        noCompress 'arsc'
    }
    aaptOptions {
        noCompress 'arsc'
    }`;
  if (/androidResources\s*\{/.test(gradle)) return gradle;
  if (/android\s*\{/.test(gradle)) {
    return gradle.replace(/android\s*\{/, `android {${block}`);
  }
  return gradle;
}

function patchDefaultConfig(gradle) {
  const { minSdk, compileSdk, targetSdk } = resolveTargetSdkLevels();
  let g = gradle;
  g = g.replace(/minSdkVersion\s+rootProject\.ext\.minSdkVersion/, `minSdkVersion ${minSdk}`);
  g = g.replace(/minSdk\s+rootProject\.ext\.minSdkVersion/, `minSdk ${minSdk}`);
  g = g.replace(/targetSdkVersion\s+rootProject\.ext\.targetSdkVersion/, `targetSdkVersion ${targetSdk}`);
  g = g.replace(/targetSdk\s+rootProject\.ext\.targetSdkVersion/, `targetSdk ${targetSdk}`);
  g = g.replace(/compileSdkVersion\s+rootProject\.ext\.compileSdkVersion/, `compileSdkVersion ${compileSdk}`);
  g = g.replace(/compileSdk\s+rootProject\.ext\.compileSdkVersion/, `compileSdk ${compileSdk}`);
  g = g.replace(/minSdkVersion\s+\d+/, `minSdkVersion ${minSdk}`);
  g = g.replace(/minSdk\s+\d+/, `minSdk ${minSdk}`);
  g = g.replace(/targetSdkVersion\s+\d+/, `targetSdkVersion ${targetSdk}`);
  g = g.replace(/targetSdk\s+\d+/, `targetSdk ${targetSdk}`);
  g = g.replace(/compileSdkVersion\s+\d+/, `compileSdkVersion ${compileSdk}`);
  g = g.replace(/compileSdk\s+\d+/, `compileSdk ${compileSdk}`);

  if (/ndk\s*\{[^}]*abiFilters/.test(g)) {
    g = g.replace(/abiFilters\s+[^\n]+/, `abiFilters ${REQUIRED_ABIS}`);
  } else if (/defaultConfig\s*\{/.test(g)) {
    g = g.replace(
      /defaultConfig\s*\{/,
      `defaultConfig {\n        ndk {\n            abiFilters ${REQUIRED_ABIS}\n        }`,
    );
  }
  return g;
}

function stripInvalidSigningDsl(gradle) {
  return gradle
    .replace(/^\s*v1SigningEnabled\s+\w+\s*\n/gm, '')
    .replace(/^\s*v2SigningEnabled\s+\w+\s*\n/gm, '');
}

function stripSixteenKbPackaging(gradle) {
  return gradle
    .replace(/\s*packaging\s*\{[^}]*jniLibs[^}]*\}\s*/s, '\n')
    .replace(/ndkVersion\s+"[^"]+"\s*\n/g, '');
}

if (!fs.existsSync(gradlePath)) {
  console.warn('patch-android-gradle-deps: build.gradle not found, skip');
  patchSdkLevels();
  process.exit(0);
}

let gradle = fs.readFileSync(gradlePath, 'utf8');

gradle = normalizeAppGradleDeps(gradle);
gradle = gradle.replace(/shrinkResources\s+true/g, 'shrinkResources false');
gradle = gradle.replace(/^\s*implementation\s+'com\.tencent\.tbs:[^']+'\s*\n/gm, '');
gradle = gradle.replace(/^\s*implementation\s+"com\.tencent\.tbs:[^"]+"\s*\n/gm, '');
gradle = gradle.replace(
  /^\s*implementation\s+['"]org\.mozilla\.geckoview:geckoview:[^'"]+['"]\s*\n/gm,
  '',
);
gradle = gradle.replace(/^\s*implementation\s+['"]androidx\.multidex:multidex:[^'"]+['"]\s*\n/gm, '');
gradle = gradle.replace(/^\s*testImplementation\s+[^\n]+\n/gm, '');
gradle = gradle.replace(/^\s*androidTestImplementation\s+[^\n]+\n/gm, '');

const deps = [
  "implementation 'androidx.appcompat:appcompat:1.6.1'",
  "implementation 'androidx.browser:browser:1.8.0'",
  "implementation 'androidx.core:core-splashscreen:1.0.1'",
];
for (const dep of deps) {
  const key = dep.split("'")[1]?.split(':')?.slice(0, 2).join(':') || dep;
  if (!gradle.includes(key)) {
    gradle = gradle.replace(/dependencies\s*\{/, `dependencies {\n    ${dep}`);
  }
}

gradle = stripSixteenKbPackaging(gradle);
gradle = patchDefaultConfig(gradle);
gradle = patchAndroidResourcesNoCompress(gradle);
gradle = stripInvalidSigningDsl(gradle);

fs.writeFileSync(gradlePath, gradle, 'utf8');
patchSdkLevels();
const { minSdk, compileSdk, targetSdk } = resolveTargetSdkLevels();
const sign = resolveGradleSigningFlags();
console.log(
  `patch-android-gradle-deps: minSdk=${minSdk} compileSdk=${compileSdk} targetSdk=${targetSdk} gradleSign V1=${sign.v1} V2=${sign.v2} V3=${sign.v3}`,
);

#!/usr/bin/env node
/**
 * CI：校验 iOS 工程已生成且为 redirect WebView 壳
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTargetUrl, hostFromTargetUrl } from './lib/target-url.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const iosApp = path.join(root, 'ios/App');
const targetUrl = normalizeTargetUrl(
  process.env.TARGET_URL || process.env.APP_TARGET_URL,
  'https://example.com/',
);
const expectedHost = hostFromTargetUrl(targetUrl);

let failed = false;
function fail(msg) {
  console.error(`::error::${msg}`);
  failed = true;
}

if (!fs.existsSync(iosApp)) {
  fail('ios/App missing');
  process.exit(1);
}

const pbx = path.join(iosApp, 'App.xcodeproj/project.pbxproj');
if (!fs.existsSync(pbx)) {
  fail('App.xcodeproj missing');
} else {
  const text = fs.readFileSync(pbx, 'utf8');
  if (!/PRODUCT_BUNDLE_IDENTIFIER/.test(text)) fail('project.pbxproj 无 bundle id');
}

const wwwIndex = path.join(root, 'www/index.html');
if (!fs.existsSync(wwwIndex)) {
  fail('www/index.html missing');
} else {
  const html = fs.readFileSync(wwwIndex, 'utf8');
  if (!html.includes('location.replace')) fail('www/index.html 非 redirect shell');
  if (expectedHost && !html.includes(expectedHost)) {
    fail(`www/index.html 未包含目标 host ${expectedHost}`);
  }
}

const cfg = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
if (cfg.server?.url) fail('capacitor.config.json 不得含 server.url');
if (cfg.plugins) fail('capacitor.config.json 不得含 plugins');

if (failed) process.exit(1);
console.log(`OK: ios_shell target=${targetUrl}`);

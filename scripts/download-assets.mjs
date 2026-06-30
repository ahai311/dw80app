/**
 * 从平台 URL 下载 icon / splash；本地 xh.ms 等 CI 不可达时用 resources/bundled
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './ensure-bundled-assets.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'resources');
const bundledDir = path.join(assetsDir, 'bundled');
fs.mkdirSync(assetsDir, { recursive: true });

function isPrivateHost(url) {
  try {
    const { hostname } = new URL(url);
    const h = hostname.toLowerCase();
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal)$/i.test(h)) return true;
    if (h === 'xh.ms' || h.endsWith('.xh.ms')) return true;
    if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    return false;
  } catch {
    return true;
  }
}

function copyBundled(name) {
  const src = path.join(bundledDir, name);
  const dest = path.join(assetsDir, name);
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, dest);
  console.log(`download-assets: bundled fallback ${name}`);
  return true;
}

function absUrl(base, rel) {
  const u = String(rel || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  const b = String(base || '').replace(/\/$/, '');
  if (!b) return u;
  return `${b}${u.startsWith('/') ? u : `/${u}`}`;
}

async function download(label, url, dest) {
  if (!url) return false;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) {
      console.warn(`download-assets: FAIL ${url} HTTP ${res.status}`);
      return false;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32) {
      console.warn(`download-assets: FAIL ${url} too small (${buf.length} bytes)`);
      return false;
    }
    fs.writeFileSync(dest, buf);
    console.log(`download-assets: OK ${label} (${buf.length} bytes) <- ${url}`);
    return true;
  } catch (e) {
    console.warn(`download-assets: FAIL ${url}`, e.message);
    return false;
  }
}

function useRepoAsset(name, minBytes = 4096) {
  const dest = path.join(assetsDir, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size >= minBytes) {
    console.log(`download-assets: use repo resources/${name} (${fs.statSync(dest).size} bytes)`);
    return true;
  }
  return false;
}

const platform = (process.env.PLATFORM_URL || '').replace(/\/$/, '');
const skipRemote = !platform || isPrivateHost(platform);
const iconUrl = skipRemote ? '' : absUrl(platform, process.env.ICON_URL);
const splashUrl = skipRemote ? '' : absUrl(platform, process.env.SPLASH_URL);
const squareUrl = skipRemote ? '' : absUrl(platform, process.env.SQUARE_ICON_URL);

if (skipRemote) {
  console.log('download-assets: skip remote (local/private PLATFORM_URL), prefer repo resources/');
}

let iconOk = useRepoAsset('icon.png', 4096);
let splashOk = useRepoAsset('splash.png', 10_000);
let squareOk = useRepoAsset('square-icon.png', 4096);

if (!iconOk && iconUrl && !isPrivateHost(iconUrl)) {
  iconOk = await download('icon', iconUrl, path.join(assetsDir, 'icon.png'));
}
if (!iconOk && squareUrl && !isPrivateHost(squareUrl)) {
  iconOk = await download('icon-from-square', squareUrl, path.join(assetsDir, 'icon.png'));
}
if (!squareOk && squareUrl && !isPrivateHost(squareUrl)) {
  squareOk = await download('square-icon', squareUrl, path.join(assetsDir, 'square-icon.png'));
}
if (!splashOk && splashUrl && !isPrivateHost(splashUrl)) {
  splashOk = await download('splash', splashUrl, path.join(assetsDir, 'splash.png'));
}

if (!iconOk) iconOk = copyBundled('icon.png') || copyBundled('square-icon.png');
if (!splashOk) splashOk = copyBundled('splash.png');
if (!squareOk && !fs.existsSync(path.join(assetsDir, 'square-icon.png'))) {
  squareOk = copyBundled('square-icon.png');
}

if (!iconOk) console.warn('download-assets: no launcher icon');
if (!splashOk) console.warn('download-assets: no splash');

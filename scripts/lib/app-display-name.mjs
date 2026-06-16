import fs from 'node:fs';
import path from 'node:path';
export function resolveCiAppDisplayName(env = process.env, root = null) {
  if (root) {
    try {
      const filePath = path.join(root, 'app-display-name.json');
      if (fs.existsSync(filePath)) {
        const j = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const fromFile = sanitizeAppName(j.zh || j.en || j.name);
        if (fromFile) return fromFile;
      }
    } catch {
      /* fall through */
    }
  }
  const b64 = String(env.APP_NAME_B64 || '').trim();
  if (b64) {
    try {
      const decoded = Buffer.from(b64, 'base64').toString('utf8').trim();
      if (decoded) return sanitizeAppName(decoded);
    } catch {
      /* fall through */
    }
  }
  const raw = String(env.APP_NAME_ZH || env.APP_NAME || env.APP_NAME_EN || 'App').trim() || 'App';
  return sanitizeAppName(raw);
}

export function sanitizeAppName(name) {
  return (
    String(name || 'App')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\uFFFD]/g, '')
      .trim()
      .slice(0, 30) || 'App'
  );
}

export function escapeXmlText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** 写入 launcher 显示名（UTF-8 strings.xml） */
export function writeAppNameStrings(root, appName) {
  const safe = escapeXmlText(sanitizeAppName(appName));
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">${safe}</string>\n    <string name="title_activity_main"></string>\n</resources>\n`;
  const dir = path.join(root, 'android/app/src/main/res/values');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'strings.xml'), xml, 'utf8');
}

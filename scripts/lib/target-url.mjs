/** Target URL helpers for redirect shell + Android string resources */

export function normalizeTargetUrl(raw, fallback = 'https://example.com/') {
  let u = String(raw || fallback).trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  if (!u.endsWith('/')) u += '/';
  return u;
}

export function targetWithNativeParam(url) {
  const u = normalizeTargetUrl(url);
  const sep = u.includes('?') ? '&' : '?';
  if (/[?&]native=1\b/.test(u)) return u;
  return `${u}${sep}native=1`;
}

export function hostFromTargetUrl(url) {
  try {
    return new URL(normalizeTargetUrl(url)).hostname.toLowerCase();
  } catch {
    return '';
  }
}

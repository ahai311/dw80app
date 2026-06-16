/**
 * GitHub Actions 构建结束回调平台 webhook
 */
const platformUrl = (process.env.PLATFORM_URL || '').replace(/\/$/, '');
const token = process.env.CALLBACK_TOKEN || '';
const buildId = process.env.BUILD_ID || '';
const platform = process.env.BUILD_PLATFORM || 'android';
const status = process.env.BUILD_STATUS || 'success';
const releaseTag = process.env.RELEASE_TAG || '';
const downloadUrl = process.env.DOWNLOAD_URL || '';
const fileSizeBytes = process.env.FILE_SIZE_BYTES || '';
const buildError = process.env.BUILD_ERROR || '';

if (!platformUrl || !token) {
  console.warn('skip notify: PLATFORM_URL or CALLBACK_TOKEN missing');
  process.exit(0);
}

const body = {
  token,
  buildId: buildId || undefined,
  platform,
  status,
  releaseTag: releaseTag || undefined,
  downloadUrl: downloadUrl || undefined,
  fileSizeBytes: fileSizeBytes ? Number(fileSizeBytes) : undefined,
  error: buildError || undefined,
  errorMessage: buildError || undefined,
};

const res = await fetch(`${platformUrl}/api/app-builder/webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-App-Builder-Token': token },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) {
  console.warn('notify-platform failed', res.status, text);
  process.exit(0);
}
console.log('notify-platform ok', text);

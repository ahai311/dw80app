/**
 * 纯 Capacitor WebView 壳默认 SDK / 签名档位。
 * 环境变量可覆盖：APP_BUILDER_MIN_SDK、APP_BUILDER_COMPILE_SDK、APP_BUILDER_TARGET_SDK
 */
export function resolveTargetSdkLevels() {
  const minSdk = clampSdk(
    parseInt(process.env.APP_BUILDER_MIN_SDK || process.env.MIN_SDK || '24', 10),
    21,
    36,
  );
  const compileSdk = clampSdk(
    parseInt(process.env.APP_BUILDER_COMPILE_SDK || process.env.COMPILE_SDK || '36', 10),
    minSdk,
    36,
  );
  const targetSdk = clampSdk(
    parseInt(process.env.APP_BUILDER_TARGET_SDK || process.env.TARGET_SDK || '36', 10),
    minSdk,
    compileSdk,
  );
  return { minSdk, compileSdk, targetSdk };
}

/** Gradle assembleRelease：V1+V2+V3（侧载 / 国产 ROM 兼容） */
export function resolveGradleSigningFlags() {
  const v1 = envBool(process.env.APP_BUILDER_GRADLE_V1_SIGNING, true);
  return {
    v1,
    v2: envBool(process.env.APP_BUILDER_GRADLE_V2_SIGNING, true),
    v3: envBool(process.env.APP_BUILDER_GRADLE_V3_SIGNING, true),
  };
}

function envBool(raw, def) {
  if (raw == null || raw === '') return def;
  return !['0', 'false', 'no', 'off'].includes(String(raw).toLowerCase());
}

function clampSdk(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

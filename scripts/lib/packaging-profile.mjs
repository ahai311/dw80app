/** 将打包方案对象转为 GitHub workflow_dispatch inputs（字符串） */
export function packagingProfileToWorkflowInputs(profile = {}) {
  const p = profile || {};
  const bool = (v, def = true) => (v === false || v === 'false' || v === '0' ? 'false' : def ? 'true' : 'false');
  return {
    min_sdk: String(p.minSdk ?? p.min_sdk ?? 24),
    target_sdk: String(p.targetSdk ?? p.target_sdk ?? 36),
    compile_sdk: String(p.compileSdk ?? p.compile_sdk ?? 36),
    fix_apk: bool(p.fixApk ?? p.fix_apk, true),
    sign_v1: bool(p.signV1 ?? p.sign_v1, true),
    sign_v2: bool(p.signV2 ?? p.sign_v2, true),
    sign_v3: bool(p.signV3 ?? p.sign_v3, true),
    verify_apk: bool(p.verifyApk ?? p.verify_apk, true),
    check_production: bool(p.checkProduction ?? p.check_production, true),
  };
}

export function describePackaging(profile) {
  const w = packagingProfileToWorkflowInputs(profile);
  return `minSdk=${w.min_sdk} targetSdk=${w.target_sdk} fix=${w.fix_apk} sign=V1${w.sign_v1}/V2${w.sign_v2}/V3${w.sign_v3}`;
}

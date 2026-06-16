/** Capacitor 模板常用 $androidx* 变量；精简 variables.gradle 后须改为固定版本 */
export function normalizeAppGradleDeps(gradle) {
  const pins = {
    androidxAppCompatVersion: '1.6.1',
    androidxCoordinatorLayoutVersion: '1.2.0',
    androidxCoreVersion: '1.15.0',
    androidxCoreKtxVersion: '1.15.0',
    coreSplashScreenVersion: '1.0.1',
    androidxWebkitVersion: '1.12.1',
  };
  let g = gradle;
  for (const [name, ver] of Object.entries(pins)) {
    g = g.replace(new RegExp(`\\$\\{${name}\\}`, 'g'), ver);
    g = g.replace(new RegExp(`\\$${name}`, 'g'), ver);
  }
  if (/\$[a-zA-Z]/.test(g)) {
    g = g.replace(
      /dependencies\s*\{[\s\S]*?\n\}/m,
      `dependencies {
    implementation 'androidx.browser:browser:1.8.0'
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation 'androidx.core:core-splashscreen:1.0.1'
}
`,
    );
  }
  return g;
}

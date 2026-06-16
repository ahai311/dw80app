# ustation-app-shell v2

**Capacitor 7 仅用于生成/同步 Android 工程**，运行时 **不使用** Cordova、Capacitor Bridge、X5、Gecko、`androidx.webkit`。

## 架构

| 项 | 实现 |
|----|------|
| 页面渲染 | 自定义 `MainActivity` + `android.webkit.WebView` |
| 外链降级 | `androidx.browser` Custom Tabs |
| 启动页 | `androidx.core:core-splashscreen` + `resources/splash.png` |
| 权限 | 仅 `INTERNET` |
| 目标站 | `ustation_target.xml`（CI 写入 `TARGET_URL`） |

## 本地初始化

```powershell
cd d:\wwwroot\new\ustation\ustation-app-shell
npm install
node scripts/ensure-www.mjs
node scripts/ensure-bundled-assets.mjs

# 放入 Logo 资源（或由 CI download-assets 从平台拉取）
# resources/icon.png       — 桌面图标
# resources/splash.png     — 启动图（含 Logo）
# resources/square-icon.png — 下载横幅/方形图标

rm -rf android
npx cap add android
node scripts/apply-build-config.mjs
node scripts/patch-strip-cordova.mjs
node scripts/patch-android-network.mjs
node scripts/patch-android-webview.mjs
node scripts/patch-android-gradle-deps.mjs
node scripts/apply-android-assets.mjs
node scripts/finalize-android-production.mjs
```

## 推送到 GitHub / 触发 CI

```powershell
cd d:\wwwroot\new\ustation
node ustation-app-shell/scripts/sync-to-platform.mjs
npm run appbuilder:auto:push-only
node scripts/appbuilder-auto-pipeline.mjs
```

## SDK / 签名

- minSdk **21**（Android 5+），targetSdk / compileSdk **35**
- ABI：`arm64-v8a`, `armeabi-v7a`, `x86_64`
- CI：`fix-apk-installable.py` → `zipalign` → `apksigner` **V1+V2+V3**

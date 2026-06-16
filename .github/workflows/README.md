# GitHub Actions 构建模板

## Android 构建配置

### 1. 生成 Keystore Base64
```bash
base64 -i your-keystore.jks | tr -d '\n'
```

### 2. 添加 Secrets（Settings → Secrets and variables → Actions）
| Secret 名称 | 说明 |
|-------------|------|
| KEYSTORE_BASE64 | Keystore 文件的 Base64 编码 |
| KEYSTORE_PASSWORD | Keystore 密码 |
| KEY_ALIAS | Key 别名 |
| KEY_PASSWORD | Key 密码 |

### 3. 使用方法
- 进入 Actions → Build Android APK → Run workflow
- 选择 debug 或 release 构建类型

---

## iOS 构建配置

### 1. 准备文件
- `.p12` 证书文件
- `.mobileprovision` 描述文件
- App Store Connect API Key

### 2. 添加 Secrets
| Secret 名称 | 说明 |
|-------------|------|
| IOS_CERTIFICATE_P12 | P12 证书的 Base64 |
| IOS_CERTIFICATE_PASSWORD | P12 密码 |
| IOS_PROVISIONING_PROFILE_URL | 描述文件下载 URL |
| APP_STORE_CONNECT_ISSUER_ID | App Store Connect Issuer ID |
| APP_STORE_CONNECT_API_KEY_ID | API Key ID |
| APP_STORE_CONNECT_API_PRIVATE_KEY | API Private Key |

### 3. 修改配置
- 将 `YourScheme` 改为您的 Xcode Scheme 名称
- 确保有 `ExportOptions.plist` 文件

### 4. 使用方法
- 进入 Actions → Build iOS IPA → Run workflow
- 选择 debug 或 release 构建类型

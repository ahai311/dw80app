/**
 * 校验 release APK 是否可在 Android 11+ / 16 真机安装。
 * targetSdk 30+ 要求 resources.arsc、AndroidManifest.xml 在 APK 内为 Store（未压缩）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REQUIRED_STORED = ['resources.arsc', 'AndroidManifest.xml'];
const ZIP_STORED = 0;

function parseArgs(argv) {
  const args = argv.slice(2);
  const apk = args.find((a) => !a.startsWith('-'));
  return { apk };
}

function findBuildTools() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) return null;
  const btRoot = path.join(sdk, 'build-tools');
  if (!fs.existsSync(btRoot)) return null;
  const versions = fs
    .readdirSync(btRoot)
    .filter((v) => /^\d+\./.test(v))
    .sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pb[i] || 0) - (pa[i] || 0);
        if (d) return d;
      }
      return 0;
    });
  const ver = versions[0];
  return ver ? path.join(btRoot, ver) : null;
}

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8' });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/** 从 ZIP 中央目录读取条目压缩方式 */
function readCentralDirectory(apkPath) {
  const buf = fs.readFileSync(apkPath);
  const eocdIdx = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdIdx < 0) throw new Error('无效 APK：找不到 EOCD');
  const cdOffset = buf.readUInt32LE(eocdIdx + 16);
  const total = buf.readUInt16LE(eocdIdx + 10);
  const entries = new Map();
  let pos = cdOffset;
  for (let i = 0; i < total && pos + 46 < buf.length; i++) {
    const sig = buf.readUInt32LE(pos);
    if (sig !== 0x02014b50) break;
    const method = buf.readUInt16LE(pos + 10);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
    entries.set(name, { method });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function audit(apkPath) {
  const problems = [];
  const entries = readCentralDirectory(apkPath);
  for (const name of REQUIRED_STORED) {
    const e = entries.get(name);
    if (!e) {
      problems.push(`缺少 ${name}`);
      continue;
    }
    if (e.method !== ZIP_STORED) {
      problems.push(
        `${name} 被压缩 (method=${e.method})，Android 11+ 真机安装会失败或「软件包安装程序」崩溃`,
      );
    }
  }
  if (!entries.has('META-INF/CERT.RSA') && !entries.has('META-INF/CERT.SF')) {
    const hasV2 = fs.readFileSync(apkPath).includes(Buffer.from('APK Sig Block 42'));
    if (!hasV2) problems.push('缺少有效 APK 签名 (v2/v3)');
  }
  return problems;
}

function main() {
  const { apk } = parseArgs(process.argv);
  if (!apk || !fs.existsSync(apk)) {
    console.error('用法: node verify-apk-installable.mjs <apk>');
    process.exit(1);
  }

  const problems = audit(apk);
  if (problems.length) {
    console.error('::error::APK 安装兼容性检查失败');
    for (const p of problems) console.error(' -', p);
  } else {
    console.log('OK: resources.arsc + AndroidManifest 未压缩');
  }

  const bt = findBuildTools();
  if (bt) {
    const zipalign = path.join(bt, process.platform === 'win32' ? 'zipalign.exe' : 'zipalign');
    if (fs.existsSync(zipalign)) {
      const z = run(zipalign, ['-c', '-v', '4', apk]);
      if (!z.ok) {
        console.error('::error::zipalign -c -v 4 未通过');
        problems.push('zipalign');
      } else {
        console.log('OK: zipalign -c -v 4');
      }
    }
    const apksigner = path.join(bt, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
    if (fs.existsSync(apksigner)) {
      const v = run(apksigner, ['verify', '--min-sdk-version', '24', '--verbose', apk]);
      if (!v.ok) {
        console.error('::error::apksigner verify 未通过');
        problems.push('apksigner');
      } else {
        console.log('OK: apksigner verify');
      }
    }
  }

  process.exit(problems.length ? 1 : 0);
}

main();

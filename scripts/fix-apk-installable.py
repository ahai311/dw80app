#!/usr/bin/env python3
"""将 AndroidManifest.xml / resources.arsc 改为 ZIP Store，便于 Android 11+ 真机安装。"""
import sys
import zipfile

STORED = frozenset({'AndroidManifest.xml', 'resources.arsc'})


def fix_apk(src: str, dst: str) -> None:
    with zipfile.ZipFile(src, 'r') as zin, zipfile.ZipFile(dst, 'w') as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            out = zipfile.ZipInfo(filename=info.filename, date_time=info.date_time)
            if info.filename in STORED:
                out.compress_type = zipfile.ZIP_STORED
            else:
                out.compress_type = info.compress_type
            out.external_attr = info.external_attr
            zout.writestr(out, data)


def main() -> int:
    if len(sys.argv) < 3:
        print('usage: fix-apk-installable.py <in.apk> <out.apk>', file=sys.stderr)
        return 1
    fix_apk(sys.argv[1], sys.argv[2])
    print('fixed:', sys.argv[2])
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

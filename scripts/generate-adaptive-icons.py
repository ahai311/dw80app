#!/usr/bin/env python3
"""生成各密度 launcher / adaptive 图层（背景+前景安全区，避免 adaptive-icon 循环引用）"""
import json
import os
import sys

from PIL import Image

try:
    RESAMPLE = Image.Resampling.LANCZOS
except AttributeError:
    RESAMPLE = Image.LANCZOS

# launcher_px, adaptive_px (108dp 基准)
DENSITIES = {
    'mipmap-mdpi': (48, 108),
    'mipmap-hdpi': (72, 162),
    'mipmap-xhdpi': (96, 216),
    'mipmap-xxhdpi': (144, 324),
    'mipmap-xxxhdpi': (192, 432),
}

SAFE_SCALE = 0.72  # 前景缩至 72%，落在 adaptive 安全区内


def square_rgba(im: Image.Image) -> Image.Image:
    im = im.convert('RGBA')
    w, h = im.size
    if w == h:
        canvas = im
    else:
        s = max(w, h)
        canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        canvas.paste(im, ((s - w) // 2, (s - h) // 2), im)
    a = canvas.split()[3]
    bbox = a.getbbox()
    if bbox:
        canvas = canvas.crop(bbox)
        w, h = canvas.size
        s = max(w, h)
        out = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        out.paste(canvas, ((s - w) // 2, (s - h) // 2), canvas)
        return out
    return canvas


def dominant_color(im: Image.Image) -> str:
    small = im.convert('RGB').resize((64, 64), RESAMPLE)
    px = list(small.getdata())
    px.sort(key=lambda c: c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114)
    r, g, b = px[len(px) // 3]
    return f'#{r:02X}{g:02X}{b:02X}'


def make_foreground(src: Image.Image, size: int) -> Image.Image:
    fg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    inner = max(1, int(size * SAFE_SCALE))
    scaled = src.resize((inner, inner), RESAMPLE)
    fg.paste(scaled, ((size - inner) // 2, (size - inner) // 2), scaled)
    return fg


def main() -> int:
    if len(sys.argv) < 3:
        print('usage: generate-adaptive-icons.py <icon.png> <resRoot>', file=sys.stderr)
        return 1
    icon_path, res_root = sys.argv[1], sys.argv[2]
    src = square_rgba(Image.open(icon_path))
    color = dominant_color(src)

    for folder, (launcher_px, adaptive_px) in DENSITIES.items():
        base = os.path.join(res_root, folder)
        os.makedirs(base, exist_ok=True)
        launcher = src.resize((launcher_px, launcher_px), RESAMPLE)
        bg = src.resize((adaptive_px, adaptive_px), RESAMPLE)
        fg = make_foreground(src, adaptive_px)
        launcher.save(os.path.join(base, 'ic_launcher.png'), 'PNG')
        launcher.save(os.path.join(base, 'ic_launcher_round.png'), 'PNG')
        bg.save(os.path.join(base, 'ic_launcher_background.png'), 'PNG')
        fg.save(os.path.join(base, 'ic_launcher_foreground.png'), 'PNG')

    print(json.dumps({'dominantColor': color, 'safeScale': SAFE_SCALE}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

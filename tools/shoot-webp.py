#!/usr/bin/env python3
"""tools/shoot.js 가 찍어 둔 PNG 를 WebP 로 바꾼다 — 설명서 파일이 무거워지지 않도록."""
import glob
import os

from PIL import Image

QUALITY = 82

n = before = after = 0
for png in sorted(glob.glob('assets/shots/*.webp.png')):
    out = png[:-4]                       # …webp.png → …webp
    im = Image.open(png).convert('RGB')
    im.save(out, 'WEBP', quality=QUALITY, method=6)
    before += os.path.getsize(png)
    after += os.path.getsize(out)
    os.remove(png)
    n += 1
    print(f'  {os.path.basename(out)}  {im.width}×{im.height}  {os.path.getsize(out) // 1024}KB')

if n:
    print(f'\n{n}장  {before // 1024}KB → {after // 1024}KB')
else:
    print('바꿀 PNG 가 없습니다.')

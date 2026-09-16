#!/usr/bin/env python3
"""레시피북(단일 HTML)의 사진·태그·조리시간·프렙 만드는 법을 dataset 에 합친다.

레시피북과 원가분석은 같은 원본에서 나와 메뉴·프렙 이름과 사용량이 그대로 일치한다.
원가 쪽에 없는 것은 사진과 태그뿐이라, 그것만 가져와 하나로 만든다.

사용법:
    python3 tools/merge-recipebook.py <레시피북.html> [dataset.json]
"""
import base64
import io
import json
import os
import re
import sys

from PIL import Image

MAX_SIDE = 520          # 카드·상세 어디에 써도 충분한 크기
WEBP_QUALITY = 84
WHITE = 246             # 이 값 이상이면 배경(흰 여백)으로 본다


def load_recipebook(path):
    """번들 안에 박혀 있는 레시피 JSON 을 꺼낸다."""
    html = open(path, encoding='utf-8', errors='replace').read()
    i = html.find('JSON.parse(`')
    while i != -1:
        start = html.index('`', i) + 1
        end = html.index('`)', start)
        blob = html[start:end]
        # 첫 레코드에 사진(base64)이 들어 있어 앞부분만 봐서는 판별이 안 된다
        if blob.lstrip().startswith('[{"id"') and '"ingredients"' in blob:
            return json.loads(blob)
        i = html.find('JSON.parse(`', end)
    raise SystemExit('레시피 데이터를 찾지 못했습니다')


def trim_white(im):
    """제품컷 주위의 흰 여백을 잘라낸다 — 카드에서 음식이 더 크게 보인다."""
    g = im.convert('L')
    mask = g.point(lambda v: 0 if v >= WHITE else 255)
    box = mask.getbbox()
    if not box:
        return im
    pad = 4
    l, t, r, b = box
    return im.crop((max(0, l - pad), max(0, t - pad),
                    min(im.width, r + pad), min(im.height, b + pad)))


def shrink(data_uri):
    """PNG data URI → 여백을 자른 WebP data URI"""
    raw = base64.b64decode(data_uri.split(',', 1)[1])
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    im = trim_white(im)
    if max(im.size) > MAX_SIDE:
        k = MAX_SIDE / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=WEBP_QUALITY, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode(), len(raw), len(buf.getvalue())


def main():
    rb_path = sys.argv[1] if len(sys.argv) > 1 else None
    ds_path = sys.argv[2] if len(sys.argv) > 2 else 'data/dataset.json'
    if not rb_path or not os.path.exists(rb_path):
        raise SystemExit('레시피북 HTML 경로를 넣어 주세요')

    rb = load_recipebook(rb_path)
    ds = json.load(open(ds_path, encoding='utf-8'))

    by_name = {r['name']: r for r in rb}
    before = after = 0
    photos = tagged = timed = stepped = 0
    missing = []

    def enrich(target, rec, is_prep=False):
        nonlocal before, after, photos, tagged, timed, stepped
        if rec.get('image'):
            uri, b, a = shrink(rec['image'])
            target['image'] = uri
            before += b
            after += a
            photos += 1
        else:
            target.setdefault('image', '')
        if rec.get('tags'):
            target['tags'] = [t for t in rec['tags'] if t != '프렙']
            tagged += 1
        if rec.get('cookTimeMin'):
            target['cookTimeMin'] = rec['cookTimeMin']
            target['cookTimeMax'] = rec.get('cookTimeMax') or rec['cookTimeMin']
            timed += 1
        if rec.get('nameEn'):
            target.setdefault('nameEn', rec['nameEn'])
        if rec.get('cookTime'):
            # 「총 조리시간: 약 5~8분」 → 「약 5~8분」 (배지에 짧게 들어가도록)
            target['time'] = re.sub(r'^\s*(총\s*)?조리\s*시간\s*[:·]?\s*', '', rec['cookTime']).strip()
        if is_prep and rec.get('steps'):
            target['steps'] = rec['steps']
            stepped += 1

    for m in ds['menus']:
        rec = by_name.get(m['name'])
        if rec:
            enrich(m, rec)
        else:
            missing.append('메뉴 ' + m['name'])

    for p in ds['preps']:
        rec = by_name.get(p['name'])
        if rec:
            enrich(p, rec, is_prep=True)
        else:
            missing.append('프렙 ' + p['name'])

    json.dump(ds, open(ds_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    print(f'사진      {photos}장   {before // 1024}KB → {after // 1024}KB '
          f'({100 - after * 100 // max(1, before)}% 감소)')
    print(f'태그      {tagged}건')
    print(f'조리시간  {timed}건')
    print(f'프렙 조리법 {stepped}건')
    if missing:
        print('짝을 못 찾음:', ', '.join(missing))
    print(f'저장 완료: {ds_path}  {os.path.getsize(ds_path) // 1024}KB')


if __name__ == '__main__':
    main()

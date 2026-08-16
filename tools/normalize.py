# -*- coding: utf-8 -*-
"""_raw.json (원본 2개 엑셀에서 추출) -> data/dataset.json (정규화된 단일 데이터셋)"""
import json, re, os, collections

RAW = json.load(open('data/_raw.json'))

# ─────────────────────────────────────────── 1. 카테고리 정리
CAT = {
 '닭고기 카레':'치킨 커리','닭고기 요리':'치킨 커리',
 '양고기 카레':'머턴 커리',
 '계란 카레':'에그·해산물','새우 카레':'에그·해산물','해산물 카레':'에그·해산물',
 '베지 카레':'채식·달 커리','채식 카레':'채식·달 커리','콩 카레':'채식·달 커리',
 '스낵':'스낵·사이드','사이드 메뉴':'스낵·사이드',
 '볶음면':'면류','채식 볶음면':'면류','국수 수프':'면류',
 '빵류':'브레드',
 '탄두리 요리':'탄두리·케밥',
 '수프':'수프',
 '샐러드':'샐러드',
 '디저트':'디저트','디저트/사이드':'디저트','사이드/디저트':'디저트',
 '세트 메뉴':'세트메뉴',
 '음료':'음료',
 '밥류':'밥류',
}
CAT_ORDER = ['치킨 커리','머턴 커리','에그·해산물','채식·달 커리','탄두리·케밥',
             '스낵·사이드','면류','수프','브레드','밥류','샐러드','디저트','음료','세트메뉴']
CAT_ICON = {'치킨 커리':'🍗','머턴 커리':'🐑','에그·해산물':'🦐','채식·달 커리':'🥦',
            '탄두리·케밥':'🔥','스낵·사이드':'🥟','면류':'🍜','수프':'🍲','브레드':'🫓',
            '밥류':'🍚','샐러드':'🥗','디저트':'🍮','음료':'🥤','세트메뉴':'🍽'}

# ─────────────────────────────────────────── 2. 식재료 DB 정리 (중복 병합)
raw_ings = RAW['ingredients']
merged, seen = [], {}
for it in raw_ings:
    n = it['name'].strip()
    if n in seen:            # 중복명 → 나중 행(최신 단가)으로 덮어씀
        merged[seen[n]] = dict(it); merged[seen[n]]['name'] = n
    else:
        seen[n] = len(merged); merged.append(dict(it, name=n))
INGREDIENTS = merged

# 레시피에만 등장하고 DB에 없는 품목 (단가 미확인 → 0으로 등록, 앱/엑셀에서 경고)
EXTRA_INGREDIENTS = [
    {'name':'사프란','price':0,'pack_qty':0,'unit':'g','weight_g':0,'todo':True},
]

# ─────────────────────────────────────────── 3. 이름 별칭 매핑
# (레시피/프렙에 적힌 표기) -> ('식재료'|'프렙'|'메뉴'|'무료', 표준명)
ALIAS = {
 # 영문/괄호 표기
 'ASEEL PURE GHEE (버터)':('식재료','ASEEL PURE GHEE'),
 '기':('식재료','ASEEL PURE GHEE'),
 'BESAN (병아리콩 가루)':('식재료','BESAN(SUNNY)'),
 'CHAAT MASALA':('식재료','CHAAT MASALA (MEHRAN)'),
 'CORRIANDER WHOLE':('식재료','CORRIANDER WHOLE(MEHRAN)'),
 'CUMIN SEED WHOLE (커민씨드)':('식재료','CUMIN SEED WHOLE'),
 '커민씨드':('식재료','CUMIN SEED WHOLE'),
 'CUMIN seed powder':('식재료','CUMIN powder'),
 'Clove powder (정향가루)':('식재료','Clove powder'),
 'MURI (쌀튀밥)':('식재료','MURI'),
 '통밀가루 (아타)':('식재료','FERDAUS CHAKKI FRESH ATTA'),
 '바스마티 쌀':('식재료','MEHRAN BASMATI RICE'),
 '강황가루':('식재료','TURMERIC POWDER'),
 '커다몸':('식재료','카다멈'),
 # 고수 계열
 '고수(고수잎)':('식재료','고수'),'고수잎':('식재료','고수'),
 '고수잎·':('식재료','고수'),'고수잎·박하잎':('식재료','고수'),
 # 육류
 '닭 (09호)':('식재료','닭 09호'),
 '닭 (닭다리)':('식재료','북채'),
 '닭 (부위 정육)':('식재료','정육(부위 닭)'),
 '정육 (닭)':('식재료','정육(부위 닭)'),
 '닭 가슴살':('식재료','가슴 대한'),
 '닭가슴살 (정육)':('식재료','가슴 대한'),
 # 채소·기타
 '냉동 딸기':('식재료','냉동딸기'),
 '냉동 믹스 야채':('식재료','FROZEN MIXED VEGETABLE'),
 '냉동 콜리플라워':('식재료','FROZEN CAULI FLOWER'),
 '방울토마토':('식재료','토마토'),
 '토마토퓨레':('식재료','토마토홀'),
 '파프리카':('식재료','청피망'),
 '양상추·로메인':('식재료','양상추'),
 '병아리콩 (삶은 것)':('식재료','병아리콩'),
 '주름감자 (프렌치프라이용)':('식재료','주름감자(프렌치프라이)'),
 '스파게티 면 (삶은 것)':('식재료','스파게티면'),
 '스프링롤 페이스트리':('식재료','스프링롤 페스트리'),
 '탈각새우 31/40':('식재료','탈각새우31/40'),
 '해물 모듬 (새우, 오징어, 홍합 등)':('식재료','해물모듬'),
 '망고 슬라이스':('식재료','망고슬라이스'),
 '케찹 스파우트':('식재료','케찹스파우트'),
 '크루통 (파펃 조각)':('식재료','BIKAJI PAPAD DIL_KUSH'),
 '크림스프 파우더':('식재료','크림스프'),
 '캐슈넛 페이스트':('식재료','캐슈넛'),
 '베트남 건고추':('식재료','베트남(건고추)'),
 '베트남 고추가루':('식재료','베트남(고추가루)'),
 '고추가루':('식재료','고운 고추가루'),
 '식용류':('식재료','식용유'),
 '멀균우유':('식재료','멸균우유'),
 '버터':('식재료','부라보'),
 # 마살라 파우더
 '치킨 마살라 파우더':('식재료','치킨마살라 파우더'),
 '머턴 마살라 파우더':('식재료','머튼마살라 파우더'),
 '머튼 마살라 파우더':('식재료','머튼마살라 파우더'),
 '치킨/머턴 마살라 파우더':('식재료','머튼마살라 파우더'),
 '티카 마살라 파우더':('식재료','티카머설라 가루'),
 # 프렙(반제품)
 '치즈 (퍼니르)':('프렙','치즈'),'퍼니르 (치즈)':('프렙','치즈'),'퍼니르(치즈)':('프렙','치즈'),
 '더히':('프렙','요거트'),'더히 (요거트)':('프렙','요거트'),'요거트(더히)':('프렙','요거트'),
 '요거트 소스':('프렙','요거트'),'요거트':('프렙','요거트'),
 '베이비커리 소스':('프렙','베이비커리'),
 '탄두리 샐라드':('프렙','탄두리 샐러드'),
 # 세트메뉴 구성품 (다른 메뉴를 그대로 사용)
 '메인 커리 (치킨/머턴/베지)':('메뉴','치킨 커리'),
 '치킨 커리 또는 베지 커리':('메뉴','치킨 커리'),
 '머턴 커리 또는 달 머커니':('메뉴','머턴 커리'),
 '스타터 (사모사 또는 모모)':('메뉴','사모사'),
 '탄두리 요리 (티카 또는 케밥)':('메뉴','치킨 티카'),
 '디저트 (굴랍자문 또는 라스굴라)':('메뉴','굴랍자문'),
 '플레인 난':('메뉴','플레인 난'),
 '플레인 난 또는 버터 난':('메뉴','플레인 난'),
 '밥':('메뉴','바스마티 라이스'),
 '밥 (바스마티 라이스)':('메뉴','바스마티 라이스'),
 '샐러드':('메뉴','그린 샐러드'),
 '그린 샐러드':('메뉴','그린 샐러드'),
 # 원가 0 (수돗물 등)
 '물':('무료','물'),
 '물 또는 우유':('무료','물'),
 '물 또는 닭 육수':('무료','물'),
 '물 또는 채소 육수':('무료','물'),
 '닭 육수 또는 물':('무료','물'),
}

ING_NAMES  = {i['name'] for i in INGREDIENTS} | {e['name'] for e in EXTRA_INGREDIENTS}
PREP_NAMES = {p['name'] for p in RAW['preps']}
MENU_NAMES = {r['name'] for r in RAW['recipes']}

def resolve(name):
    n = (name or '').strip()
    if n in ALIAS: return ALIAS[n]
    if n in PREP_NAMES: return ('프렙', n)
    if n in ING_NAMES:  return ('식재료', n)
    if n in MENU_NAMES: return ('메뉴', n)
    return ('미매칭', n)

# ─────────────────────────────────────────── 4. 수량 파싱
def parse_qty(q):
    """'100g'->(100,'g'), '250ml'->(250,'g' 1ml=1g), '2개'->(2,'개'), '적당량'->(0,'적당량')"""
    s = (q or '').strip()
    m = re.match(r'^\s*([\d.]+)\s*(g|ml|개|인분)?', s)
    if not m:
        # '적당량' 같은 정성 표기 → 기본 추정치 20g (엑셀/앱에서 수정 가능, 확인목록에 표시)
        return (20.0, '적당량(20g 추정)') if s else (0.0, '-')
    v = float(m.group(1)); u = m.group(2) or 'g'
    if u == 'ml': u = 'g'                 # 물·우유류 1ml≈1g
    if u == '인분': u = '개'
    return v, u

# ─────────────────────────────────────────── 5. 판매가 매핑
def keyify(s): return re.sub(r'[\s()（）·]', '', s or '').lower()
PRICE_BY_KEY = {}
for k, v in RAW['prices'].items():
    PRICE_BY_KEY.setdefault(keyify(k), v)
PRICE_EXTRA_ALIAS = {   # 표기가 달라 자동매칭이 안 되는 건
    '치킨 시크 케밥':'치킨시크케밥',
    '네팔 찌야':'네팔찌야',
    '탄두리치킨(반마리)':'탄두리 치킨(반마리)',
    '탄두리치킨(한마리)':'탄두리 치킨(한마리)',
}
def price_of(menu):
    if menu in PRICE_EXTRA_ALIAS:
        return PRICE_BY_KEY.get(keyify(PRICE_EXTRA_ALIAS[menu]), 0)
    return PRICE_BY_KEY.get(keyify(menu), 0)

# ─────────────────────────────────────────── 6. 프렙 정리
PREPS = []
for p in RAW['preps']:
    items = []
    for it in p['items']:
        kind, std = resolve(it['name'])
        items.append({'kind': kind, 'name': std, 'raw': it['name'], 'qty': float(it['qty'])})
    PREPS.append({'name': p['name'], 'yield_g': float(p['yield_g']),
                  'yield_rate': float(p['yield_rate'] or 1), 'items': items})

# ─────────────────────────────────────────── 7. 메뉴 정리
MENUS = []
for r in RAW['recipes']:
    cat_raw = re.sub(r'^📂\s*', '', r['category_raw'])
    en = re.search(r'\(([^)]*)\)\s*$', cat_raw)
    cat_ko = re.sub(r'\s*\([^)]*\)\s*$', '', cat_raw).strip()
    cat = CAT.get(cat_ko, '기타')
    lines = []
    for it in r['ingredients']:
        kind, std = resolve(it['name'])
        qty, unit = parse_qty(it['qty'])
        lines.append({'kind': kind, 'name': std, 'raw': it['name'],
                      'qty': qty, 'unit': unit, 'yield': 1.0, 'note': it['note']})
    MENUS.append({
        'name': r['name'], 'category': cat, 'icon': CAT_ICON.get(cat, '🍽'),
        'en': en.group(1) if en else '', 'time': re.sub(r'^⏱\s*', '', r['time']),
        'serving': r['serving'] or '1인분 기준',
        'price': price_of(r['name']),
        'lines': lines, 'steps': r['steps'], 'garnish': r['garnish'],
    })
MENUS.sort(key=lambda m: (CAT_ORDER.index(m['category']) if m['category'] in CAT_ORDER else 99, m['name']))

# ─────────────────────────────────────────── 8. 검증
issues = []
for m in MENUS:
    if not m['price']: issues.append({'type':'판매가 없음','menu':m['name']})
    for l in m['lines']:
        if l['kind'] == '미매칭': issues.append({'type':'식재료 미매칭','menu':m['name'],'name':l['raw']})
        if '추정' in l['unit']:
            issues.append({'type':'사용량 추정','menu':m['name'],'name':l['raw'],
                           'note':'원본에 "적당량"으로 기재 → 20g 으로 가정. 실제값으로 수정하세요.'})
        elif l['kind'] in ('식재료','프렙') and l['qty'] <= 0:
            issues.append({'type':'사용량 미기재','menu':m['name'],'name':l['raw'],'note':''})
for p in PREPS:
    for l in p['items']:
        if l['kind'] == '미매칭': issues.append({'type':'프렙 식재료 미매칭','menu':p['name'],'name':l['raw']})

for ing in INGREDIENTS + EXTRA_INGREDIENTS:
    if not ing.get('price'):
        issues.append({'type':'식재료 단가 미입력','menu':'-','name':ing['name'],
                       'note':'구매가격이 0원입니다. 실제 단가를 입력하세요.'})
    elif not ing.get('weight_g'):
        issues.append({'type':'식재료 규격 미입력','menu':'-','name':ing['name'],
                       'note':'중량(g)이 0이라 g당 단가를 계산할 수 없습니다.'})

# 고정비: '외상 매입금-식재료비'는 식재료 원가와 이중계상되므로 배분 대상에서 제외(기본값)
FIXED = []
for f in RAW['fixed_costs']:
    excl = ('식재료' in f['name'])
    FIXED.append({**f, 'include': not excl,
                  'reason': '식재료 원가로 이미 반영 → 고정비 배분에서 제외 (필요 시 포함으로 변경)' if excl else ''})
    if excl:
        issues.append({'type':'고정비 이중계상 조정','menu':'-','name':f['name'],
                       'note':'월 %s원. 메뉴 식재료 원가에 이미 포함되어 있어 고정비 배분 대상에서 제외했습니다.' % format(int(f['amount']),',')})

DATA = {
 'meta': {'brand':'EVEREST RESTAURANT GROUP','title':'메뉴 원가 분석서',
          'source':'레시피북 v3 (87종) + 식재료/고정비 DB','version':'2.0'},
 'categoryOrder': CAT_ORDER, 'categoryIcon': CAT_ICON,
 'ingredients': INGREDIENTS + EXTRA_INGREDIENTS,
 'preps': PREPS,
 'menus': MENUS,
 'fixedCosts': FIXED,
 'settings': {'monthlyRevenue': RAW['monthly_revenue'],
              'targetFoodCostRate': 0.30, 'warnFoodCostRate': 0.38,
              'targetTotalCostRate': 0.80,
              'vatIncluded': True, 'vatRate': 0.1},
 'issues': issues,
}
os.makedirs('data', exist_ok=True)
json.dump(DATA, open('data/dataset.json','w'), ensure_ascii=False, indent=1)

print('메뉴', len(MENUS), '| 식재료', len(DATA['ingredients']), '| 프렙', len(PREPS))
c = collections.Counter(i['type'] for i in issues)
for k, v in c.items(): print('  ⚠', k, v)
for i in issues:
    if i['type'] in ('식재료 미매칭','프렙 식재료 미매칭'): print('   →', i)
print('판매가 없음:', [i['menu'] for i in issues if i['type']=='판매가 없음'])

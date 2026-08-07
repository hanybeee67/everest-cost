/* =====================================================================
 *  에베레스트 원가 분석 · 서버
 *  - 정적 웹앱 제공 (PC / 모바일 공용)
 *  - 원본 데이터 + 사용자 수정값(overrides) 저장/조회
 *  - 현재 값 기준 엑셀 생성 다운로드
 * =====================================================================*/
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const express = require('express');

const { build } = require('../tools/build-xlsx.js');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATASET = path.join(ROOT, 'data', 'dataset.json');

/* 저장 위치: Render Disk 를 붙였다면 DATA_DIR=/var/data 로 지정 (영구 보존).
   지정하지 않으면 컨테이너 로컬에 저장되며 재배포 시 초기화된다. */
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'var');
const OV_FILE = path.join(DATA_DIR, 'overrides.json');
const PORT = process.env.PORT || 3000;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

/* ── 원본 데이터 (메모리 캐시) ─────────────────────── */
const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8'));

/* ── 수정값 파일 I/O ───────────────────────────────── */
const EMPTY_OV = { ingredients: {}, preps: {}, menus: {}, fixedCosts: {}, settings: {} };

async function readOverrides() {
  try {
    const raw = await fsp.readFile(OV_FILE, 'utf8');
    return { ...EMPTY_OV, ...JSON.parse(raw) };
  } catch (_) {
    return { ...EMPTY_OV };
  }
}
async function writeOverrides(ov) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const tmp = OV_FILE + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(ov, null, 1), 'utf8');
  await fsp.rename(tmp, OV_FILE);           // 원자적 교체 — 쓰다 만 파일이 남지 않음
}

/* 값이 숫자/불리언인지 확인해 이상한 입력이 저장되지 않게 한다 */
function sanitize(input) {
  const out = { ...EMPTY_OV };
  if (!input || typeof input !== 'object') return out;
  const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : undefined);

  const pick = (src, keys) => {
    const o = {};
    for (const k of keys) { const v = num(src[k]); if (v !== undefined) o[k] = v; }
    return o;
  };

  for (const [name, v] of Object.entries(input.ingredients || {})) {
    if (typeof name !== 'string' || !v) continue;
    const o = pick(v, ['price', 'pack_qty', 'weight_g']);
    if (Object.keys(o).length) out.ingredients[name] = o;
  }
  for (const [name, v] of Object.entries(input.preps || {})) {
    if (typeof name !== 'string' || !v) continue;
    const o = pick(v, ['yield_g', 'yield_rate']);
    const items = {};
    for (const [ix, iv] of Object.entries(v.items || {})) {
      const q = num((iv || {}).qty);
      if (/^\d+$/.test(ix) && q !== undefined) items[ix] = { qty: q };
    }
    if (Object.keys(items).length) o.items = items;
    if (Object.keys(o).length) out.preps[name] = o;
  }
  for (const [name, v] of Object.entries(input.menus || {})) {
    if (typeof name !== 'string' || !v) continue;
    const o = pick(v, ['price']);
    const lines = {};
    for (const [ix, lv] of Object.entries(v.lines || {})) {
      if (!/^\d+$/.test(ix) || !lv) continue;
      const l = pick(lv, ['qty', 'yield']);
      if (Object.keys(l).length) lines[ix] = l;
    }
    if (Object.keys(lines).length) o.lines = lines;
    if (Object.keys(o).length) out.menus[name] = o;
  }
  for (const [name, v] of Object.entries(input.fixedCosts || {})) {
    if (typeof name !== 'string' || !v) continue;
    const o = pick(v, ['amount']);
    if (typeof v.include === 'boolean') o.include = v.include;
    if (Object.keys(o).length) out.fixedCosts[name] = o;
  }
  const s = pick(input.settings || {}, ['monthlyRevenue', 'targetFoodCostRate', 'warnFoodCostRate']);
  if (Object.keys(s).length) out.settings = s;

  out.updatedAt = new Date().toISOString();
  return out;
}

/* ── 원본 + 수정값 병합 (엑셀 생성용, calc.js 와 동일 규칙) ── */
function mergeDataset(base, ov) {
  return {
    ...base,
    ingredients: base.ingredients.map((i) => ({ ...i, ...(ov.ingredients[i.name] || {}) })),
    preps: base.preps.map((p) => {
      const po = ov.preps[p.name] || {};
      return {
        ...p, ...(po.yield_g != null ? { yield_g: po.yield_g } : {}),
        items: p.items.map((it, ix) => ({ ...it, ...((po.items || {})[ix] || {}) })),
      };
    }),
    menus: base.menus.map((m) => {
      const mo = ov.menus[m.name] || {};
      return {
        ...m, ...(mo.price != null ? { price: mo.price } : {}),
        lines: m.lines.map((l, ix) => ({ ...l, ...((mo.lines || {})[ix] || {}) })),
      };
    }),
    fixedCosts: base.fixedCosts.map((f) => ({ ...f, ...(ov.fixedCosts[f.name] || {}) })),
    settings: { ...base.settings, ...ov.settings },
  };
}

/* ── API ───────────────────────────────────────────── */
app.get('/api/data', async (_req, res) => {
  res.json({ dataset, overrides: await readOverrides() });
});

app.put('/api/overrides', async (req, res) => {
  try {
    const clean = sanitize(req.body);
    await writeOverrides(clean);
    res.json({ ok: true, updatedAt: clean.updatedAt });
  } catch (err) {
    console.error('overrides 저장 실패:', err.message);
    res.status(500).json({ ok: false, error: '저장에 실패했습니다.' });
  }
});

async function sendXlsx(res, ov) {
  const wb = build(mergeDataset(dataset, ov));
  const name = encodeURIComponent(`에베레스트_원가분석서_${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="everest-cost.xlsx"; filename*=UTF-8''${name}`);
  await wb.xlsx.write(res);
  res.end();
}

app.post('/api/export.xlsx', async (req, res) => {
  try { await sendXlsx(res, sanitize(req.body)); }
  catch (err) { console.error('엑셀 생성 실패:', err); res.status(500).send('엑셀 생성에 실패했습니다.'); }
});

/* 링크로 바로 받기 — 서버에 저장된 최신 값 기준 */
app.get('/api/export.xlsx', async (_req, res) => {
  try { await sendXlsx(res, await readOverrides()); }
  catch (err) { console.error('엑셀 생성 실패:', err); res.status(500).send('엑셀 생성에 실패했습니다.'); }
});

app.get('/healthz', (_req, res) => res.json({ ok: true, menus: dataset.menus.length }));

/* ── 정적 파일 ─────────────────────────────────────── */
app.get('/calc.js', (_req, res) => res.sendFile(path.join(ROOT, 'shared', 'calc.js')));
app.get('/dataset.json', (_req, res) => res.sendFile(DATASET));
app.use(express.static(PUBLIC, { maxAge: '1h', index: 'index.html' }));
app.use((_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

app.listen(PORT, () => {
  console.log(`▶ 에베레스트 원가 분석 서버 실행 : http://localhost:${PORT}`);
  console.log(`  메뉴 ${dataset.menus.length}종 · 식재료 ${dataset.ingredients.length}종 · 저장 위치 ${DATA_DIR}`);
});

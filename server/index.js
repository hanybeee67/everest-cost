/* =====================================================================
 *  메뉴 원가 분석 · 서버
 *  - 정적 웹앱 제공 (PC / 모바일 공용)
 *  - 편집한 데이터 저장 / 조회
 *  - 현재 값 기준 엑셀 생성 다운로드
 * =====================================================================*/
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const express = require('express');

const { build } = require('../tools/build-xlsx.js');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATASET = process.env.DATASET || path.join(ROOT, 'data', 'dataset.json');

/* 저장 위치: Render Disk 를 붙였다면 DATA_DIR=/var/data 로 지정 (영구 보존).
   지정하지 않으면 컨테이너 로컬에 저장되며 재배포 시 초기화된다. */
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'var');
const SAVE_FILE = path.join(DATA_DIR, 'data.json');
const LEGACY_FILE = path.join(DATA_DIR, 'overrides.json');
const PORT = process.env.PORT || 3000;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16mb' }));

/* ── 원본 데이터 (메모리 캐시) ─────────────────────── */
const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8'));

/* ── 저장 파일 I/O ─────────────────────────────────── */
async function readSaved() {
  try {
    return JSON.parse(await fsp.readFile(SAVE_FILE, 'utf8'));
  } catch (_) {
    try {                                     // 예전 형식(수정값만 저장)도 읽어 준다
      const ov = JSON.parse(await fsp.readFile(LEGACY_FILE, 'utf8'));
      return { savedAt: ov.updatedAt || null, ov };
    } catch (__) { return null; }
  }
}
async function writeSaved(payload) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const tmp = SAVE_FILE + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(payload), 'utf8');
  await fsp.rename(tmp, SAVE_FILE);           // 원자적 교체 — 쓰다 만 파일이 남지 않음
}

/* 최소한의 모양을 갖췄는지 확인 — 형식이 깨진 데이터가 저장되는 것을 막는다 */
function validData(d) {
  return !!d && typeof d === 'object'
    && Array.isArray(d.ingredients) && Array.isArray(d.preps)
    && Array.isArray(d.menus) && Array.isArray(d.fixedCosts)
    && !!d.settings && typeof d.settings === 'object'
    && !!d.meta && typeof d.meta === 'object';
}

/* 예전 「수정값」 형식을 원본에 얹어 전체 데이터로 만든다 */
function applyOverrides(base, ov) {
  if (!ov) return base;
  const o = { ingredients: {}, preps: {}, menus: {}, fixedCosts: {}, settings: {}, ...ov };
  return {
    ...base,
    ingredients: base.ingredients.map((i) => ({ ...i, ...(o.ingredients[i.name] || {}) })),
    preps: base.preps.map((p) => {
      const po = o.preps[p.name] || {};
      return {
        ...p, ...(po.yield_g != null ? { yield_g: po.yield_g } : {}),
        items: p.items.map((it, ix) => ({ ...it, ...((po.items || {})[ix] || {}) })),
      };
    }),
    menus: base.menus.map((m) => {
      const mo = o.menus[m.name] || {};
      return {
        ...m, ...(mo.price != null ? { price: mo.price } : {}),
        lines: m.lines.map((l, ix) => ({ ...l, ...((mo.lines || {})[ix] || {}) })),
      };
    }),
    fixedCosts: base.fixedCosts.map((f) => ({ ...f, ...(o.fixedCosts[f.name] || {}) })),
    settings: { ...base.settings, ...o.settings },
  };
}

async function currentData() {
  const saved = await readSaved();
  if (saved && validData(saved.data)) return saved.data;
  if (saved && saved.ov) return applyOverrides(dataset, saved.ov);
  return dataset;                             // 저장된 것이 없으면 원본
}

/* ── API ───────────────────────────────────────────── */
app.get('/api/data', async (_req, res) => {
  res.json({ dataset, saved: await readSaved() });
});

app.put('/api/data', async (req, res) => {
  try {
    const d = (req.body || {}).data;
    if (!validData(d)) return res.status(400).json({ ok: false, error: '데이터 형식이 올바르지 않습니다.' });
    const payload = { savedAt: new Date().toISOString(), data: d };
    await writeSaved(payload);
    res.json({ ok: true, savedAt: payload.savedAt });
  } catch (err) {
    console.error('저장 실패:', err.message);
    res.status(500).json({ ok: false, error: '저장에 실패했습니다.' });
  }
});

async function sendXlsx(res, data) {
  const wb = build(data);
  const brand = (data.meta && data.meta.brand) || '메뉴';
  const name = encodeURIComponent(`${brand}_원가분석서_${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="cost-report.xlsx"; filename*=UTF-8''${name}`);
  await wb.xlsx.write(res);
  res.end();
}

app.post('/api/export.xlsx', async (req, res) => {
  try {
    const d = (req.body || {}).data;
    await sendXlsx(res, validData(d) ? d : await currentData());
  } catch (err) { console.error('엑셀 생성 실패:', err); res.status(500).send('엑셀 생성에 실패했습니다.'); }
});

/* 링크로 바로 받기 — 서버에 저장된 최신 값 기준 */
app.get('/api/export.xlsx', async (_req, res) => {
  try { await sendXlsx(res, await currentData()); }
  catch (err) { console.error('엑셀 생성 실패:', err); res.status(500).send('엑셀 생성에 실패했습니다.'); }
});

app.get('/healthz', (_req, res) => res.json({ ok: true, menus: dataset.menus.length }));

/* ── 정적 파일 ─────────────────────────────────────── */
app.get('/calc.js', (_req, res) => res.sendFile(path.join(ROOT, 'shared', 'calc.js')));
app.get('/dataset.json', (_req, res) => res.sendFile(DATASET));
app.use(express.static(PUBLIC, { maxAge: '1h', index: 'index.html' }));
app.use((_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

app.listen(PORT, () => {
  console.log(`▶ 메뉴 원가 분석 서버 실행 : http://localhost:${PORT}`);
  console.log(`  메뉴 ${dataset.menus.length}종 · 식재료 ${dataset.ingredients.length}종 · 저장 위치 ${DATA_DIR}`);
});

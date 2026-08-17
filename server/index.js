/* =====================================================================
 *  메뉴 원가 분석 · 서버
 *  - 정적 웹앱 제공 (PC / 모바일 공용)
 *  - 편집한 데이터 저장 / 조회
 *  - 현재 값 기준 엑셀 생성 다운로드
 * =====================================================================*/
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
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
app.set('trust proxy', 1);                    // Render 등 프록시 뒤에서 클라이언트 IP 판별
app.use(express.json({ limit: '16mb' }));
app.use(express.urlencoded({ extended: false }));

/* ═══════════════════════════════════════════════════════════
 *  접근 제한
 *  APP_PASSWORD 를 설정하면 비밀번호를 아는 사람만 들어올 수 있다.
 *  설정하지 않으면 이 컴퓨터(localhost)에서만 열리고, 외부 접속은 막는다.
 *  — 인터넷에 올렸는데 비밀번호를 깜빡해서 원가 자료가 공개되는 일을 막기 위함
 * ═══════════════════════════════════════════════════════════ */
const PASSWORD = process.env.APP_PASSWORD || '';
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE = 'ec_auth';
const SESSION_DAYS = 30;

const sign = (exp) => crypto.createHmac('sha256', SECRET).update(String(exp)).digest('hex');
function makeToken() {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  return `${exp}.${sign(exp)}`;
}
function validToken(tok) {
  if (!tok || !tok.includes('.')) return false;
  const [exp, mac] = tok.split('.');
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const a = Buffer.from(mac || '', 'utf8');
  const b = Buffer.from(sign(exp), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const readCookie = (req, name) => (req.headers.cookie || '')
  .split(';').map((c) => c.trim().split('='))
  .reduce((v, [k, ...r]) => (k === name ? decodeURIComponent(r.join('=')) : v), '');

const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
  && !req.headers['x-forwarded-for'];

/* 비밀번호 추측 시도를 늦춘다 */
const attempts = new Map();
function tooManyTries(ip) {
  const a = attempts.get(ip);
  if (!a) return false;
  if (Date.now() - a.at > 15 * 60e3) { attempts.delete(ip); return false; }
  return a.n >= 10;
}
function noteFail(ip) {
  const a = attempts.get(ip) || { n: 0, at: Date.now() };
  a.n++; a.at = Date.now();
  attempts.set(ip, a);
}

function loginPage(msg) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>로그인 · 메뉴 원가 분석</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f6f7f9;
 font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic","맑은 고딕",sans-serif;color:#0f172a}
@media (prefers-color-scheme:dark){body{background:#0b1120;color:#e8eefc}}
form{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px 28px;width:min(360px,92vw);
 box-shadow:0 20px 50px -24px rgba(15,23,42,.35);text-align:center}
@media (prefers-color-scheme:dark){form{background:#111a2e;border-color:#22304d}}
.m{width:46px;height:46px;border-radius:13px;margin:0 auto 14px;display:grid;place-items:center;font-size:22px;
 background:linear-gradient(140deg,#0d9488,#0f766e)}
h1{font-size:17px;margin:0 0 4px}p{font-size:13px;color:#64748b;margin:0 0 18px}
input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid #cbd5e1;background:#fffbeb;
 font-size:15px;text-align:center;color:#0f172a}
@media (prefers-color-scheme:dark){input{background:#2a2410;color:#e8eefc;border-color:#2e3f63}}
button{width:100%;margin-top:10px;padding:12px;border:0;border-radius:10px;background:#0d9488;color:#04211d;
 font-size:15px;font-weight:700;cursor:pointer}
.e{margin-top:12px;font-size:13px;color:#be123c}
</style></head><body>
<form method="post" action="/login">
  <div class="m">🏔️</div>
  <h1>메뉴 원가 분석</h1>
  <p>비밀번호를 입력하세요</p>
  <input type="password" name="password" autofocus autocomplete="current-password" required>
  <button type="submit">들어가기</button>
  ${msg ? `<div class="e">${msg}</div>` : ''}
</form></body></html>`;
}

const CLOSED_PAGE = `<!doctype html><meta charset="utf-8"><title>설정 필요</title>
<div style="font-family:sans-serif;max-width:520px;margin:15vh auto;padding:0 20px;line-height:1.7">
<h2 style="margin:0 0 8px">🔒 비밀번호가 설정되지 않았습니다</h2>
<p style="color:#64748b">인터넷에 공개된 상태로 원가 자료가 노출되는 것을 막기 위해 외부 접속을 차단했습니다.</p>
<p>배포 환경의 환경변수에 <code style="background:#f1f5f9;padding:2px 6px;border-radius:5px">APP_PASSWORD</code> 를
설정한 뒤 다시 시작하세요.</p>
<p style="color:#94a3b8;font-size:13px">Render → 서비스 → Environment → Add Environment Variable</p></div>`;

app.post('/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!PASSWORD) return res.status(503).send(CLOSED_PAGE);
  if (tooManyTries(ip)) return res.status(429).send(loginPage('시도가 너무 많습니다. 15분 후 다시 해주세요.'));
  const given = Buffer.from(String((req.body || {}).password || ''), 'utf8');
  const want = Buffer.from(PASSWORD, 'utf8');
  const ok = given.length === want.length && crypto.timingSafeEqual(given, want);
  if (!ok) { noteFail(ip); return res.status(401).send(loginPage('비밀번호가 맞지 않습니다.')); }
  attempts.delete(ip);
  res.setHeader('Set-Cookie',
    `${COOKIE}=${makeToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}` +
    (req.secure ? '; Secure' : ''));
  res.redirect('/');
});

app.get('/login', (_req, res) => res.send(PASSWORD ? loginPage('') : CLOSED_PAGE));

app.use((req, res, next) => {
  if (req.path === '/healthz' || req.path === '/login') return next();
  if (PASSWORD) {
    if (validToken(readCookie(req, COOKIE))) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });
    return res.status(401).send(loginPage(''));
  }
  if (isLocal(req)) return next();               // 비밀번호 없으면 이 컴퓨터에서만
  if (req.path.startsWith('/api/')) return res.status(403).json({ ok: false, error: 'APP_PASSWORD 를 설정하세요.' });
  return res.status(403).send(CLOSED_PAGE);
});

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
  if (PASSWORD) {
    console.log('  🔒 비밀번호 보호 켜짐 (APP_PASSWORD)');
    if (!process.env.SESSION_SECRET)
      console.log('  ⚠ SESSION_SECRET 미설정 — 서버를 다시 시작하면 로그인이 풀립니다. 환경변수로 지정하세요.');
  } else {
    console.log('  ⚠ APP_PASSWORD 미설정 — 이 컴퓨터(localhost)에서만 접속됩니다.');
    console.log('    인터넷에 배포한다면 반드시 APP_PASSWORD 를 설정하세요.');
  }
});

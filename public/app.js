/* =====================================================================
 *  에베레스트 메뉴 원가 분석 · 프런트엔드
 *  - 원본 데이터(dataset) + 사용자 수정값(overrides) 를 합쳐 계산
 *  - 수정값은 서버(/api/overrides)와 localStorage 양쪽에 저장
 * =====================================================================*/
(() => {
'use strict';

const LS_KEY = 'everest-cost-overrides-v2';

/* localStorage 는 시크릿 모드·정책에 따라 접근만 해도 예외를 던진다.
   화면이 통째로 멈추지 않도록 전부 이 래퍼를 통해서만 쓴다. */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return localStorage.getItem(k) !== null; } catch (_) { return false; } },
};
const $  = (s, r = document) => r.querySelector(s);
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

/* ── 포맷 ───────────────────────────────────────────── */
const won  = (v) => (isFinite(v) ? Math.round(v).toLocaleString('ko-KR') : '–');
const won1 = (v) => (isFinite(v) ? (Math.round(v * 10) / 10).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : '–');
const won3 = (v) => (isFinite(v) ? v.toLocaleString('ko-KR', { maximumFractionDigits: 3 }) : '–');
const pct  = (v, d = 1) => (isFinite(v) ? (v * 100).toFixed(d) + '%' : '–');

/* ── 상태 ───────────────────────────────────────────── */
const state = {
  base: null,          // 처음 들어 있던 원본 (되돌리기·변경표시 기준)
  data: null,          // 지금 편집 중인 데이터 (이걸 저장한다)
  view: 'dash',
  result: null,
  filter: { q: '', cat: 'all', grade: 'all', sort: 'cat', ingQ: '' },
  sync: 'synced',
  savedAt: null,
  loadedFromFile: false,
  serverOk: true,
};

const clone = (o) => JSON.parse(JSON.stringify(o));

/* ── 계산 · 저장 트리거 ─────────────────────────────── */
function merged() { return state.data; }
function recalc() { state.result = Calc.compute(state.data); }
/** 데이터를 바꾼 뒤 반드시 호출 — 다시 계산하고 자동 저장을 예약한다 */
function commit() { recalc(); markDirty(); scheduleSave(); }

/* ── 원본과 달라졌는지 (노란 테두리 표시용) ─────────── */
const baseIng  = (n) => (state.base.ingredients || []).find((x) => x.name === n);
const basePrep = (n) => (state.base.preps || []).find((x) => x.name === n);
const baseMenu = (n) => (state.base.menus || []).find((x) => x.name === n);
const baseFix  = (n) => (state.base.fixedCosts || []).find((x) => x.name === n);
const diff = (now, was) => was === undefined || Number(now) !== Number(was);

/* ── 항목 추가 · 삭제 ───────────────────────────────── */
function uniqueName(list, want) {
  let n = want, i = 2;
  while (list.some((x) => x.name === n)) n = `${want} ${i++}`;
  return n;
}
function addIngredient() {
  const name = uniqueName(state.data.ingredients, '새 식재료');
  state.data.ingredients.push({ name, price: 0, pack_qty: 1, unit: 'kg', weight_g: 1000 });
  commit(); render({ keepScroll: true });
  focusRowNamed(name);
}
function addPrep() {
  const name = uniqueName(state.data.preps, '새 프렙');
  state.data.preps.push({ name, yield_g: 1000, yield_rate: 1, items: [] });
  commit(); render({ keepScroll: true });
}
function addMenu(name, category, price) {
  const nm = uniqueName(state.data.menus, name || '새 메뉴');
  const cat = category || (state.data.categoryOrder[0] || '기타');
  if (!state.data.categoryOrder.includes(cat)) state.data.categoryOrder.push(cat);
  if (!state.data.categoryIcon[cat]) state.data.categoryIcon[cat] = '🍽';
  state.data.menus.push({
    name: nm, category: cat, icon: state.data.categoryIcon[cat] || '🍽',
    en: '', time: '', serving: '1인분 기준', price: Number(price) || 0,
    lines: [], steps: [], garnish: '',
  });
  commit();
  return nm;
}
function addFixedCost() {
  const name = uniqueName(state.data.fixedCosts, '새 비용 항목');
  state.data.fixedCosts.push({ name, amount: 0, include: true, note: '' });
  commit(); render({ keepScroll: true });
}
/** 이름을 바꿀 때 이 이름을 참조하던 곳도 같이 고쳐 준다 */
function renameRef(kind, oldName, newName) {
  state.data.menus.forEach((m) => m.lines.forEach((l) => {
    if (l.kind === kind && l.name === oldName) l.name = newName;
  }));
  state.data.preps.forEach((p) => p.items.forEach((it) => {
    if (it.kind === kind && it.name === oldName) it.name = newName;
  }));
}
/** 지우기 전에 어디에서 쓰이는지 알려 준다 */
function usageOf(kind, name) {
  const out = [];
  state.data.menus.forEach((m) => { if (m.lines.some((l) => l.kind === kind && l.name === name)) out.push(m.name); });
  state.data.preps.forEach((p) => { if (p.items.some((i) => i.kind === kind && i.name === name)) out.push(p.name); });
  return out;
}
function removeAt(list, ix) { list.splice(ix, 1); commit(); render({ keepScroll: true }); }

function focusRowNamed(name) {
  setTimeout(() => {
    const rows = document.querySelectorAll('#viewRoot table tbody tr');
    for (const r of rows) {
      const inp = r.querySelector('input[type="text"]');
      if (inp && inp.value === name) { inp.focus(); inp.select(); break; }
    }
  }, 30);
}

/* ── 저장 ───────────────────────────────────────────── */
/* 값을 고치면 0.7초 뒤 자동 저장된다. 따로 저장 버튼을 누를 필요가 없다.
   다만 저장이 "실제로" 됐는지 확인해서, 실패하면 숨기지 않고 알린다.
   (시크릿 모드·저장공간 부족 등에서는 브라우저가 저장을 거부할 수 있다) */
let saveTimer = null;
function markDirty() { state.sync = 'dirty'; paintSync(); }
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 700);
}

/** 브라우저 저장 — 성공하면 true */
function saveLocal() {
  return store.set(LS_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: state.data }));
}
/** 저장된 것 읽기 — 예전 형식(수정값만 저장)도 그대로 읽어 데이터로 바꿔 준다 */
function readLocal() { return parseSaved(store.get(LS_KEY)); }

function parseSaved(raw) {
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw || 'null') : raw;
    if (!j) return null;
    if (j.data) return { data: j.data, savedAt: j.savedAt || null };
    const ov = j.ov || (j.ingredients || j.menus ? j : null);   // 예전 형식(수정값만)
    if (ov) return { ov, savedAt: j.savedAt || null };
    return null;
  } catch (_) { return null; }
}

/** 예전 「수정값」 형식을 원본에 얹어 전체 데이터로 만든다 */
function applyOverrides(base, ov) {
  if (!ov) return clone(base);
  const o = { ingredients: {}, preps: {}, menus: {}, fixedCosts: {}, settings: {}, ...ov };
  return {
    ...clone(base),
    ingredients: base.ingredients.map((i) => ({ ...i, ...(o.ingredients[i.name] || {}) })),
    preps: base.preps.map((p) => {
      const po = o.preps[p.name] || {};
      return { ...p, ...(po.yield_g != null ? { yield_g: po.yield_g } : {}),
               items: p.items.map((it, ix) => ({ ...it, ...((po.items || {})[ix] || {}) })) };
    }),
    menus: base.menus.map((m) => {
      const mo = o.menus[m.name] || {};
      return { ...m, ...(mo.price != null ? { price: mo.price } : {}),
               lines: m.lines.map((l, ix) => ({ ...l, ...((mo.lines || {})[ix] || {}) })) };
    }),
    fixedCosts: base.fixedCosts.map((f) => ({ ...f, ...(o.fixedCosts[f.name] || {}) })),
    settings: { ...base.settings, ...o.settings },
  };
}

async function save() {
  const okLocal = saveLocal();

  if (!state.serverOk) {                       // 단일 파일 / 정적 배포
    state.sync = okLocal ? 'local' : 'error';
    if (okLocal) state.savedAt = new Date();
    paintSync();
    warnIfCannotSave(okLocal);
    return;
  }
  try {                                        // 서버 모드
    const res = await fetch('/api/data', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: state.data }),
    });
    if (!res.ok) throw new Error(res.status);
    state.sync = 'synced';
    state.savedAt = new Date();
  } catch (_) {
    state.serverOk = false;
    state.sync = okLocal ? 'local' : 'error';
    if (okLocal) state.savedAt = new Date();
    warnIfCannotSave(okLocal);
  }
  paintSync();
}

/* 저장이 아예 안 되는 상황이면 한 번만 크게 알려준다 */
let warned = false;
function warnIfCannotSave(ok) {
  if (ok) return;
  state.sync = 'error';                    // 표시 문구도 「저장 실패」로 맞춘다
  paintSync();
  if (warned) return;
  warned = true;
  const b = $('#saveWarn');
  if (b) b.hidden = false;
  toast('이 브라우저에 저장할 수 없습니다 — [백업] 으로 파일을 저장해 주세요');
}

const hhmm = (d) => d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });

function paintSync() {
  const box = $('#syncBox'), txt = $('#syncText');
  if (!box) return;
  box.dataset.state = state.sync;

  const when = state.savedAt ? ` · ${hhmm(state.savedAt)}` : '';
  txt.textContent =
      state.sync === 'dirty' ? (state.serverOk ? '저장 중…' : '저장 중…')
    : state.sync === 'synced' ? '서버에 저장됨' + when
    : state.sync === 'local'  ? '자동 저장됨' + when
    : '저장 실패 — 백업하세요';

  box.title =
      state.sync === 'error' ? '이 브라우저가 저장을 거부하고 있습니다(시크릿 모드 등). [백업] 으로 파일을 저장해 두세요.'
    : state.sync === 'synced' ? '수정값이 서버에 저장되어 모든 기기에서 같은 값을 봅니다.'
    : (self.EMBEDDED_DATASET
        ? '값을 고치면 자동으로 저장됩니다. 다른 기기로 옮기려면 [백업] 파일을 보내 [복원] 하세요.'
        : '값을 고치면 자동으로 저장됩니다. 다른 기기와 공유하려면 [백업] 파일을 옮겨 [복원] 하세요.');

  // 모바일 상단 표시
  const m = $('#syncMobile');
  if (m) {
    m.dataset.state = state.sync;
    m.textContent = state.sync === 'dirty' ? '저장 중…'
                  : state.sync === 'error' ? '저장 실패'
                  : '저장됨' + when;
  }
}

/* ── 어떤 데이터로 시작할지 고르기 ────────────────────
   ① 서버에 저장된 것이 있으면 그것
   ② 없으면, 파일에 담겨 온 것과 이 브라우저에 저장된 것 중 "더 최근" 것
      (다른 PC에서 받은 파일을 열면 그 파일의 값이, 쓰던 PC에서 다시 열면
       그동안 고친 값이 자연스럽게 이어진다) */
function readEmbeddedSaved() {
  const tag = document.getElementById('ovData');
  if (!tag) return null;
  return parseSaved(tag.textContent);
}
function toData(saved, base) {
  return saved.data ? saved.data : applyOverrides(base, saved.ov);
}
function pickData(base, serverSaved) {
  if (serverSaved) return toData(serverSaved, base);

  const fromFile = readEmbeddedSaved();
  const fromHere = readLocal();
  if (fromFile && fromHere) {
    const tf = Date.parse(fromFile.savedAt || 0) || 0;
    const th = Date.parse(fromHere.savedAt || 0) || 0;
    const win = tf > th ? fromFile : fromHere;
    if (win === fromFile) state.loadedFromFile = true;
    return toData(win, base);
  }
  if (fromFile) { state.loadedFromFile = true; return toData(fromFile, base); }
  if (fromHere) return toData(fromHere, base);
  return clone(base);
}

/* ── 화면 정의 ──────────────────────────────────────── */
const VIEWS = [
  { id: 'dash',  icon: '📊', label: '대시보드', title: '대시보드',        desc: '전체 원가 현황 요약' },
  { id: 'menu',  icon: '🍽', label: '메뉴',     title: '메뉴 원가',       desc: '메뉴를 누르면 레시피와 원가 상세가 열립니다' },
  { id: 'ing',   icon: '🥬', label: '식재료',   title: '식재료 단가',     desc: '구매가격을 고치면 모든 메뉴 원가가 즉시 반영됩니다' },
  { id: 'prep',  icon: '🧪', label: '프렙',     title: '프렙(반제품) 원가', desc: '소스·반제품의 g당 원가' },
  { id: 'fix',   icon: '💰', label: '고정비',   title: '고정비 설정',     desc: '고정비 배분율을 결정합니다' },
  { id: 'issue', icon: '⚠️', label: '점검',     title: '확인 필요 항목',  desc: '값이 비었거나 추정한 부분' },
];

/* ── 네비게이션 ─────────────────────────────────────── */
function buildNav() {
  const d = $('#navDesktop'), m = $('#navMobile');
  d.innerHTML = ''; m.innerHTML = '';
  VIEWS.forEach((v) => {
    const b = el('button');
    b.innerHTML = `<span class="ic">${v.icon}</span><span>${v.label}</span>`;
    if (v.id === 'issue') { const n = el('span', 'badge', String((state.data.issues || []).length)); b.appendChild(n); }
    b.onclick = () => go(v.id);
    b.dataset.id = v.id;
    d.appendChild(b);

    const t = el('button');
    t.innerHTML = `<span class="ic">${v.icon}</span><span>${v.label}</span>`;
    t.onclick = () => go(v.id);
    t.dataset.id = v.id;
    m.appendChild(t);
  });
}
function go(id) {
  state.view = id;
  location.hash = id;
  render();
}

/* ── 렌더 ───────────────────────────────────────────── */
function paintBrand() {
  const b = $('#brandName');
  if (b) b.textContent = (state.data.meta.brand || '우리 매장');
  const t = state.data.meta.brand ? `${state.data.meta.brand} · 메뉴 원가 분석` : '메뉴 원가 분석';
  if (document.title !== t) document.title = t;
}

function render(opts = {}) {
  const v = VIEWS.find((x) => x.id === state.view) || VIEWS[0];
  $('#viewTitle').textContent = v.title;
  $('#viewDesc').textContent = v.desc;
  document.querySelectorAll('.nav button, .tabbar button')
    .forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === state.view)));
  const root = $('#viewRoot');
  const keep = opts.keepScroll ? root.scrollTop : 0;
  root.innerHTML = '';
  ({ dash: viewDash, menu: viewMenu, ing: viewIng, prep: viewPrep, fix: viewFix, issue: viewIssue }[state.view] || viewDash)(root);
  root.scrollTop = keep;
  paintSync();
  paintBrand();
}

/* ── 공통 조각 ──────────────────────────────────────── */
function card(title, sub, bodyFlush) {
  const c = el('div', 'card');
  if (title) {
    const h = el('div', 'card-head');
    const box = el('div');
    box.appendChild(el('h3', null, title));
    if (sub) box.appendChild(el('div', 'sub', sub));
    h.appendChild(box);
    c.appendChild(h);
  }
  const b = el('div', 'card-body' + (bodyFlush ? ' flush' : ''));
  c.appendChild(b);
  return { card: c, body: b, head: c.querySelector('.card-head') };
}
function table(cols) {
  const wrap = el('div', 'tablewrap');
  const t = el('table');
  const thead = el('thead'), tr = el('tr');
  cols.forEach((c) => { const th = el('th', c.num ? 'num' : null, c.label); if (c.w) th.style.width = c.w; tr.appendChild(th); });
  thead.appendChild(tr); t.appendChild(thead);
  const tb = el('tbody'); t.appendChild(tb);
  wrap.appendChild(t);
  return { wrap, tbody: tb };
}
function numInput(value, onChange, opts = {}) {
  const i = el('input', 'inp' + (opts.changed ? ' changed' : ''));
  i.type = 'number'; i.inputMode = 'decimal';
  i.value = value;
  if (opts.step) i.step = opts.step;
  if (opts.min != null) i.min = opts.min;
  const commit = () => {
    const v = parseFloat(i.value);
    if (isNaN(v) || v < 0) { i.value = value; return; }
    if (v === Number(value)) return;
    onChange(v);
  };
  i.onchange = commit;
  i.onkeydown = (e) => { if (e.key === 'Enter') i.blur(); };
  return i;
}
function textInput(value, onChange, opts = {}) {
  const i = el('input', 'inp inp-text' + (opts.changed ? ' changed' : ''));
  i.type = 'text';
  i.value = value == null ? '' : value;
  if (opts.placeholder) i.placeholder = opts.placeholder;
  i.onchange = () => {
    const v = i.value.trim();
    if (!v || v === value) { i.value = value; return; }
    onChange(v);
  };
  i.onkeydown = (e) => { if (e.key === 'Enter') i.blur(); };
  return i;
}
function delButton(label, onDel) {
  const b = el('button', 'del-btn', '✕');
  b.type = 'button';
  b.title = label + ' 삭제';
  b.setAttribute('aria-label', label + ' 삭제');
  b.onclick = (e) => { e.stopPropagation(); onDel(); };
  return b;
}
function addBar(label, onAdd) {
  const w = el('div', 'addbar');
  const b = el('button', 'btn btn-add', '＋ ' + label);
  b.type = 'button';
  b.onclick = onAdd;
  w.appendChild(b);
  return w;
}
function confirmDelete(what, used) {
  const extra = used && used.length
    ? `\n\n지금 「${used.slice(0, 4).join(', ')}${used.length > 4 ? ' 외 ' + (used.length - 4) + '건' : ''}」 에서 쓰이고 있습니다.\n지우면 그곳의 원가가 0원으로 계산됩니다.`
    : '';
  return confirm(`「${what}」 을(를) 지울까요?${extra}`);
}

function gradeBadge(g) {
  const b = el('span', 'badge-grade g-' + g.key, `${g.icon} ${g.label}`);
  return b;
}
function bar(rate, warn, bad) {
  const w = el('div', 'bar' + (rate > bad ? ' bad' : rate > warn ? ' warn' : ''));
  const i = el('i');
  i.style.width = Math.min(100, Math.max(0, rate * 100 / Math.max(bad * 1.6, .5) * 1)) + '%';
  w.appendChild(i);
  return w;
}

/* ═══════════════ 대시보드 ═══════════════ */
function viewDash(root) {
  const r = state.result, s = r.summary, st = r.settings;

  const kpis = el('div', 'kpis');
  const K = (lab, val, sub, tone) => {
    const k = el('div', 'kpi' + (tone ? ' ' + tone : ''));
    k.appendChild(el('div', 'lab', lab));
    k.appendChild(el('div', 'val', val));
    k.appendChild(el('div', 'sub', sub));
    return k;
  };
  const tone = (v) => (v <= st.targetFoodCostRate ? 'good' : v <= st.warnFoodCostRate ? 'warn' : 'bad');
  kpis.append(
    K('전체 메뉴', String(s.menuCount), `판매가 입력 ${s.pricedCount}개`),
    K('평균 식재료 원가율', pct(s.avgFoodRate), '판매가 가중평균', tone(s.avgFoodRate)),
    K('평균 총원가율', pct(s.avgTotalRate), '식재료 + 고정비'),
    K('평균 마진율', pct(s.avgMarginRate), '판매가 대비'),
    K('고정비 배분율', pct(s.fixedRate), `월 ${won(s.fixedAllocatable)}원 ÷ 매출`),
  );
  root.appendChild(kpis);

  /* 판정 현황 */
  const g = card('원가율 판정 현황', '식재료 원가율 기준');
  const gg = el('div', 'kpis');
  gg.style.margin = '0';
  const grades = [
    ['✅ 양호', s.good, 'good', `${pct(0)} ~ ${pct(st.targetFoodCostRate, 0)}`],
    ['🟡 주의', s.warn, 'warn', `~ ${pct(st.warnFoodCostRate, 0)}`],
    ['🔴 과다', s.bad, 'bad', `${pct(st.warnFoodCostRate, 0)} 초과`],
    ['⬜ 판매가 미입력', s.none, '', '판매가를 입력하세요'],
  ];
  grades.forEach(([l, n, t, sub]) => gg.appendChild(K(l, String(n) + '개', sub, t)));
  g.body.appendChild(gg);
  root.appendChild(g.card);

  /* 카테고리 */
  const c = card('카테고리별 원가 분석', '판매가가 입력된 메뉴 기준', true);
  const { wrap, tbody } = table([
    { label: '카테고리' }, { label: '메뉴', num: true }, { label: '판매가 합계', num: true },
    { label: '식재료원가', num: true }, { label: '원가율', num: true },
    { label: '총원가', num: true }, { label: '마진 합계', num: true }, { label: '마진율', num: true },
  ]);
  r.categories.forEach((ct) => {
    const tr = el('tr');
    tr.innerHTML = `<td class="name">${ct.icon} ${ct.category}</td>
      <td class="num dim">${ct.count}</td>
      <td class="num">${won(ct.price)}</td>
      <td class="num">${won(ct.foodCost)}</td>
      <td class="num"><b>${pct(ct.foodRate)}</b></td>
      <td class="num">${won(ct.totalCost)}</td>
      <td class="num">${won(ct.margin)}</td>
      <td class="num"><b>${pct(ct.marginRate)}</b></td>`;
    tbody.appendChild(tr);
  });
  c.body.appendChild(wrap);
  root.appendChild(c.card);

  /* 개선 우선순위 */
  const priced = r.menus.filter((m) => m.hasPrice);
  const worst = [...priced].sort((a, b) => b.foodRate - a.foodRate).slice(0, 10);
  const best  = [...priced].sort((a, b) => a.foodRate - b.foodRate).slice(0, 10);
  const mk = (title, sub, list) => {
    const cc = card(title, sub, true);
    const t = table([{ label: '#' }, { label: '메뉴' }, { label: '판매가', num: true },
                     { label: '식재료원가', num: true }, { label: '원가율', num: true }]);
    list.forEach((m, i) => {
      const tr = el('tr', 'clickable');
      tr.innerHTML = `<td class="dim">${i + 1}</td><td class="name">${m.name}</td>
        <td class="num">${won(m.price)}</td><td class="num">${won(m.foodCost)}</td>
        <td class="num"><b>${pct(m.foodRate)}</b></td>`;
      tr.onclick = () => openMenu(m.name);
      t.tbody.appendChild(tr);
    });
    cc.body.appendChild(t.wrap);
    return cc.card;
  };
  root.appendChild(mk('개선 우선순위 TOP 10', '식재료 원가율이 가장 높은 메뉴', worst));
  root.appendChild(mk('효자 메뉴 TOP 10', '식재료 원가율이 가장 낮은 메뉴', best));
}

/* ═══════════════ 메뉴 ═══════════════ */
function viewMenu(root) {
  const r = state.result, st = r.settings, f = state.filter;

  const bar1 = el('div', 'filters');
  const search = el('input', 'search');
  search.type = 'search'; search.placeholder = '메뉴 검색…'; search.value = f.q;
  search.oninput = () => { f.q = search.value; paint(); };
  bar1.appendChild(search);

  const sel = el('select', 'sel');
  [['cat', '카테고리 순'], ['rate-desc', '원가율 높은 순'], ['rate-asc', '원가율 낮은 순'],
   ['margin-desc', '마진 큰 순'], ['price-desc', '판매가 높은 순'], ['name', '이름순']]
    .forEach(([v, l]) => { const o = el('option', null, l); o.value = v; sel.appendChild(o); });
  sel.value = f.sort;
  sel.onchange = () => { f.sort = sel.value; paint(); };
  bar1.appendChild(sel);

  const gsel = el('select', 'sel');
  [['all', '전체 판정'], ['good', '✅ 양호'], ['warn', '🟡 주의'], ['bad', '🔴 과다'], ['none', '⬜ 판매가 미입력']]
    .forEach(([v, l]) => { const o = el('option', null, l); o.value = v; gsel.appendChild(o); });
  gsel.value = f.grade;
  gsel.onchange = () => { f.grade = gsel.value; paint(); };
  bar1.appendChild(gsel);
  root.appendChild(bar1);

  const chips = el('div', 'chips');
  chips.style.marginBottom = '14px';
  const cats = ['all', ...state.data.categoryOrder.filter((c) => r.menus.some((m) => m.category === c))];
  cats.forEach((c) => {
    const b = el('button', 'chip', c === 'all' ? '전체' : `${state.data.categoryIcon[c] || ''} ${c}`);
    b.setAttribute('aria-pressed', String(f.cat === c));
    b.onclick = () => { f.cat = c; paint(); };
    chips.appendChild(b);
  });
  root.appendChild(chips);

  const host = el('div');
  root.appendChild(host);

  function list() {
    let out = r.menus.filter((m) =>
      (f.cat === 'all' || m.category === f.cat) &&
      (f.grade === 'all' || m.grade.key === f.grade) &&
      (!f.q || m.name.toLowerCase().includes(f.q.toLowerCase()) || (m.en || '').toLowerCase().includes(f.q.toLowerCase())));
    const cmp = {
      cat: () => 0,
      name: (a, b) => a.name.localeCompare(b.name, 'ko'),
      'rate-desc': (a, b) => (b.hasPrice ? b.foodRate : -1) - (a.hasPrice ? a.foodRate : -1),
      'rate-asc': (a, b) => (a.hasPrice ? a.foodRate : 9) - (b.hasPrice ? b.foodRate : 9),
      'margin-desc': (a, b) => b.margin - a.margin,
      'price-desc': (a, b) => b.price - a.price,
    }[f.sort];
    if (f.sort !== 'cat') out = [...out].sort(cmp);
    return out;
  }

  function paint() {
    chips.querySelectorAll('.chip').forEach((b, i) => b.setAttribute('aria-pressed', String(cats[i] === f.cat)));
    host.innerHTML = '';
    const rows = list();
    if (!rows.length) { host.appendChild(el('div', 'empty', '조건에 맞는 메뉴가 없습니다.')); return; }

    /* PC 표 */
    const c = card(null, null, true);
    const t = table([
      { label: '메뉴' }, { label: '판매가', num: true }, { label: '식재료원가', num: true },
      { label: '원가율', num: true }, { label: '고정비배분', num: true }, { label: '총원가', num: true },
      { label: '마진', num: true }, { label: '마진율', num: true }, { label: '판정' }, { label: '' },
    ]);
    rows.forEach((m) => {
      const tr = el('tr', 'clickable');
      const nameTd = el('td', 'name');
      nameTd.innerHTML = `${m.name}<div class="cat-chip">${m.icon} ${m.category}</div>`;
      tr.appendChild(nameTd);

      const dm = state.data.menus.find((x) => x.name === m.name);
      const wasM = baseMenu(m.name);
      const priceTd = el('td', 'num');
      priceTd.appendChild(numInput(dm.price, (v) => { dm.price = v; commit(); render({ keepScroll: true }); },
        { changed: diff(dm.price, wasM && wasM.price) }));
      priceTd.onclick = (e) => e.stopPropagation();
      tr.appendChild(priceTd);

      const cells = [
        won1(m.foodCost), m.hasPrice ? pct(m.foodRate) : '–', won(m.fixedCost),
        won(m.totalCost), m.hasPrice ? won(m.margin) : '–', m.hasPrice ? pct(m.marginRate) : '–',
      ];
      cells.forEach((v, i) => {
        const td = el('td', 'num', v);
        if (i === 1) td.style.fontWeight = '750';
        tr.appendChild(td);
      });
      const gt = el('td'); gt.appendChild(gradeBadge(m.grade)); tr.appendChild(gt);
      const act = el('td', 'act');
      act.appendChild(delButton(m.name, () => {
        if (!confirmDelete(m.name, usageOf('메뉴', m.name))) return;
        removeAt(state.data.menus, state.data.menus.findIndex((x) => x.name === m.name));
      }));
      tr.appendChild(act);
      tr.onclick = () => openMenu(m.name);
      t.tbody.appendChild(tr);
    });
    t.wrap.classList.add('desktop-only');
    c.body.appendChild(t.wrap);
    c.card.appendChild(newMenuForm());
    host.appendChild(c.card);

    /* 모바일 카드 */
    const cards = el('div', 'cards');
    rows.forEach((m) => {
      const k = el('div', 'mcard');
      k.innerHTML = `
        <div class="mcard-top">
          <div class="t"><b>${m.name}</b><span>${m.icon} ${m.category}</span></div>
          <span class="badge-grade g-${m.grade.key}">${m.grade.icon} ${m.grade.label}</span>
        </div>
        <div class="mcard-grid">
          <div><div class="l">판매가</div><div class="v">${m.hasPrice ? won(m.price) : '–'}</div></div>
          <div><div class="l">식재료원가</div><div class="v">${won(m.foodCost)}</div></div>
          <div><div class="l">원가율</div><div class="v">${m.hasPrice ? pct(m.foodRate) : '–'}</div></div>
        </div>`;
      k.onclick = () => openMenu(m.name);
      cards.appendChild(k);
    });
    const mAdd = card(null, null, true);
    mAdd.card.classList.add('mobile-only');
    mAdd.card.appendChild(newMenuForm());
    cards.appendChild(mAdd.card);
    host.appendChild(cards);
  }
  paint();
}

/* 새 메뉴 추가 폼 */
function newMenuForm() {
  const w = el('div', 'newform');
  const name = el('input'); name.type = 'text'; name.placeholder = '새 메뉴 이름';
  const cat = el('select', 'sel');
  state.data.categoryOrder.forEach((c) => {
    const o = el('option', null, `${state.data.categoryIcon[c] || ''} ${c}`); o.value = c; cat.appendChild(o);
  });
  const price = el('input'); price.type = 'number'; price.placeholder = '판매가'; price.min = '0';
  const btn = el('button', 'btn btn-primary', '＋ 메뉴 추가');
  const submit = () => {
    const nm = name.value.trim();
    if (!nm) { name.focus(); return; }
    const created = addMenu(nm, cat.value, parseFloat(price.value) || 0);
    name.value = ''; price.value = '';
    render({ keepScroll: true });
    openMenu(created);
  };
  btn.onclick = submit;
  name.onkeydown = price.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  w.append(name, cat, price, btn);
  return w;
}

/* ═══════════════ 메뉴 상세 시트 ═══════════════ */
function openMenu(name) {
  const m = state.result.menus.find((x) => x.name === name);
  if (!m) return;
  const d = state.data.menus.find((x) => x.name === name);
  const was = baseMenu(name);
  const redraw = () => { render({ keepScroll: true }); openMenu(d.name); };

  $('#sheetTitle').textContent = m.name;
  $('#sheetSub').textContent = [`${m.icon} ${m.category}`, m.en, m.serving, m.time].filter(Boolean).join(' · ');
  const body = $('#sheetBody');
  body.innerHTML = '';

  if (!m.hasPrice) {
    const n = el('div', 'notebox');
    n.innerHTML = '<b>판매가가 없습니다.</b> 아래 판매가를 입력하면 원가율·마진이 계산됩니다.';
    body.appendChild(n);
  }

  /* ── 메뉴 기본 정보 ── */
  const info = el('div', 'newform');
  info.style.cssText = 'border-top:0;padding:0 0 14px';
  const nm = el('input'); nm.type = 'text'; nm.value = d.name; nm.placeholder = '메뉴 이름';
  nm.onchange = () => {
    const v = nm.value.trim();
    if (!v || v === d.name) { nm.value = d.name; return; }
    if (state.data.menus.some((x) => x !== d && x.name === v)) { toast('같은 이름이 이미 있습니다'); nm.value = d.name; return; }
    renameRef('메뉴', d.name, v); d.name = v; commit(); render({ keepScroll: true }); openMenu(v);
  };
  const cs = el('select', 'sel');
  state.data.categoryOrder.forEach((c) => {
    const o = el('option', null, `${state.data.categoryIcon[c] || ''} ${c}`); o.value = c; cs.appendChild(o);
  });
  cs.value = d.category;
  cs.onchange = () => { d.category = cs.value; d.icon = state.data.categoryIcon[cs.value] || '🍽'; commit(); redraw(); };
  info.append(nm, cs);
  body.appendChild(info);

  /* ── 요약 ── */
  const bd = el('div', 'breakdown');
  const cell = (l, v, color) => {
    const x = el('div');
    x.appendChild(el('div', 'l', l));
    const vv = el('div', 'v', v);
    if (color) vv.style.color = color;
    x.appendChild(vv);
    return x;
  };
  const priceBox = el('div');
  priceBox.appendChild(el('div', 'l', '판매가 (수정 가능)'));
  const pin = numInput(d.price, (v) => { d.price = v; commit(); redraw(); },
    { changed: diff(d.price, was && was.price) });
  pin.style.maxWidth = '100%';
  pin.style.marginTop = '4px';
  priceBox.appendChild(pin);
  bd.append(
    priceBox,
    cell('식재료 원가', won1(m.foodCost)),
    cell('식재료 원가율', m.hasPrice ? pct(m.foodRate) : '–',
         m.hasPrice ? (m.grade.key === 'good' ? 'var(--good)' : m.grade.key === 'warn' ? 'var(--warn)' : 'var(--bad)') : ''),
    cell('고정비 배분', won(m.fixedCost)),
    cell('총원가', won(m.totalCost)),
    cell('마진', m.hasPrice ? won(m.margin) : '–'),
    cell('마진율', m.hasPrice ? pct(m.marginRate) : '–'),
  );
  body.appendChild(bd);

  /* ── 재료 ── */
  body.appendChild(el('div', 'sec-title', '재료 · 원가 구성'));
  const lines = el('div', 'lines');
  const head = el('div', 'line line-head');
  head.innerHTML = `<div class="c-name">재료 / 구성</div><div class="c-qty">사용량</div>
                    <div class="c-yield">수율%</div><div class="c-unit">g당 단가</div><div class="c-cost">재료비</div>
                    <div class="c-del"></div>`;
  lines.appendChild(head);

  m.lines.forEach((l, ix) => {
    const dl = d.lines[ix];
    const row = el('div', 'line');

    const nmBox = el('div', 'c-name');
    const kindSel = el('select', 'sel');
    kindSel.style.cssText = 'padding:4px 6px;font-size:11.5px;margin-right:6px';
    ['식재료', '프렙', '메뉴', '무료'].forEach((k) => { const o = el('option', null, k); o.value = k; kindSel.appendChild(o); });
    kindSel.value = dl.kind;
    kindSel.onchange = () => {
      dl.kind = kindSel.value;
      const src = { 식재료: state.data.ingredients, 프렙: state.data.preps, 메뉴: state.data.menus }[dl.kind];
      dl.name = dl.kind === '무료' ? '물' : ((src && src[0] && src[0].name) || '');
      dl.raw = '';
      commit(); redraw();
    };
    nmBox.appendChild(kindSel);

    if (dl.kind === '무료') {
      nmBox.appendChild(textInput(dl.name || '물', (v) => { dl.name = v; commit(); redraw(); }));
    } else {
      const src = { 식재료: state.data.ingredients, 프렙: state.data.preps, 메뉴: state.data.menus }[dl.kind] || [];
      const sel = el('select', 'sel');
      sel.style.cssText = 'padding:4px 8px;max-width:190px;font-size:13px';
      src.forEach((x) => { if (x.name !== d.name) { const o = el('option', null, x.name); o.value = x.name; sel.appendChild(o); } });
      if (!src.some((x) => x.name === dl.name)) {
        const o = el('option', null, dl.name ? `${dl.name} (목록에 없음)` : '— 선택 —');
        o.value = dl.name || ''; sel.appendChild(o);
      }
      sel.value = dl.name || '';
      sel.onchange = () => { dl.name = sel.value; dl.raw = ''; commit(); redraw(); };
      nmBox.appendChild(sel);
    }
    if (l.raw && l.raw !== l.name) nmBox.appendChild(el('span', 'sub', `원본 표기: ${l.raw}`));
    if (l.note) nmBox.appendChild(el('span', 'sub', l.note));
    row.appendChild(nmBox);

    const q = el('div', 'c-qty');
    q.appendChild(el('span', 'flab', dl.kind === '메뉴' ? '수량' : '사용량'));
    q.appendChild(numInput(dl.qty, (v) => { dl.qty = v; commit(); redraw(); },
      { changed: diff(dl.qty, was && was.lines[ix] && was.lines[ix].qty), step: 'any' }));
    row.appendChild(q);

    const y = el('div', 'c-yield');
    y.appendChild(el('span', 'flab', '수율%'));
    if (dl.kind === '식재료' || dl.kind === '프렙') {
      y.appendChild(numInput(Math.round((dl.yield || 1) * 100),
        (v) => { dl.yield = Math.max(0.01, v / 100); commit(); redraw(); },
        { changed: diff((dl.yield || 1) * 100, was && was.lines[ix] && (was.lines[ix].yield || 1) * 100) }));
    } else y.appendChild(el('span', 'val', '–'));
    row.appendChild(y);

    const u = el('div', 'c-unit');
    u.appendChild(el('span', 'flab', 'g당 단가'));
    u.appendChild(el('span', 'val', l.kind === '무료' ? '0' : won3(l.unitCost)));
    row.appendChild(u);

    const cst = el('div', 'c-cost');
    cst.appendChild(el('span', 'flab', '재료비'));
    cst.appendChild(el('span', 'val strong', won1(l.cost)));
    row.appendChild(cst);

    const del = el('div', 'c-del');
    del.appendChild(delButton(dl.name || '재료', () => { d.lines.splice(ix, 1); commit(); redraw(); }));
    row.appendChild(del);

    lines.appendChild(row);
  });

  const foot = el('div', 'line line-foot');
  foot.innerHTML = `<div class="c-name"><b>합 계</b></div><div class="c-qty"></div><div class="c-yield"></div>
                    <div class="c-unit"></div><div class="c-cost"><span class="val strong total">${won1(m.foodCost)}</span></div>
                    <div class="c-del"></div>`;
  lines.appendChild(foot);
  body.appendChild(lines);

  const addLine = el('button', 'btn btn-add', '＋ 재료 추가');
  addLine.style.marginTop = '10px';
  addLine.onclick = () => {
    d.lines.push({ kind: '식재료', name: (state.data.ingredients[0] || {}).name || '', raw: '',
                   qty: 0, unit: 'g', yield: 1, note: '' });
    commit(); redraw();
  };
  body.appendChild(addLine);

  /* ── 조리법 ── */
  body.appendChild(el('div', 'sec-title', '조리 방법'));
  const stepsBox = el('textarea', 'ta');
  stepsBox.rows = Math.max(4, (d.steps || []).length + 1);
  stepsBox.value = (d.steps || []).join('\n');
  stepsBox.placeholder = '한 줄에 한 단계씩 적으세요.\n예) 팬에 기름을 두르고 마늘을 볶는다.';
  stepsBox.onchange = () => {
    d.steps = stepsBox.value.split('\n').map((x) => x.trim()).filter(Boolean);
    commit(); redraw();
  };
  body.appendChild(stepsBox);
  if (m.steps && m.steps.length) {
    const ol = el('ol', 'steps');
    m.steps.forEach((x) => ol.appendChild(el('li', null, x)));
    body.appendChild(ol);
  }

  body.appendChild(el('div', 'sec-title', '가니쉬 · 플레이팅'));
  const gBox = el('textarea', 'ta');
  gBox.rows = 2;
  gBox.value = d.garnish || '';
  gBox.placeholder = '담음새·장식 메모';
  gBox.onchange = () => { d.garnish = gBox.value.trim(); commit(); redraw(); };
  body.appendChild(gBox);

  /* ── 메뉴 삭제 ── */
  const danger = el('button', 'btn btn-block btn-danger', '이 메뉴 삭제');
  danger.style.marginTop = '22px';
  danger.onclick = () => {
    if (!confirmDelete(d.name, usageOf('메뉴', d.name))) return;
    const ix = state.data.menus.findIndex((x) => x === d);
    state.data.menus.splice(ix, 1);
    commit(); closeSheet(); render({ keepScroll: true });
  };
  body.appendChild(danger);

  $('#sheet').hidden = false;
  $('#sheetBackdrop').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheetBackdrop').hidden = true;
  document.body.style.overflow = '';
}

/* ═══════════════ 식재료 ═══════════════ */
function viewIng(root) {
  const r = state.result;
  const f = state.filter;
  const bar1 = el('div', 'filters');
  const search = el('input', 'search');
  search.type = 'search'; search.placeholder = '식재료 검색…'; search.value = f.ingQ;
  search.oninput = () => { f.ingQ = search.value; paint(); };
  bar1.appendChild(search);
  const info = el('div');
  info.style.cssText = 'font-size:12.5px;color:var(--muted)';
  info.textContent = `총 ${r.ingredients.length}종 · g당 단가 = 구매가격 ÷ 총중량`;
  bar1.appendChild(info);
  root.appendChild(bar1);

  const host = el('div');
  root.appendChild(host);

  function paint() {
    host.innerHTML = '';
    const rows = r.ingredients.filter((i) => !f.ingQ || i.name.toLowerCase().includes(f.ingQ.toLowerCase()));
    const c = card(null, null, true);
    const t = table([
      { label: '식재료명' }, { label: '구매가격(원)', num: true }, { label: '규격', num: true },
      { label: '단위' }, { label: '총중량(g)', num: true }, { label: 'g당 단가', num: true },
      { label: '상태' }, { label: '' },
    ]);
    rows.forEach((it) => {
      const ix = state.data.ingredients.findIndex((x) => x.name === it.name);
      const d = state.data.ingredients[ix];
      const was = baseIng(it.name);
      const tr = el('tr');

      const nameTd = el('td');
      nameTd.appendChild(textInput(d.name, (v) => {
        if (state.data.ingredients.some((x) => x !== d && x.name === v)) { toast('같은 이름이 이미 있습니다'); render({ keepScroll: true }); return; }
        renameRef('식재료', d.name, v); d.name = v; commit(); render({ keepScroll: true });
      }, { changed: !was }));
      tr.appendChild(nameTd);

      const p = el('td', 'num');
      p.appendChild(numInput(d.price, (v) => { d.price = v; commit(); render({ keepScroll: true }); },
        { changed: diff(d.price, was && was.price) }));
      tr.appendChild(p);

      const q = el('td', 'num');
      q.appendChild(numInput(d.pack_qty, (v) => { d.pack_qty = v; commit(); render({ keepScroll: true }); },
        { changed: diff(d.pack_qty, was && was.pack_qty), step: 'any' }));
      tr.appendChild(q);

      const u = el('td');
      const us = el('input', 'inp inp-text');
      us.type = 'text'; us.value = d.unit || 'kg'; us.style.maxWidth = '70px';
      us.onchange = () => { d.unit = us.value.trim() || 'kg'; commit(); };
      u.appendChild(us);
      tr.appendChild(u);

      const w = el('td', 'num');
      w.appendChild(numInput(d.weight_g, (v) => { d.weight_g = v; commit(); render({ keepScroll: true }); },
        { changed: diff(d.weight_g, was && was.weight_g), step: 'any' }));
      tr.appendChild(w);

      const uc = el('td', 'num', won3(it.unitCost));
      uc.style.cssText = 'font-weight:750;color:var(--accent-ink)';
      tr.appendChild(uc);

      const st = el('td');
      st.innerHTML = it.valid ? '<span class="badge-grade g-good">✓ 정상</span>'
                              : '<span class="badge-grade g-warn">⚠ 값 확인</span>';
      tr.appendChild(st);

      const act = el('td', 'act');
      act.appendChild(delButton(d.name, () => {
        if (!confirmDelete(d.name, usageOf('식재료', d.name))) return;
        removeAt(state.data.ingredients, ix);
      }));
      tr.appendChild(act);
      t.tbody.appendChild(tr);
    });
    if (!rows.length) t.tbody.appendChild(Object.assign(el('tr'), { innerHTML: '<td colspan="8" class="dim" style="text-align:center;padding:28px">해당하는 식재료가 없습니다.</td>' }));
    c.body.appendChild(t.wrap);
    c.card.appendChild(addBar('식재료 추가', addIngredient));
    host.appendChild(c.card);
  }
  paint();
}

/* ═══════════════ 프렙 ═══════════════ */
function viewPrep(root) {
  const r = state.result;

  r.preps.forEach((p) => {
    const px = state.data.preps.findIndex((x) => x.name === p.name);
    const d = state.data.preps[px];
    const was = basePrep(p.name);

    const c = card(null, null, true);
    const head = el('div', 'card-head');
    const nameWrap = el('div', 'brandedit');
    nameWrap.appendChild(textInput(d.name, (v) => {
      if (state.data.preps.some((x) => x !== d && x.name === v)) { toast('같은 이름이 이미 있습니다'); render({ keepScroll: true }); return; }
      renameRef('프렙', d.name, v); d.name = v; commit(); render({ keepScroll: true });
    }, { changed: !was }));
    const yl = el('label', 'switch');
    yl.appendChild(el('span', null, '완성중량(g)'));
    yl.appendChild(numInput(d.yield_g, (v) => { d.yield_g = v; commit(); render({ keepScroll: true }); },
      { changed: diff(d.yield_g, was && was.yield_g), step: 'any' }));
    nameWrap.appendChild(yl);
    head.appendChild(nameWrap);
    const sp = el('div', 'spacer');
    head.appendChild(sp);
    head.appendChild(el('div', 'sub', `투입 ${won(p.inputG)}g · 총 ${won(p.totalCost)}원 · g당 ${won3(p.unitCost)}원`));
    head.appendChild(delButton(d.name, () => {
      if (!confirmDelete(d.name, usageOf('프렙', d.name))) return;
      removeAt(state.data.preps, px);
    }));
    c.card.insertBefore(head, c.body);

    const t = table([
      { label: '구분' }, { label: '재료' }, { label: '투입량(g)', num: true },
      { label: 'g당 단가', num: true }, { label: '재료비', num: true }, { label: '' },
    ]);
    p.items.forEach((it, ix) => {
      const di = d.items[ix];
      const tr = el('tr');
      tr.appendChild(kindCell(di, ['식재료', '프렙'], () => render({ keepScroll: true })));
      tr.appendChild(refCell(di, () => render({ keepScroll: true })));
      const q = el('td', 'num');
      q.appendChild(numInput(di.qty, (v) => { di.qty = v; commit(); render({ keepScroll: true }); },
        { changed: diff(di.qty, was && was.items[ix] && was.items[ix].qty), step: 'any' }));
      tr.appendChild(q);
      tr.appendChild(el('td', 'num', won3(it.unitCost)));
      const cs = el('td', 'num', won1(it.cost));
      cs.style.fontWeight = '700';
      tr.appendChild(cs);
      const act = el('td', 'act');
      act.appendChild(delButton(di.name, () => removeAt(d.items, ix)));
      tr.appendChild(act);
      t.tbody.appendChild(tr);
    });
    const sum = el('tr');
    sum.innerHTML = `<td class="name" colspan="2">합 계</td><td class="num dim">${won(p.inputG)}</td><td></td>
                     <td class="num" style="font-weight:800;color:var(--accent-ink)">${won(p.totalCost)}</td><td></td>`;
    t.tbody.appendChild(sum);
    c.body.appendChild(t.wrap);
    c.card.appendChild(addBar('재료 추가', () => {
      d.items.push({ kind: '식재료', name: (state.data.ingredients[0] || {}).name || '', raw: '', qty: 0 });
      commit(); render({ keepScroll: true });
    }));
    root.appendChild(c.card);
  });

  const add = el('div');
  add.style.marginTop = '16px';
  add.appendChild(addBar('프렙(반제품) 추가', addPrep));
  add.firstChild.style.border = '1px dashed var(--line-2)';
  add.firstChild.style.borderRadius = 'var(--r)';
  root.appendChild(add);
}

/* 구분(식재료/프렙/메뉴/무료) 선택 칸 */
function kindCell(line, kinds, after) {
  const td = el('td');
  const sel = el('select', 'sel');
  sel.style.padding = '6px 8px';
  kinds.forEach((k) => { const o = el('option', null, k); o.value = k; sel.appendChild(o); });
  sel.value = line.kind;
  sel.onchange = () => {
    line.kind = sel.value;
    const first = { 식재료: state.data.ingredients, 프렙: state.data.preps, 메뉴: state.data.menus }[line.kind];
    line.name = line.kind === '무료' ? '물' : ((first && first[0] && first[0].name) || '');
    commit(); after();
  };
  td.appendChild(sel);
  return td;
}
/* 재료 이름 선택 칸 — 구분에 맞는 목록에서 고른다 */
function refCell(line, after) {
  const td = el('td', 'name');
  if (line.kind === '무료') {
    td.appendChild(textInput(line.name || '물', (v) => { line.name = v; commit(); after(); }));
    return td;
  }
  const src = { 식재료: state.data.ingredients, 프렙: state.data.preps, 메뉴: state.data.menus }[line.kind] || [];
  const sel = el('select', 'sel');
  sel.style.cssText = 'padding:6px 8px;max-width:230px';
  src.forEach((x) => { const o = el('option', null, x.name); o.value = x.name; sel.appendChild(o); });
  if (!src.some((x) => x.name === line.name)) {
    const o = el('option', null, line.name ? `${line.name} (없음)` : '— 선택 —');
    o.value = line.name || '';
    sel.appendChild(o);
  }
  sel.value = line.name || '';
  sel.onchange = () => { line.name = sel.value; line.raw = ''; commit(); after(); };
  td.appendChild(sel);
  return td;
}

/* ═══════════════ 고정비 ═══════════════ */
function viewFix(root) {
  const r = state.result, s2 = r.summary, st = r.settings;

  const kpis = el('div', 'kpis');
  const K = (l, v, sub) => { const k = el('div', 'kpi'); k.append(el('div', 'lab', l), el('div', 'val', v), el('div', 'sub', sub)); return k; };
  kpis.append(
    K('고정비 총계', won(s2.fixedTotal) + '원', '입력한 모든 항목'),
    K('배분 대상', won(s2.fixedAllocatable) + '원', '「배분 포함」 항목만'),
    K('월 추정매출', won(s2.monthlyRevenue) + '원', '배달 포함'),
    K('고정비 배분율', pct(s2.fixedRate), '판매가 × 이 비율 = 배분액'),
  );
  root.appendChild(kpis);

  const c = card('월 고정비 내역', '금액을 고치거나 배분 대상에서 빼고 넣을 수 있습니다', true);
  const t = table([{ label: '항목' }, { label: '월간 금액(원)', num: true }, { label: '배분 포함' }, { label: '비고' }, { label: '' }]);
  r.fixedCosts.forEach((f, ix) => {
    const d = state.data.fixedCosts[ix];
    const was = baseFix(f.name);
    const tr = el('tr');

    const nameTd = el('td');
    nameTd.appendChild(textInput(d.name, (v) => {
      if (state.data.fixedCosts.some((x) => x !== d && x.name === v)) { toast('같은 이름이 이미 있습니다'); render({ keepScroll: true }); return; }
      d.name = v; commit(); render({ keepScroll: true });
    }, { changed: !was }));
    tr.appendChild(nameTd);

    const a = el('td', 'num');
    a.appendChild(numInput(d.amount, (v) => { d.amount = v; commit(); render({ keepScroll: true }); },
      { changed: diff(d.amount, was && was.amount) }));
    tr.appendChild(a);

    const sw = el('td');
    const lab = el('label', 'switch');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = d.include !== false;
    cb.onchange = () => { d.include = cb.checked; commit(); render({ keepScroll: true }); };
    lab.append(cb, el('span', null, cb.checked ? '포함' : '제외'));
    sw.appendChild(lab);
    tr.appendChild(sw);

    const noteTd = el('td');
    const ni = el('input', 'inp inp-text');
    ni.type = 'text'; ni.value = d.reason || d.note || ''; ni.placeholder = '메모';
    ni.style.maxWidth = '280px';
    ni.onchange = () => { d.note = ni.value; d.reason = ''; commit(); };
    if (d.reason) ni.style.color = 'var(--warn)';
    noteTd.appendChild(ni);
    tr.appendChild(noteTd);

    const act = el('td', 'act');
    act.appendChild(delButton(d.name, () => {
      if (!confirm(`「${d.name}」 항목을 지울까요?`)) return;
      removeAt(state.data.fixedCosts, ix);
    }));
    tr.appendChild(act);
    t.tbody.appendChild(tr);
  });
  c.body.appendChild(t.wrap);
  c.card.appendChild(addBar('비용 항목 추가', addFixedCost));
  root.appendChild(c.card);

  const s3 = card('배분 · 판정 기준', '이 값에 따라 고정비 배분과 원가율 판정이 달라집니다');
  const grid = el('div', 'breakdown');
  const field = (label, value, onChange, suffix) => {
    const d = el('div');
    d.appendChild(el('div', 'l', label));
    const i = numInput(value, onChange, { step: 'any' });
    i.style.maxWidth = '100%';
    i.style.marginTop = '4px';
    d.appendChild(i);
    if (suffix) d.appendChild(el('div', 'l', suffix));
    return d;
  };
  grid.append(
    field('월 추정매출 (원)', st.monthlyRevenue, (v) => { state.data.settings.monthlyRevenue = v; commit(); render({ keepScroll: true }); }),
    field('목표 식재료 원가율 (%)', Math.round(st.targetFoodCostRate * 1000) / 10,
          (v) => { state.data.settings.targetFoodCostRate = v / 100; commit(); render({ keepScroll: true }); }, '이하 → ✅ 양호'),
    field('주의 식재료 원가율 (%)', Math.round(st.warnFoodCostRate * 1000) / 10,
          (v) => { state.data.settings.warnFoodCostRate = v / 100; commit(); render({ keepScroll: true }); }, '초과 → 🔴 과다'),
  );
  s3.body.appendChild(grid);
  root.appendChild(s3.card);

  /* 회사 이름 · 카테고리 */
  const s4 = card('기본 정보', '회사(매장) 이름과 메뉴 카테고리를 정합니다');
  const be = el('div', 'brandedit');
  be.appendChild(el('span', 'l', '회사 / 매장 이름'));
  const bi = el('input');
  bi.type = 'text';
  bi.value = state.data.meta.brand || '';
  bi.placeholder = '예: 우리 레스토랑';
  bi.onchange = () => { state.data.meta.brand = bi.value.trim() || '우리 매장'; commit(); paintBrand(); };
  be.appendChild(bi);
  s4.body.appendChild(be);

  const catWrap = el('div');
  catWrap.style.marginTop = '14px';
  catWrap.appendChild(el('div', 'l', '메뉴 카테고리 (메뉴를 추가할 때 고를 수 있습니다)'));
  const chips = el('div', 'chips');
  chips.style.marginTop = '8px';
  state.data.categoryOrder.forEach((cat, ix) => {
    const chip = el('span', 'chip');
    chip.style.cursor = 'default';
    chip.textContent = `${state.data.categoryIcon[cat] || ''} ${cat}`;
    const used = state.data.menus.some((m) => m.category === cat);
    if (!used) {
      const x = delButton(cat, () => { state.data.categoryOrder.splice(ix, 1); commit(); render({ keepScroll: true }); });
      x.style.marginLeft = '4px';
      chip.appendChild(x);
    }
    chips.appendChild(chip);
  });
  catWrap.appendChild(chips);
  const newCat = el('div', 'newform');
  newCat.style.padding = '12px 0 0';
  newCat.style.borderTop = '0';
  const ci = el('input'); ci.type = 'text'; ci.placeholder = '새 카테고리 이름';
  const cIcon = el('input'); cIcon.type = 'text'; cIcon.placeholder = '아이콘'; cIcon.style.width = '80px'; cIcon.value = '🍽';
  const cb2 = el('button', 'btn', '카테고리 추가');
  cb2.onclick = () => {
    const v = ci.value.trim();
    if (!v) return;
    if (state.data.categoryOrder.includes(v)) { toast('이미 있는 카테고리입니다'); return; }
    state.data.categoryOrder.push(v);
    state.data.categoryIcon[v] = cIcon.value.trim() || '🍽';
    commit(); render({ keepScroll: true });
  };
  newCat.append(ci, cIcon, cb2);
  catWrap.appendChild(newCat);
  s4.body.appendChild(catWrap);
  root.appendChild(s4.card);
}

/* ═══════════════ 점검 ═══════════════ */
function viewIssue(root) {
  const issues = (state.data.issues || []);
  if (!issues.length) { root.appendChild(el('div', 'empty', '확인이 필요한 항목이 없습니다.')); return; }
  const groups = {};
  issues.forEach((i) => (groups[i.type] = groups[i.type] || []).push(i));
  Object.entries(groups).forEach(([type, list]) => {
    const c = card(`${type} · ${list.length}건`, null, true);
    const t = table([{ label: '대상' }, { label: '항목' }, { label: '설명 / 조치' }]);
    list.forEach((i) => {
      const tr = el('tr');
      tr.appendChild(el('td', 'name', i.menu || '-'));
      tr.appendChild(el('td', null, i.name || '-'));
      const d = el('td', 'dim', i.note || HINT[type] || '');
      d.style.whiteSpace = 'normal';
      tr.appendChild(d);
      if (i.menu && state.result.menus.some((m) => m.name === i.menu)) {
        tr.classList.add('clickable');
        tr.onclick = () => openMenu(i.menu);
      }
      t.tbody.appendChild(tr);
    });
    c.body.appendChild(t.wrap);
    root.appendChild(c.card);
  });
}
const HINT = {
  '판매가 없음': '[메뉴] 화면에서 판매가를 입력하세요.',
  '식재료 단가 미입력': '[식재료] 화면에서 구매가격을 입력하세요.',
  '식재료 규격 미입력': '[식재료] 화면에서 총중량(g)을 입력하세요. 개당 판매 품목이면 그대로 두어도 됩니다.',
};

/* ═══════════════ 액션 ═══════════════ */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2200);
}
async function downloadExcel() {
  toast('엑셀을 만드는 중…');
  try {
    const blob = state.serverOk ? await excelFromServer() : await excelInBrowser();
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = `에베레스트_원가분석서_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('내려받기 완료');
  } catch (err) {
    console.error(err);
    toast('엑셀 생성에 실패했습니다');
  }
}
/* 서버 모드 — 서버가 만들어 준다 */
async function excelFromServer() {
  const res = await fetch('/api/export.xlsx', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: state.data }),
  });
  if (!res.ok) throw new Error('export ' + res.status);
  return res.blob();
}
/* 정적 모드 — 브라우저에서 직접 만든다 (필요할 때만 라이브러리를 내려받음) */
async function excelInBrowser() {
  await loadScript('/vendor/exceljs.min.js', () => self.ExcelJS);
  await loadScript('/build-xlsx.js', () => self.XlsxBuilder);
  const wb = self.XlsxBuilder.build(state.data);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function loadScript(src, ready) {
  if (ready()) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => (ready() ? res() : rej(new Error('load ' + src)));
    s.onerror = () => rej(new Error('load ' + src));
    document.head.appendChild(s);
  });
}
/* 지금 화면의 값까지 통째로 담은 HTML 파일을 만든다.
   이 파일 하나만 다른 PC로 옮기면 값 그대로 이어서 쓸 수 있다. */
async function savePortable() {
  toast('파일을 만드는 중…');
  try {
    const stamp = { savedAt: new Date().toISOString(), data: state.data };
    let html;

    if (self.EMBEDDED_DATASET) {
      // 단일 파일 모드 — 지금 문서를 복제해서 값만 갈아 끼운다
      const doc = document.documentElement.cloneNode(true);
      const clear = (sel) => { const n = doc.querySelector(sel); if (n) n.innerHTML = ''; };
      ['#viewRoot', '#navDesktop', '#navMobile', '#sheetBody'].forEach(clear);   // 그려진 화면은 뺀다
      const setHidden = (sel, v) => { const n = doc.querySelector(sel); if (n) v ? n.setAttribute('hidden', '') : n.removeAttribute('hidden'); };
      setHidden('#boot', false); setHidden('#app', true);
      setHidden('#sheet', true); setHidden('#sheetBackdrop', true);
      setHidden('#morePop', true); setHidden('#toast', true); setHidden('#saveWarn', true);
      const tag = doc.querySelector('#ovData');
      if (tag) tag.textContent = JSON.stringify(stamp);
      html = '<!doctype html>\n' + doc.outerHTML;
    } else {
      // 서버 / 정적 모드 — 기본 단일 파일을 받아 값만 끼워 넣는다
      const res = await fetch('downloads/에베레스트_원가분석_단일파일.html');
      if (!res.ok) throw new Error(res.status);
      const base = await res.text();
      html = base.replace(/(<script id="ovData"[^>]*>)[\s\S]*?(<\/script>)/,
                          (_m, a, b) => a + JSON.stringify(stamp) + b);
    }

    const a = el('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    a.download = `에베레스트_원가분석_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('저장했습니다 — 이 파일만 옮기면 값도 함께 갑니다');
  } catch (err) {
    console.error(err);
    toast('파일 생성에 실패했습니다');
  }
}

function backup() {
  const blob = new Blob([JSON.stringify({ savedAt: new Date().toISOString(), data: state.data }, null, 2)],
                        { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = `원가데이터_백업_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  toast('백업 파일을 저장했습니다');
}
function restore() { $('#fileRestore').click(); }
function resetAll() {
  if (!confirm('추가·수정한 내용을 모두 지우고 처음 상태로 되돌립니다. 계속할까요?')) return;
  state.data = clone(state.base);
  commit(); render();
  toast('원본으로 되돌렸습니다');
}

/* ═══════════════ 초기화 ═══════════════ */
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  store.set('everest-theme', t || '');
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(dark ? 'light' : 'dark');
}

async function boot() {
  applyTheme(store.get('everest-theme') || '');

  let payload = null;
  // ① 단일 HTML 파일 모드 — 데이터가 파일 안에 들어 있으면 그대로 사용 (인터넷·서버 불필요)
  if (self.EMBEDDED_DATASET) {
    state.serverOk = false;
    payload = { dataset: self.EMBEDDED_DATASET, overrides: null };
  }
  try {
    if (payload) throw new Error('embedded');
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error(res.status);
    payload = await res.json();
  } catch (_) {
    // ② 정적 배포(Render Static Site 등) — 서버 없이 dataset.json 만으로 동작
    if (!payload) {
      state.serverOk = false;
      try { payload = { dataset: await (await fetch('dataset.json')).json(), overrides: null }; }
      catch (e) {
        $('#boot').innerHTML = '<p>데이터를 불러오지 못했습니다. 새로고침해 주세요.</p>';
        return;
      }
    }
  }
  state.base = payload.dataset;
  state.base.categoryOrder = state.base.categoryOrder || [];
  state.base.categoryIcon = state.base.categoryIcon || {};

  state.data = pickData(state.base, parseSaved(payload.saved));
  state.sync = state.serverOk ? 'synced' : 'local';

  // 브라우저가 저장을 받아주는지 미리 확인 → 못 쓰면 바로 알림
  if (!state.serverOk && !saveLocal()) warnIfCannotSave(false);

  recalc();
  buildNav();
  state.view = (location.hash || '').replace('#', '') || 'dash';
  if (!VIEWS.some((v) => v.id === state.view)) state.view = 'dash';
  render();

  $('#boot').hidden = true;
  $('#app').hidden = false;
  if (state.loadedFromFile) setTimeout(() => toast('파일에 담겨 온 수정값을 불러왔습니다'), 400);

  const warnBox = $('#saveWarnClose');
  if (warnBox) warnBox.onclick = () => { $('#saveWarn').hidden = true; };

  $('#btnTheme').onclick = toggleTheme;
  $('#btnExcel').onclick = downloadExcel;
  $('#btnPortable').onclick = savePortable;
  $('#btnBackup').onclick = backup;
  $('#btnRestore').onclick = restore;
  $('#btnReset').onclick = resetAll;
  $('#sheetClose').onclick = closeSheet;
  $('#sheetBackdrop').onclick = closeSheet;
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSheet(); $('#morePop').hidden = true; } });

  $('#fileRestore').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const saved = parseSaved(await f.text());
      if (!saved) throw new Error('형식이 맞지 않습니다');
      state.data = toData(saved, state.base);
      commit(); render();
      toast('백업을 복원했습니다');
    } catch (_) { toast('백업 파일을 읽지 못했습니다'); }
    e.target.value = '';
  };

  const pop = $('#morePop');
  $('#btnMenu').onclick = (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; };
  document.addEventListener('click', () => { pop.hidden = true; });
  pop.addEventListener('click', (e) => e.stopPropagation());
  pop.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      pop.hidden = true;
      ({ excel: downloadExcel, portable: savePortable, backup, restore, reset: resetAll }[b.dataset.act] || (() => {}))();
    };
  });

  addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '');
    if (id && id !== state.view && VIEWS.some((v) => v.id === id)) { state.view = id; render({ keepScroll: true }); }
  });
  addEventListener('beforeunload', () => { if (state.sync === 'dirty') save(); });
}

boot();
})();

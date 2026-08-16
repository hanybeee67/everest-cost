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
  base: null,          // 서버가 준 원본 dataset
  ov:   emptyOv(),     // 사용자 수정값
  view: 'dash',
  result: null,
  filter: { q: '', cat: 'all', grade: 'all', sort: 'cat', ingQ: '' },
  sync: 'synced',
  savedAt: null,
  serverOk: true,
};
function emptyOv() {
  return { ingredients: {}, preps: {}, menus: {}, fixedCosts: {}, settings: {} };
}

/* ── 원본 + 수정값 병합 ─────────────────────────────── */
function merged() {
  const b = state.base, o = state.ov;
  return {
    ...b,
    ingredients: b.ingredients.map((i) => ({ ...i, ...(o.ingredients[i.name] || {}) })),
    preps: b.preps.map((p) => {
      const po = o.preps[p.name] || {};
      return {
        ...p, ...(po.yield_g != null ? { yield_g: po.yield_g } : {}),
        items: p.items.map((it, ix) => ({ ...it, ...((po.items || {})[ix] || {}) })),
      };
    }),
    menus: b.menus.map((m) => {
      const mo = o.menus[m.name] || {};
      return {
        ...m, ...(mo.price != null ? { price: mo.price } : {}),
        lines: m.lines.map((l, ix) => ({ ...l, ...((mo.lines || {})[ix] || {}) })),
      };
    }),
    fixedCosts: b.fixedCosts.map((f) => ({ ...f, ...(o.fixedCosts[f.name] || {}) })),
    settings: { ...b.settings, ...o.settings },
  };
}
function recalc() { state.result = Calc.compute(merged()); }

/* ── 수정값 반영 ────────────────────────────────────── */
function setOv(path, value) {
  let node = state.ov;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (node[k] == null || typeof node[k] !== 'object') node[k] = {};
    node = node[k];
  }
  node[path[path.length - 1]] = value;
  recalc();
  markDirty();
  scheduleSave();
}
function isOverridden(path) {
  let n = state.ov;
  for (const k of path) { if (n == null || typeof n !== 'object') return false; n = n[k]; }
  return n !== undefined;
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
function saveLocal() { return store.set(LS_KEY, JSON.stringify(state.ov)); }

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
    const res = await fetch('/api/overrides', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state.ov),
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
    if (v.id === 'issue') { const n = el('span', 'badge', String(state.base.issues.length)); b.appendChild(n); }
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
  const cats = ['all', ...state.base.categoryOrder.filter((c) => r.menus.some((m) => m.category === c))];
  cats.forEach((c) => {
    const b = el('button', 'chip', c === 'all' ? '전체' : `${state.base.categoryIcon[c] || ''} ${c}`);
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
      { label: '마진', num: true }, { label: '마진율', num: true }, { label: '판정' },
    ]);
    rows.forEach((m) => {
      const tr = el('tr', 'clickable');
      const nameTd = el('td', 'name');
      nameTd.innerHTML = `${m.name}<div class="cat-chip">${m.icon} ${m.category}</div>`;
      tr.appendChild(nameTd);

      const priceTd = el('td', 'num');
      priceTd.appendChild(numInput(m.price, (v) => { setOv(['menus', m.name, 'price'], v); render({ keepScroll: true }); },
        { changed: isOverridden(['menus', m.name, 'price']) }));
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
      tr.onclick = () => openMenu(m.name);
      t.tbody.appendChild(tr);
    });
    t.wrap.classList.add('desktop-only');
    c.body.appendChild(t.wrap);
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
    host.appendChild(cards);
  }
  paint();
}

/* ═══════════════ 메뉴 상세 시트 ═══════════════ */
function openMenu(name) {
  const m = state.result.menus.find((x) => x.name === name);
  if (!m) return;
  $('#sheetTitle').textContent = m.name;
  $('#sheetSub').textContent = [`${m.icon} ${m.category}`, m.en, m.serving, m.time].filter(Boolean).join(' · ');
  const body = $('#sheetBody');
  body.innerHTML = '';

  if (!m.hasPrice) {
    const n = el('div', 'notebox');
    n.innerHTML = '<b>판매가가 없습니다.</b> 아래 판매가를 입력하면 원가율·마진이 계산됩니다.';
    body.appendChild(n);
  }

  /* 요약 */
  const bd = el('div', 'breakdown');
  const cell = (l, v, color) => {
    const d = el('div');
    d.appendChild(el('div', 'l', l));
    const vv = el('div', 'v', v);
    if (color) vv.style.color = color;
    d.appendChild(vv);
    return d;
  };
  const priceBox = el('div');
  priceBox.appendChild(el('div', 'l', '판매가 (수정 가능)'));
  const pin = numInput(m.price, (v) => { setOv(['menus', m.name, 'price'], v); openMenu(name); render({ keepScroll: true }); },
    { changed: isOverridden(['menus', m.name, 'price']) });
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

  /* 재료 */
  body.appendChild(el('div', 'sec-title', '재료 · 원가 구성'));
  const lines = el('div', 'lines');
  const head = el('div', 'line line-head');
  head.innerHTML = `<div class="c-name">재료 / 구성</div><div class="c-qty">사용량</div>
                    <div class="c-yield">수율%</div><div class="c-unit">g당 단가</div><div class="c-cost">재료비</div>`;
  lines.appendChild(head);

  m.lines.forEach((l, ix) => {
    const row = el('div', 'line');
    const nm = el('div', 'c-name');
    const kindPill = l.kind === '프렙' ? '<span class="pill prep">프렙</span> '
                   : l.kind === '메뉴' ? '<span class="pill menu">메뉴</span> '
                   : l.kind === '무료' ? '<span class="pill">무료</span> ' : '';
    nm.innerHTML = `<b>${kindPill}${l.name}</b>` +
      (l.raw && l.raw !== l.name ? `<span class="sub">레시피북: ${l.raw}</span>` : '') +
      (l.note ? `<span class="sub">${l.note}</span>` : '');
    row.appendChild(nm);

    const q = el('div', 'c-qty');
    q.appendChild(el('span', 'flab', l.kind === '메뉴' ? '수량' : '사용량'));
    q.appendChild(numInput(l.qty, (v) => { setOv(['menus', m.name, 'lines', ix, 'qty'], v); openMenu(name); render({ keepScroll: true }); },
      { changed: isOverridden(['menus', m.name, 'lines', ix, 'qty']), step: 'any' }));
    row.appendChild(q);

    const y = el('div', 'c-yield');
    y.appendChild(el('span', 'flab', '수율%'));
    if (l.kind === '식재료' || l.kind === '프렙') {
      y.appendChild(numInput(Math.round(l.yield * 100),
        (v) => { setOv(['menus', m.name, 'lines', ix, 'yield'], Math.max(0.01, v / 100)); openMenu(name); render({ keepScroll: true }); },
        { changed: isOverridden(['menus', m.name, 'lines', ix, 'yield']) }));
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

    lines.appendChild(row);
  });
  const foot = el('div', 'line line-foot');
  foot.innerHTML = `<div class="c-name"><b>합 계</b></div><div class="c-qty"></div><div class="c-yield"></div>
                    <div class="c-unit"></div><div class="c-cost"><span class="val strong total">${won1(m.foodCost)}</span></div>`;
  lines.appendChild(foot);
  body.appendChild(lines);

  /* 조리법 */
  if (m.steps && m.steps.length) {
    body.appendChild(el('div', 'sec-title', '조리 방법'));
    const ol = el('ol', 'steps');
    m.steps.forEach((s) => ol.appendChild(el('li', null, s)));
    body.appendChild(ol);
  }
  if (m.garnish) {
    body.appendChild(el('div', 'sec-title', '가니쉬'));
    body.appendChild(el('div', 'garnish', m.garnish));
  }

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
      { label: '총중량(g)', num: true }, { label: 'g당 단가', num: true }, { label: '상태' },
    ]);
    rows.forEach((it) => {
      const tr = el('tr');
      tr.appendChild(el('td', 'name', it.name));
      const p = el('td', 'num');
      p.appendChild(numInput(it.price, (v) => { setOv(['ingredients', it.name, 'price'], v); render({ keepScroll: true }); },
        { changed: isOverridden(['ingredients', it.name, 'price']) }));
      tr.appendChild(p);
      tr.appendChild(el('td', 'num dim', `${it.pack_qty || 0} ${it.unit || ''}`));
      const w = el('td', 'num');
      w.appendChild(numInput(it.weight_g, (v) => { setOv(['ingredients', it.name, 'weight_g'], v); render({ keepScroll: true }); },
        { changed: isOverridden(['ingredients', it.name, 'weight_g']), step: 'any' }));
      tr.appendChild(w);
      const u = el('td', 'num', won3(it.unitCost));
      u.style.cssText = 'font-weight:750;color:var(--accent-ink)';
      tr.appendChild(u);
      const s = el('td');
      s.innerHTML = it.valid ? '<span class="badge-grade g-good">✓ 정상</span>'
                             : '<span class="badge-grade g-warn">⚠ 값 확인</span>';
      tr.appendChild(s);
      t.tbody.appendChild(tr);
    });
    c.body.appendChild(t.wrap);
    host.appendChild(c.card);
  }
  paint();
}

/* ═══════════════ 프렙 ═══════════════ */
function viewPrep(root) {
  const r = state.result;
  r.preps.forEach((p) => {
    const c = card(p.name, `완성중량 ${won(p.yield_g)}g · 투입 ${won(p.inputG)}g · 총 재료비 ${won(p.totalCost)}원 · g당 ${won3(p.unitCost)}원`, true);

    const head = el('div', 'card-body');
    head.style.paddingBottom = '0';
    const wrapY = el('label', 'switch');
    wrapY.appendChild(el('span', null, '완성중량(g)'));
    wrapY.appendChild(numInput(p.yield_g, (v) => { setOv(['preps', p.name, 'yield_g'], v); render({ keepScroll: true }); },
      { changed: isOverridden(['preps', p.name, 'yield_g']), step: 'any' }));
    head.appendChild(wrapY);
    c.card.insertBefore(head, c.body);

    const t = table([
      { label: '재료' }, { label: '투입량(g)', num: true }, { label: 'g당 단가', num: true }, { label: '재료비', num: true },
    ]);
    p.items.forEach((it, ix) => {
      const tr = el('tr');
      const nm = el('td', 'name');
      nm.innerHTML = (it.kind === '프렙' ? '<span class="pill prep">프렙</span> ' : '') + it.name;
      tr.appendChild(nm);
      const q = el('td', 'num');
      q.appendChild(numInput(it.qty, (v) => { setOv(['preps', p.name, 'items', ix, 'qty'], v); render({ keepScroll: true }); },
        { changed: isOverridden(['preps', p.name, 'items', ix, 'qty']), step: 'any' }));
      tr.appendChild(q);
      tr.appendChild(el('td', 'num', won3(it.unitCost)));
      const cs = el('td', 'num', won1(it.cost));
      cs.style.fontWeight = '700';
      tr.appendChild(cs);
      t.tbody.appendChild(tr);
    });
    const sum = el('tr');
    sum.innerHTML = `<td class="name">합 계</td><td class="num dim">${won(p.inputG)}</td><td></td>
                     <td class="num" style="font-weight:800;color:var(--accent-ink)">${won(p.totalCost)}</td>`;
    t.tbody.appendChild(sum);
    c.body.appendChild(t.wrap);
    root.appendChild(c.card);
  });
}

/* ═══════════════ 고정비 ═══════════════ */
function viewFix(root) {
  const r = state.result, s = r.summary, st = r.settings;

  const kpis = el('div', 'kpis');
  const K = (l, v, sub) => { const k = el('div', 'kpi'); k.append(el('div', 'lab', l), el('div', 'val', v), el('div', 'sub', sub)); return k; };
  kpis.append(
    K('고정비 총계', won(s.fixedTotal) + '원', '입력한 모든 항목'),
    K('배분 대상', won(s.fixedAllocatable) + '원', '「배분 포함」 항목만'),
    K('월 추정매출', won(s.monthlyRevenue) + '원', '배달 포함'),
    K('고정비 배분율', pct(s.fixedRate), '판매가 × 이 비율 = 배분액'),
  );
  root.appendChild(kpis);

  const c = card('월 고정비 내역', '금액을 고치거나 배분 대상에서 빼고 넣을 수 있습니다', true);
  const t = table([{ label: '항목' }, { label: '월간 금액(원)', num: true }, { label: '배분 포함' }, { label: '비고' }]);
  r.fixedCosts.forEach((f) => {
    const tr = el('tr');
    tr.appendChild(el('td', 'name', f.name));
    const a = el('td', 'num');
    a.appendChild(numInput(f.amount, (v) => { setOv(['fixedCosts', f.name, 'amount'], v); render({ keepScroll: true }); },
      { changed: isOverridden(['fixedCosts', f.name, 'amount']) }));
    tr.appendChild(a);
    const sw = el('td');
    const lab = el('label', 'switch');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = f.include !== false;
    cb.onchange = () => { setOv(['fixedCosts', f.name, 'include'], cb.checked); render({ keepScroll: true }); };
    lab.append(cb, el('span', null, cb.checked ? '포함' : '제외'));
    sw.appendChild(lab);
    tr.appendChild(sw);
    const note = el('td', 'dim', f.reason || f.note || '');
    if (f.reason) note.style.color = 'var(--warn)';
    tr.appendChild(note);
    t.tbody.appendChild(tr);
  });
  c.body.appendChild(t.wrap);
  root.appendChild(c.card);

  const s2 = card('배분 · 판정 기준', '이 값에 따라 고정비 배분과 원가율 판정이 달라집니다');
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
    field('월 추정매출 (원)', st.monthlyRevenue, (v) => { setOv(['settings', 'monthlyRevenue'], v); render({ keepScroll: true }); }),
    field('목표 식재료 원가율 (%)', Math.round(st.targetFoodCostRate * 1000) / 10,
          (v) => { setOv(['settings', 'targetFoodCostRate'], v / 100); render({ keepScroll: true }); }, '이하 → ✅ 양호'),
    field('주의 식재료 원가율 (%)', Math.round(st.warnFoodCostRate * 1000) / 10,
          (v) => { setOv(['settings', 'warnFoodCostRate'], v / 100); render({ keepScroll: true }); }, '초과 → 🔴 과다'),
  );
  s2.body.appendChild(grid);
  root.appendChild(s2.card);
}

/* ═══════════════ 점검 ═══════════════ */
function viewIssue(root) {
  const issues = state.base.issues || [];
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
    body: JSON.stringify(state.ov),
  });
  if (!res.ok) throw new Error('export ' + res.status);
  return res.blob();
}
/* 정적 모드 — 브라우저에서 직접 만든다 (필요할 때만 라이브러리를 내려받음) */
async function excelInBrowser() {
  await loadScript('/vendor/exceljs.min.js', () => self.ExcelJS);
  await loadScript('/build-xlsx.js', () => self.XlsxBuilder);
  const wb = self.XlsxBuilder.build(merged());
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
function backup() {
  const blob = new Blob([JSON.stringify(state.ov, null, 2)], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = `원가_수정값_백업_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  toast('백업 파일을 저장했습니다');
}
function restore() { $('#fileRestore').click(); }
function resetAll() {
  if (!confirm('수정한 값을 모두 지우고 원본으로 되돌립니다. 계속할까요?')) return;
  state.ov = emptyOv();
  recalc(); markDirty(); scheduleSave(); render();
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

  const local = (() => { try { return JSON.parse(store.get(LS_KEY) || 'null'); } catch (_) { return null; } })();
  state.ov = { ...emptyOv(), ...(payload.overrides || local || {}) };
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

  // 단일 HTML 파일로 저장하는 링크 — 단일 파일 안에서는 의미가 없으니 감춘다
  if (!self.EMBEDDED_DATASET) {
    ['#linkSingle', '#popSingle'].forEach((sel) => { const n = $(sel); if (n) n.hidden = false; });
  }

  const warnBox = $('#saveWarnClose');
  if (warnBox) warnBox.onclick = () => { $('#saveWarn').hidden = true; };

  $('#btnTheme').onclick = toggleTheme;
  $('#btnExcel').onclick = downloadExcel;
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
      const j = JSON.parse(await f.text());
      state.ov = { ...emptyOv(), ...j };
      recalc(); markDirty(); scheduleSave(); render();
      toast('백업을 복원했습니다');
    } catch (_) { toast('백업 파일을 읽지 못했습니다'); }
    e.target.value = '';
  };

  const pop = $('#morePop');
  $('#btnMenu').onclick = (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; };
  document.addEventListener('click', () => { pop.hidden = true; });
  pop.addEventListener('click', (e) => e.stopPropagation());
  const popLink = $('#popSingle');
  if (popLink) popLink.onclick = () => { pop.hidden = true; };
  pop.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      pop.hidden = true;
      ({ excel: downloadExcel, backup, restore, reset: resetAll }[b.dataset.act] || (() => {}))();
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

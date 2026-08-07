/* =====================================================================
 *  원가 분석서 엑셀 생성기  (PC 버전)
 *  - 모든 수치는 "살아있는 수식" 으로 작성 → 단가/판매가만 고치면 전체 자동 재계산
 *  - 0 나눗셈·조회실패는 전부 IF/IFERROR 로 방어 → #DIV/0!, #N/A 발생 없음
 * =====================================================================*/
/* Node 에서는 exceljs 모듈을, 브라우저에서는 <script> 로 올린 전역 ExcelJS 를 쓴다.
   덕분에 이 파일 하나로 서버 생성 / 정적(서버 없는) 브라우저 생성이 모두 된다. */
const ExcelJS = (typeof module === 'object' && module.exports)
  ? require('exceljs')
  : self.ExcelJS;

/* ── 디자인 토큰 ─────────────────────────────────────────── */
const C = {
  ink:      'FF0F172A',   // 헤더 배경(짙은 남색)
  inkSoft:  'FF1E293B',
  accent:   'FF0D9488',   // 청록 포인트
  accent2:  'FF0F766E',
  band:     'FFF1F5F9',   // 얼룩 행
  panel:    'FFF8FAFC',   // 계산 셀
  input:    'FFFFFBEB',   // 입력 셀(연노랑)
  inputEdge:'FFF59E0B',
  line:     'FFE2E8F0',
  white:    'FFFFFFFF',
  good:     'FF047857', goodBg: 'FFECFDF5',
  warn:     'FFB45309', warnBg: 'FFFFFBEB',
  bad:      'FFB91C1C', badBg:  'FFFEF2F2',
  muted:    'FF64748B',
};
const FONT = '맑은 고딕';
const NUM  = { won: '#,##0', won1: '#,##0.0', won3: '#,##0.000', pct: '0.0%', int: '#,##0' };

const thin = { style: 'thin', color: { argb: C.line } };
const box  = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

/* ── 공통 헬퍼 ───────────────────────────────────────────── */
function sheetTitle(ws, title, subtitle, lastCol) {
  ws.mergeCells(1, 1, 1, lastCol);
  ws.mergeCells(2, 1, 2, lastCol);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: FONT, size: 16, bold: true, color: { argb: C.white } };
  t.fill = fill(C.ink);
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 34;

  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: FONT, size: 9.5, color: { argb: C.muted } };
  s.fill = fill(C.panel);
  s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 22;
  for (let c = 1; c <= lastCol; c++) { ws.getCell(1, c).fill = fill(C.ink); ws.getCell(2, c).fill = fill(C.panel); }
}

function headerRow(ws, rowNo, labels, opts = {}) {
  const r = ws.getRow(rowNo);
  labels.forEach((l, i) => {
    const cell = r.getCell(i + 1);
    cell.value = l;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
    cell.fill = fill(opts.bg || C.accent2);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = box;
  });
  r.height = opts.height || 26;
  return r;
}

function sectionBar(ws, rowNo, text, lastCol, color = C.accent) {
  ws.mergeCells(rowNo, 1, rowNo, lastCol);
  const c = ws.getCell(rowNo, 1);
  c.value = text;
  c.font = { name: FONT, size: 11, bold: true, color: { argb: C.white } };
  c.fill = fill(color);
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(rowNo).height = 24;
  for (let i = 1; i <= lastCol; i++) ws.getCell(rowNo, i).fill = fill(color);
}

function noteBar(ws, rowNo, text, lastCol) {
  ws.mergeCells(rowNo, 1, rowNo, lastCol);
  const c = ws.getCell(rowNo, 1);
  c.value = text;
  c.font = { name: FONT, size: 9.5, color: { argb: C.inkSoft } };
  c.fill = fill(C.input);
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  c.border = { top: thin, left: thin, bottom: thin, right: thin };
  ws.getRow(rowNo).height = 22;
}

const asInput = (cell) => {
  cell.fill = fill(C.input);
  cell.border = { top: thin, left: thin, bottom: thin, right: { style: 'thin', color: { argb: C.inputEdge } } };
  cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FF92400E' } };
};
const asCalc = (cell) => {
  cell.fill = fill(C.panel);
  cell.border = box;
  cell.font = { name: FONT, size: 10, color: { argb: C.inkSoft } };
};
const asText = (cell) => {
  cell.border = box;
  cell.font = { name: FONT, size: 10, color: { argb: C.inkSoft } };
};

/* =====================================================================
 *  메인
 * =====================================================================*/
/* ---------------------------------------------------------------------
 * 참조 깊이(level) 계산
 *   프렙 안의 프렙, 세트메뉴 안의 단품처럼 "같은 시트끼리 서로 참조" 하는 구조는
 *   범위 단위로 보면 순환참조가 된다. 레벨별로 행 블록을 나눠 배치하고
 *   상위 레벨은 하위 레벨 범위만 참조하게 해서 순환을 원천 차단한다.
 * ------------------------------------------------------------------- */
function levelize(items, keyOf, depsOf) {
  const byKey = new Map(items.map((i) => [keyOf(i), i]));
  const lv = new Map(); const visiting = new Set();
  const walk = (k) => {
    if (lv.has(k)) return lv.get(k);
    const it = byKey.get(k);
    if (!it || visiting.has(k)) return 0;
    visiting.add(k);
    const l = depsOf(it).reduce((m, d) => Math.max(m, byKey.has(d) ? walk(d) + 1 : 0), 0);
    visiting.delete(k);
    lv.set(k, l);
    return l;
  };
  items.forEach((i) => walk(keyOf(i)));
  return lv;
}

function build(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Everest Restaurant Group';
  wb.created = new Date();
  wb.views = [{ x: 0, y: 0, width: 24000, height: 16000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];

  const S = {
    guide: '📘 사용안내',
    ing:   '① 식재료 단가',
    prep:  '② 프렙 원가',
    fixed: '③ 고정비 설정',
    menu:  '④ 메뉴 원가표',
    detail:'⑤ 레시피 상세',
    dash:  '⑥ 분석 대시보드',
    issue: '⚠ 확인 필요',
  };
  const q = (n) => `'${n}'`;

  /* 프렙: 레벨 오름차순으로 재배열 */
  const prepLv = levelize(data.preps, (p) => p.name,
                          (p) => p.items.filter((i) => i.kind === '프렙').map((i) => i.name));
  const preps = data.preps
    .map((p, i) => ({ p, i, lv: prepLv.get(p.name) || 0 }))
    .sort((a, b) => a.lv - b.lv || a.i - b.i).map((x) => x.p);
  const prepLevelOf = (n) => prepLv.get(n) || 0;
  const prepMaxLv = Math.max(0, ...preps.map((p) => prepLevelOf(p.name)));

  /* 메뉴: 레벨 오름차순 → 같은 레벨 안에서는 기존(카테고리) 순서 유지 */
  const menuLv = levelize(data.menus, (m) => m.name,
                          (m) => m.lines.filter((l) => l.kind === '메뉴').map((l) => l.name));
  const menus = data.menus
    .map((m, i) => ({ m, i, lv: menuLv.get(m.name) || 0 }))
    .sort((a, b) => a.lv - b.lv || a.i - b.i).map((x) => x.m);
  const menuLevelOf = (n) => menuLv.get(n) || 0;
  const menuMaxLv = Math.max(0, ...menus.map((m) => menuLevelOf(m.name)));

  // 최종 시트 순서대로 미리 생성 (나중에 재정렬하지 않는다)
  [S.guide, S.dash, S.menu, S.detail, S.ing, S.prep, S.fixed, S.issue].forEach((n) => wb.addWorksheet(n));
  const grab = (name, views) => { const ws = wb.getWorksheet(name); if (views) ws.views = views; return ws; };

  /* ═══════════════ ① 식재료 단가 ═══════════════ */
  const wsI = grab(S.ing, [{ state: 'frozen', ySplit: 5 }]);
  wsI.columns = [
    { width: 6 }, { width: 34 }, { width: 14 }, { width: 10 },
    { width: 8 }, { width: 12 }, { width: 13 }, { width: 30 },
  ];
  sheetTitle(wsI, '① 식재료 단가', '노란 셀(구매가격·규격)만 수정하세요. g당 단가와 전체 메뉴 원가가 자동으로 다시 계산됩니다.', 8);
  noteBar(wsI, 3, '💡  g당 단가 = 구매가격 ÷ 총중량(g).  총중량이 0이면 0원으로 처리되어 오류가 나지 않습니다(개당 판매 품목 등).', 8);
  headerRow(wsI, 5, ['No.', '식재료명', '구매가격(원)', '규격수량', '단위', '총중량(g)', 'g당 단가(원)', '비고']);

  const ING_FIRST = 6;
  data.ingredients.forEach((it, i) => {
    const r = ING_FIRST + i;
    const row = wsI.getRow(r);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = it.name;
    row.getCell(3).value = Number(it.price) || 0;
    row.getCell(4).value = Number(it.pack_qty) || 0;
    row.getCell(5).value = it.unit || 'kg';
    row.getCell(6).value = Number(it.weight_g) || 0;
    row.getCell(7).value = { formula: `IF(F${r}>0,C${r}/F${r},0)` };
    row.getCell(8).value = !Number(it.price) ? '⚠ 구매가격 입력 필요'
                        : !Number(it.weight_g) ? '⚠ 중량(g) 입력 필요 · 개당 품목'
                        : '';
    for (let c = 1; c <= 8; c++) asText(row.getCell(c));
    [3, 4, 6].forEach((c) => asInput(row.getCell(c)));
    asCalc(row.getCell(7));
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(3).numFmt = NUM.won;
    row.getCell(4).numFmt = '#,##0.###';
    row.getCell(6).numFmt = NUM.won;
    row.getCell(7).numFmt = NUM.won3;
    row.getCell(7).font = { name: FONT, size: 10, bold: true, color: { argb: C.accent2 } };
    row.getCell(8).font = { name: FONT, size: 9, color: { argb: C.bad } };
    if (i % 2 === 1) [1, 2, 5, 8].forEach((c) => { row.getCell(c).fill = fill(C.band); });
  });
  const ING_LAST = ING_FIRST + data.ingredients.length - 1;
  wsI.autoFilter = { from: { row: 5, column: 1 }, to: { row: ING_LAST, column: 8 } };

  /* ═══════════════ ② 프렙 원가 ═══════════════ */
  const wsP = grab(S.prep, [{ state: 'frozen', ySplit: 5 }]);
  wsP.columns = [
    { width: 6 }, { width: 24 }, { width: 13 }, { width: 10 },
    { width: 13 }, { width: 14 }, { width: 13 }, { width: 26 },
  ];
  sheetTitle(wsP, '② 프렙(반제품) 원가', '커리 그레이비·탄두리 소스처럼 미리 만들어 두는 반제품의 g당 원가입니다. 투입량과 완성중량만 고치면 됩니다.', 8);
  noteBar(wsP, 3, '💡  g당 원가 = 총 재료비 ÷ 완성중량(g).  아래 [투입 재료 상세]의 투입량을 바꾸면 총 재료비가 자동 반영됩니다.', 8);
  headerRow(wsP, 5, ['No.', '프렙 제품명', '완성중량(g)', '수율', '총 재료비(원)', 'g당 원가(원)', '투입중량(g)', '비고']);

  const PREP_FIRST = 6;
  const PREP_LAST = PREP_FIRST + preps.length - 1;
  const detailStart = PREP_LAST + 4;               // 상세 헤더 행
  const detailFirst = detailStart + 1;
  let dRow = detailFirst;
  const prepRanges = {};
  preps.forEach((p) => { prepRanges[p.name] = { from: dRow, to: dRow + p.items.length - 1 }; dRow += p.items.length; });
  const DET_LAST = dRow - 1;

  // 레벨별 행 블록 (요약 / 상세)
  const prepSumBlock = {}, prepDetBlock = {};
  for (let L = 0; L <= prepMaxLv; L++) {
    const rows = preps.map((p, i) => ({ p, r: PREP_FIRST + i })).filter((x) => prepLevelOf(x.p.name) === L);
    if (!rows.length) continue;
    prepSumBlock[L] = { from: rows[0].r, to: rows[rows.length - 1].r };
    const det = rows.map((x) => prepRanges[x.p.name]);
    prepDetBlock[L] = { from: det[0].from, to: det[det.length - 1].to };
  }
  // 레벨 L 프렙이 조회해도 되는 요약 범위 = 0 ~ L-1 레벨
  const prepLookupRange = (L) => (L <= 0 || !prepSumBlock[0]
    ? null
    : `${q(S.prep)}!$B$${prepSumBlock[0].from}:$F$${prepSumBlock[L - 1].to}`);

  preps.forEach((p, i) => {
    const r = PREP_FIRST + i;
    const blk = prepDetBlock[prepLevelOf(p.name)];
    const row = wsP.getRow(r);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = p.name;
    row.getCell(3).value = Number(p.yield_g) || 0;
    row.getCell(4).value = Number(p.yield_rate) || 1;
    row.getCell(5).value = { formula: `SUMIF($A$${blk.from}:$A$${blk.to},$B${r},$F$${blk.from}:$F$${blk.to})` };
    row.getCell(6).value = { formula: `IF(C${r}>0,E${r}/C${r},0)` };
    row.getCell(7).value = { formula: `SUMIF($A$${blk.from}:$A$${blk.to},$B${r},$D$${blk.from}:$D$${blk.to})` };
    row.getCell(8).value = '';
    for (let c = 1; c <= 8; c++) asText(row.getCell(c));
    [3, 4].forEach((c) => asInput(row.getCell(c)));
    [5, 6, 7].forEach((c) => asCalc(row.getCell(c)));
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).numFmt = NUM.won;
    row.getCell(4).numFmt = NUM.pct;
    row.getCell(5).numFmt = NUM.won;
    row.getCell(6).numFmt = NUM.won3;
    row.getCell(7).numFmt = NUM.won;
    row.getCell(6).font = { name: FONT, size: 10, bold: true, color: { argb: C.accent2 } };
  });

  sectionBar(wsP, PREP_LAST + 2, '▸  투입 재료 상세  ─  투입량(노란 셀)만 수정하세요', 8, C.inkSoft);
  headerRow(wsP, detailStart, ['프렙 제품명', '구분', '재료명', '투입량(g)', 'g당 단가(원)', '재료비(원)', '', '']);
  wsP.getCell(detailStart, 7).value = '';
  wsP.getCell(detailStart, 8).value = '';

  const ING_RANGE  = `${q(S.ing)}!$B$${ING_FIRST}:$G$${ING_LAST}`;      // 2열=이름 … 6열=g당단가
  const PREP_RANGE = `${q(S.prep)}!$B$${PREP_FIRST}:$F$${PREP_LAST}`;   // 1열=이름 … 5열=g당원가

  let alt = 0;
  preps.forEach((p) => {
    const lookup = prepLookupRange(prepLevelOf(p.name));
    p.items.forEach((it, ii) => {
      const r = prepRanges[p.name].from + ii;
      const row = wsP.getRow(r);
      row.getCell(1).value = p.name;
      row.getCell(2).value = it.kind;
      row.getCell(3).value = it.name;
      row.getCell(4).value = Number(it.qty) || 0;
      row.getCell(5).value = { formula: lookup
        ? `IF($B${r}="프렙",IFERROR(VLOOKUP($C${r},${lookup},5,FALSE),0),IFERROR(VLOOKUP($C${r},${ING_RANGE},6,FALSE),0))`
        : `IFERROR(VLOOKUP($C${r},${ING_RANGE},6,FALSE),0)` };
      row.getCell(6).value = { formula: `ROUND($D${r}*$E${r},2)` };
      for (let c = 1; c <= 6; c++) asText(row.getCell(c));
      asInput(row.getCell(4));
      [5, 6].forEach((c) => asCalc(row.getCell(c)));
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(4).numFmt = NUM.won;
      row.getCell(5).numFmt = NUM.won3;
      row.getCell(6).numFmt = NUM.won;
      if (alt % 2 === 1) [1, 2, 3].forEach((c) => { row.getCell(c).fill = fill(C.band); });
    });
    alt++;
  });
  wsP.autoFilter = { from: { row: detailStart, column: 1 }, to: { row: DET_LAST, column: 6 } };

  /* ═══════════════ ③ 고정비 설정 ═══════════════ */
  const wsF = grab(S.fixed);
  wsF.columns = [{ width: 6 }, { width: 26 }, { width: 16 }, { width: 14 }, { width: 62 }];
  sheetTitle(wsF, '③ 고정비 설정', '월 고정비와 월 추정매출을 입력하면, 메뉴별 고정비 배분액이 판매가에 비례해 자동 계산됩니다.', 5);
  noteBar(wsF, 3, '💡  메뉴 1개당 고정비 배분 = 판매가 × (배분대상 고정비 합계 ÷ 월 추정매출)', 5);
  headerRow(wsF, 5, ['No.', '비용 항목', '월간 금액(원)', '배분 포함', '내용 / 비고']);

  const FX_FIRST = 6;
  data.fixedCosts.forEach((f, i) => {
    const r = FX_FIRST + i;
    const row = wsF.getRow(r);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = f.name;
    row.getCell(3).value = Number(f.amount) || 0;
    row.getCell(4).value = f.include === false ? '제외' : '포함';
    row.getCell(5).value = f.reason || f.note || '';
    for (let c = 1; c <= 5; c++) asText(row.getCell(c));
    [3, 4].forEach((c) => asInput(row.getCell(c)));
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).numFmt = NUM.won;
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).font = { name: FONT, size: 9, color: { argb: f.reason ? C.bad : C.muted } };
    wsF.getCell(r, 4).dataValidation = {
      type: 'list', allowBlank: false, formulae: ['"포함,제외"'],
      showErrorMessage: true, errorTitle: '입력 오류', error: '포함 또는 제외 중에서 선택하세요.',
    };
    if (i % 2 === 1) [1, 2, 5].forEach((c) => { row.getCell(c).fill = fill(C.band); });
  });
  const FX_LAST = FX_FIRST + data.fixedCosts.length - 1;

  const rTot = FX_LAST + 1, rAlloc = FX_LAST + 2;
  [[rTot, '고정비 총계', `SUM(C${FX_FIRST}:C${FX_LAST})`, '입력한 모든 항목의 합계'],
   [rAlloc, '배분 대상 합계', `SUMIF(D${FX_FIRST}:D${FX_LAST},"포함",C${FX_FIRST}:C${FX_LAST})`, '「배분 포함」인 항목만 합산 → 메뉴 원가에 반영']]
    .forEach(([r, label, f, memo]) => {
      const row = wsF.getRow(r);
      wsF.mergeCells(r, 1, r, 2);
      row.getCell(1).value = label;
      row.getCell(3).value = { formula: f };
      row.getCell(5).value = memo;
      for (let c = 1; c <= 5; c++) {
        const cell = row.getCell(c);
        cell.border = box; cell.fill = fill(C.goodBg);
        cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.accent2 } };
      }
      row.getCell(3).numFmt = NUM.won;
      row.getCell(1).alignment = { horizontal: 'right', indent: 1 };
      row.getCell(5).font = { name: FONT, size: 9, color: { argb: C.muted } };
    });

  const SET_ROW = rAlloc + 2;
  sectionBar(wsF, SET_ROW, '▸  배분·판정 기준 설정', 5, C.inkSoft);
  const settings = [
    ['월 추정매출(원)', Number(data.settings.monthlyRevenue) || 0, NUM.won, '배달 포함 월 총매출 추정치', true],
    ['고정비 배분율',  { formula: `IF(C${SET_ROW + 1}>0,C${rAlloc}/C${SET_ROW + 1},0)` }, NUM.pct, '= 배분 대상 합계 ÷ 월 추정매출 (매출 1원당 고정비)', false],
    ['목표 식재료 원가율', Number(data.settings.targetFoodCostRate) || 0.3, NUM.pct, '이하이면 ✅ 양호', true],
    ['주의 식재료 원가율', Number(data.settings.warnFoodCostRate) || 0.38, NUM.pct, '초과하면 🔴 과다', true],
  ];
  settings.forEach(([label, val, fmt, memo, input], i) => {
    const r = SET_ROW + 1 + i;
    const row = wsF.getRow(r);
    wsF.mergeCells(r, 1, r, 2);
    row.getCell(1).value = label;
    row.getCell(3).value = val;
    row.getCell(5).value = memo;
    for (let c = 1; c <= 5; c++) asText(row.getCell(c));
    row.getCell(1).font = { name: FONT, size: 10, bold: true, color: { argb: C.inkSoft } };
    row.getCell(1).alignment = { horizontal: 'right', indent: 1 };
    if (input) asInput(row.getCell(3)); else asCalc(row.getCell(3));
    row.getCell(3).numFmt = fmt;
    row.getCell(5).font = { name: FONT, size: 9, color: { argb: C.muted } };
  });
  const REV_CELL    = `${q(S.fixed)}!$C$${SET_ROW + 1}`;
  const RATE_CELL   = `${q(S.fixed)}!$C$${SET_ROW + 2}`;
  const TARGET_CELL = `${q(S.fixed)}!$C$${SET_ROW + 3}`;
  const WARN_CELL   = `${q(S.fixed)}!$C$${SET_ROW + 4}`;

  /* ═══════════════ ⑤ 레시피 상세 (④가 참조하므로 먼저 좌표 계산) ═══════════════ */
  const wsD = grab(S.detail, [{ state: 'frozen', ySplit: 5, xSplit: 2 }]);
  wsD.columns = [
    { width: 14 }, { width: 22 }, { width: 6 }, { width: 9 }, { width: 30 },
    { width: 24 }, { width: 11 }, { width: 12 }, { width: 9 }, { width: 13 },
    { width: 13 }, { width: 28 },
  ];
  sheetTitle(wsD, '⑤ 레시피 상세 원가', '레시피북과 동일한 재료·사용량. 한 줄 = 재료 1개. 사용량·수율만 고치면 메뉴 원가가 자동 갱신됩니다.', 12);
  noteBar(wsD, 3, '💡  재료비 = 사용량 ÷ 수율 × g당 단가.   구분이 「메뉴」인 줄(세트메뉴 구성품)은 = 수량 × 해당 단품의 식재료 원가.   「무료」는 수돗물 등 원가 0.', 12);
  headerRow(wsD, 5, ['카테고리', '메뉴명', '순번', '구분', '재료 / 구성', '레시피북 표기', '사용량', '단위', '수율', 'g당 단가(원)', '재료비(원)', '비고']);

  const DTL_FIRST = 6;
  let dr = DTL_FIRST;
  const menuDetailRange = {};
  menus.forEach((m) => {
    menuDetailRange[m.name] = { from: dr, to: dr + Math.max(m.lines.length, 1) - 1 };
    dr += Math.max(m.lines.length, 1);
  });
  const DTL_LAST = dr - 1;

  const MENU_FIRST = 6;
  const menuSumBlock = {}, menuDetBlock = {};
  for (let L = 0; L <= menuMaxLv; L++) {
    const rows = menus.map((m, i) => ({ m, r: MENU_FIRST + i })).filter((x) => menuLevelOf(x.m.name) === L);
    if (!rows.length) continue;
    menuSumBlock[L] = { from: rows[0].r, to: rows[rows.length - 1].r };
    const det = rows.map((x) => menuDetailRange[x.m.name]);
    menuDetBlock[L] = { from: det[0].from, to: det[det.length - 1].to };
  }
  // 레벨 L 메뉴가 조회해도 되는 ④ 범위 = 0 ~ L-1 레벨 (세트메뉴 → 단품만 조회)
  const menuLookupRange = (L) => (L <= 0 || !menuSumBlock[0]
    ? null
    : `${q(S.menu)}!$C$${menuSumBlock[0].from}:$F$${menuSumBlock[L - 1].to}`);

  /* ═══════════════ ④ 메뉴 원가표 ═══════════════ */
  const wsM = grab(S.menu, [{ state: 'frozen', ySplit: 5, xSplit: 3 }]);
  wsM.columns = [
    { width: 6 }, { width: 15 }, { width: 24 }, { width: 12 }, { width: 12 },
    { width: 10 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 12 },
    { width: 10 }, { width: 13 }, { width: 9 },
  ];
  sheetTitle(wsM, '④ 메뉴 원가표', `레시피북 87개 메뉴 전체. 판매가(노란 셀)만 고치면 원가율·마진이 즉시 다시 계산됩니다.`, 13);
  noteBar(wsM, 3, '💡  식재료원가 = ⑤ 레시피 상세의 합계 |  고정비 배분 = 판매가 × 고정비 배분율 |  총원가 = 식재료원가 + 고정비 배분 |  판정 = 식재료 원가율 기준', 13);
  headerRow(wsM, 5, ['No.', '카테고리', '메뉴명', '판매가(원)', '식재료원가', '식재료\n원가율', '고정비배분', '총원가', '총원가율', '마진(원)', '마진율', '판정', '정렬키']);

  menus.forEach((m, i) => {
    const r = MENU_FIRST + i;
    const row = wsM.getRow(r);
    const blk = menuDetBlock[menuLevelOf(m.name)];
    row.getCell(1).value = i + 1;
    row.getCell(2).value = `${m.icon} ${m.category}`;
    row.getCell(3).value = m.name;
    row.getCell(4).value = Number(m.price) || 0;
    row.getCell(5).value = { formula:
      `ROUND(SUMIF(${q(S.detail)}!$B$${blk.from}:$B$${blk.to},$C${r},${q(S.detail)}!$K$${blk.from}:$K$${blk.to}),1)` };
    row.getCell(6).value  = { formula: `IF($D${r}>0,$E${r}/$D${r},"")` };
    row.getCell(7).value  = { formula: `ROUND($D${r}*${RATE_CELL},0)` };
    row.getCell(8).value  = { formula: `ROUND($E${r}+$G${r},0)` };
    row.getCell(9).value  = { formula: `IF($D${r}>0,$H${r}/$D${r},"")` };
    row.getCell(10).value = { formula: `IF($D${r}>0,$D${r}-$H${r},"")` };
    row.getCell(11).value = { formula: `IF($D${r}>0,$J${r}/$D${r},"")` };
    row.getCell(12).value = { formula:
      `IF($D${r}<=0,"⬜ 판매가 입력",IF($E${r}<=0,"⬜ 재료 확인",IF($F${r}<=${TARGET_CELL},"✅ 양호",IF($F${r}<=${WARN_CELL},"🟡 주의","🔴 과다"))))` };
    row.getCell(13).value = { formula: `IF($D${r}>0,$F${r}+ROW()/1000000,"")` };

    for (let c = 1; c <= 13; c++) asText(row.getCell(c));
    asInput(row.getCell(4));
    for (let c = 5; c <= 13; c++) asCalc(row.getCell(c));
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).font = { name: FONT, size: 9, color: { argb: C.muted } };
    row.getCell(3).font = { name: FONT, size: 10, bold: true, color: { argb: C.ink } };
    [4, 5, 7, 8, 10].forEach((c) => { row.getCell(c).numFmt = NUM.won; });
    [6, 9, 11].forEach((c) => { row.getCell(c).numFmt = NUM.pct; });
    row.getCell(12).alignment = { horizontal: 'center' };
    row.getCell(13).numFmt = '0.000000';
    row.getCell(6).font  = { name: FONT, size: 10, bold: true, color: { argb: C.accent2 } };
    row.getCell(11).font = { name: FONT, size: 10, bold: true, color: { argb: C.inkSoft } };
    if (i % 2 === 1) [1, 2, 3].forEach((c) => { row.getCell(c).fill = fill(C.band); });
  });
  const MENU_LAST = MENU_FIRST + menus.length - 1;

  /* 합계 행 */
  const mTot = MENU_LAST + 1;
  const trow = wsM.getRow(mTot);
  wsM.mergeCells(mTot, 1, mTot, 3);
  trow.getCell(1).value = '합 계 / 가중평균';
  trow.getCell(4).value  = { formula: `SUM(D${MENU_FIRST}:D${MENU_LAST})` };
  trow.getCell(5).value  = { formula: `SUM(E${MENU_FIRST}:E${MENU_LAST})` };
  trow.getCell(6).value  = { formula: `IF(D${mTot}>0,E${mTot}/D${mTot},"")` };
  trow.getCell(7).value  = { formula: `SUM(G${MENU_FIRST}:G${MENU_LAST})` };
  trow.getCell(8).value  = { formula: `SUM(H${MENU_FIRST}:H${MENU_LAST})` };
  trow.getCell(9).value  = { formula: `IF(D${mTot}>0,H${mTot}/D${mTot},"")` };
  trow.getCell(10).value = { formula: `IF(D${mTot}>0,D${mTot}-H${mTot},"")` };
  trow.getCell(11).value = { formula: `IF(D${mTot}>0,J${mTot}/D${mTot},"")` };
  trow.getCell(12).value = { formula:
    `"✅"&COUNTIF(L${MENU_FIRST}:L${MENU_LAST},"*양호*")&"  🟡"&COUNTIF(L${MENU_FIRST}:L${MENU_LAST},"*주의*")&"  🔴"&COUNTIF(L${MENU_FIRST}:L${MENU_LAST},"*과다*")` };
  for (let c = 1; c <= 13; c++) {
    const cell = trow.getCell(c);
    cell.border = { top: { style: 'medium', color: { argb: C.accent2 } }, left: thin, bottom: thin, right: thin };
    cell.fill = fill(C.goodBg);
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.accent2 } };
  }
  [4, 5, 7, 8, 10].forEach((c) => { trow.getCell(c).numFmt = NUM.won; });
  [6, 9, 11].forEach((c) => { trow.getCell(c).numFmt = NUM.pct; });
  trow.getCell(1).alignment = { horizontal: 'right', indent: 1 };
  trow.getCell(12).alignment = { horizontal: 'center' };
  wsM.getColumn(13).hidden = true;
  wsM.autoFilter = { from: { row: 5, column: 1 }, to: { row: MENU_LAST, column: 12 } };

  wsM.addConditionalFormatting({
    ref: `F${MENU_FIRST}:F${MENU_LAST}`,
    rules: [
      { type: 'cellIs', operator: 'greaterThan', formulae: [WARN_CELL],  priority: 1, style: { fill: fill(C.badBg),  font: { color: { argb: C.bad },  bold: true } } },
      { type: 'cellIs', operator: 'greaterThan', formulae: [TARGET_CELL], priority: 2, style: { fill: fill(C.warnBg), font: { color: { argb: C.warn }, bold: true } } },
      { type: 'cellIs', operator: 'greaterThan', formulae: ['0'],         priority: 3, style: { fill: fill(C.goodBg), font: { color: { argb: C.good }, bold: true } } },
    ],
  });
  wsM.addConditionalFormatting({
    ref: `K${MENU_FIRST}:K${MENU_LAST}`,
    rules: [{ type: 'colorScale', priority: 4,
      cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
      color: [{ argb: 'FFFECACA' }, { argb: 'FFFEF3C7' }, { argb: 'FFD1FAE5' }] }],
  });

  /* ⑤ 상세 본문 채우기 */
  let dAlt = 0;
  menus.forEach((m) => {
    const rng = menuDetailRange[m.name];
    const MENU_RANGE = menuLookupRange(menuLevelOf(m.name));   // 1열=메뉴명 … 3열=식재료원가
    const lines = m.lines.length ? m.lines : [{ kind: '식재료', name: '', raw: '(재료 없음)', qty: 0, unit: '-', yield: 1, note: '' }];
    lines.forEach((l, li) => {
      const r = rng.from + li;
      const row = wsD.getRow(r);
      row.getCell(1).value = `${m.icon} ${m.category}`;
      row.getCell(2).value = m.name;
      row.getCell(3).value = li + 1;
      row.getCell(4).value = l.kind;
      row.getCell(5).value = l.name;
      row.getCell(6).value = l.raw === l.name ? '' : l.raw;
      row.getCell(7).value = Number(l.qty) || 0;
      row.getCell(8).value = l.unit || 'g';
      row.getCell(9).value = Number(l.yield) || 1;
      row.getCell(10).value = { formula:
        `IF($D${r}="무료",0,` +
        (MENU_RANGE ? `IF($D${r}="메뉴",IFERROR(VLOOKUP($E${r},${MENU_RANGE},3,FALSE),0),` : `IF($D${r}="메뉴",0,`) +
        `IF($D${r}="프렙",IFERROR(VLOOKUP($E${r},${PREP_RANGE},5,FALSE),0),` +
        `IFERROR(VLOOKUP($E${r},${ING_RANGE},6,FALSE),0))))` };
      row.getCell(11).value = { formula:
        `IF($D${r}="메뉴",ROUND($G${r}*$J${r},1),IF($I${r}>0,ROUND($G${r}/$I${r}*$J${r},1),0))` };
      row.getCell(12).value = l.note || '';

      for (let c = 1; c <= 12; c++) asText(row.getCell(c));
      [7, 9].forEach((c) => asInput(row.getCell(c)));
      [10, 11].forEach((c) => asCalc(row.getCell(c)));
      row.getCell(1).font = { name: FONT, size: 8.5, color: { argb: C.muted } };
      row.getCell(2).font = { name: FONT, size: 10, bold: true, color: { argb: C.ink } };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(4).font = { name: FONT, size: 9, bold: true,
        color: { argb: l.kind === '프렙' ? C.accent2 : l.kind === '메뉴' ? 'FF7C3AED' : l.kind === '무료' ? C.muted : C.inkSoft } };
      row.getCell(6).font = { name: FONT, size: 8.5, color: { argb: C.muted } };
      row.getCell(7).numFmt = '#,##0.##';
      row.getCell(8).alignment = { horizontal: 'center' };
      row.getCell(9).numFmt = NUM.pct;
      row.getCell(10).numFmt = NUM.won3;
      row.getCell(11).numFmt = NUM.won1;
      row.getCell(11).font = { name: FONT, size: 10, bold: true, color: { argb: C.accent2 } };
      row.getCell(12).font = { name: FONT, size: 9, color: { argb: C.muted } };
      wsD.getCell(r, 4).dataValidation = {
        type: 'list', allowBlank: false, formulae: ['"식재료,프렙,메뉴,무료"'],
        showErrorMessage: true, errorTitle: '입력 오류', error: '식재료 / 프렙 / 메뉴 / 무료 중에서 선택하세요.',
      };
      if (dAlt % 2 === 1) [1, 2, 3, 4, 5, 6, 8, 12].forEach((c) => { row.getCell(c).fill = fill(C.band); });
    });
    dAlt++;
  });
  wsD.autoFilter = { from: { row: 5, column: 1 }, to: { row: DTL_LAST, column: 12 } };

  /* ═══════════════ ⑥ 분석 대시보드 ═══════════════ */
  const wsB = grab(S.dash);
  wsB.columns = [
    { width: 4 }, { width: 20 }, { width: 10 }, { width: 14 }, { width: 14 },
    { width: 11 }, { width: 14 }, { width: 11 }, { width: 14 }, { width: 11 }, { width: 4 },
  ];
  sheetTitle(wsB, '⑥ 분석 대시보드', '① ~ ⑤ 시트의 값이 바뀌면 이 시트도 함께 자동으로 갱신됩니다.', 11);

  /* KPI 카드 */
  const KPI = 4;
  const kpis = [
    ['전체 메뉴', `COUNTA(${q(S.menu)}!$C$${MENU_FIRST}:$C$${MENU_LAST})`, '개', NUM.int],
    ['평균 식재료 원가율', `IF(${q(S.menu)}!$D$${mTot}>0,${q(S.menu)}!$E$${mTot}/${q(S.menu)}!$D$${mTot},0)`, '', NUM.pct],
    ['평균 총원가율', `IF(${q(S.menu)}!$D$${mTot}>0,${q(S.menu)}!$H$${mTot}/${q(S.menu)}!$D$${mTot},0)`, '', NUM.pct],
    ['평균 마진율', `IF(${q(S.menu)}!$D$${mTot}>0,(${q(S.menu)}!$D$${mTot}-${q(S.menu)}!$H$${mTot})/${q(S.menu)}!$D$${mTot},0)`, '', NUM.pct],
    ['고정비 배분율', `${RATE_CELL}`, '', NUM.pct],
  ];
  kpis.forEach((k, i) => {
    const col = 2 + i * 2;
    wsB.mergeCells(KPI, col, KPI, col + 1);
    wsB.mergeCells(KPI + 1, col, KPI + 1, col + 1);
    const lab = wsB.getCell(KPI, col);
    lab.value = k[0];
    lab.font = { name: FONT, size: 9, bold: true, color: { argb: C.white } };
    lab.fill = fill(C.accent2);
    lab.alignment = { horizontal: 'center', vertical: 'middle' };
    const val = wsB.getCell(KPI + 1, col);
    val.value = { formula: k[1] };
    val.numFmt = k[3];
    val.font = { name: FONT, size: 18, bold: true, color: { argb: C.ink } };
    val.fill = fill(C.panel);
    val.alignment = { horizontal: 'center', vertical: 'middle' };
    [col, col + 1].forEach((c) => { wsB.getCell(KPI, c).border = box; wsB.getCell(KPI + 1, c).border = box; });
  });
  wsB.getRow(KPI).height = 20;
  wsB.getRow(KPI + 1).height = 38;

  /* 판정 요약 */
  const GR = KPI + 3;
  sectionBar(wsB, GR, '▸  원가율 판정 현황', 11, C.inkSoft);
  [['✅ 양호', '*양호*', C.goodBg, C.good], ['🟡 주의', '*주의*', C.warnBg, C.warn],
   ['🔴 과다', '*과다*', C.badBg, C.bad], ['⬜ 판매가 미입력', '*판매가*', C.panel, C.muted]].forEach((g, i) => {
    const r = GR + 1 + i;
    wsB.mergeCells(r, 2, r, 3);
    const lab = wsB.getCell(r, 2);
    lab.value = g[0];
    lab.font = { name: FONT, size: 10, bold: true, color: { argb: g[3] } };
    lab.fill = fill(g[2]); lab.border = box; lab.alignment = { horizontal: 'left', indent: 1 };
    const v = wsB.getCell(r, 4);
    v.value = { formula: `COUNTIF(${q(S.menu)}!$L$${MENU_FIRST}:$L$${MENU_LAST},"${g[1]}")` };
    v.numFmt = NUM.int; v.border = box; v.fill = fill(g[2]);
    v.font = { name: FONT, size: 11, bold: true, color: { argb: g[3] } };
    v.alignment = { horizontal: 'center' };
    const p = wsB.getCell(r, 5);
    p.value = { formula: `IF(COUNTA(${q(S.menu)}!$C$${MENU_FIRST}:$C$${MENU_LAST})>0,D${r}/COUNTA(${q(S.menu)}!$C$${MENU_FIRST}:$C$${MENU_LAST}),0)` };
    p.numFmt = NUM.pct; p.border = box; p.fill = fill(g[2]);
    p.font = { name: FONT, size: 10, color: { argb: g[3] } };
    p.alignment = { horizontal: 'center' };
    wsB.getCell(r, 3).border = box;
  });

  /* 카테고리별 집계 */
  const CAT = GR + 6;
  sectionBar(wsB, CAT, '▸  카테고리별 원가 분석', 11, C.inkSoft);
  headerRow(wsB, CAT + 1, ['', '카테고리', '메뉴수', '판매가 합계', '식재료원가', '원가율', '고정비배분', '총원가', '마진 합계', '마진율', '']);
  const cats = data.categoryOrder.filter((c) => menus.some((m) => m.category === c));
  cats.forEach((c, i) => {
    const r = CAT + 2 + i;
    const key = `"${data.categoryIcon[c] || ''} ${c}"`;
    const row = wsB.getRow(r);
    const CB = `${q(S.menu)}!$B$${MENU_FIRST}:$B$${MENU_LAST}`;
    row.getCell(2).value = `${data.categoryIcon[c] || ''} ${c}`;
    row.getCell(3).value = { formula: `COUNTIF(${CB},${key})` };
    row.getCell(4).value = { formula: `SUMIF(${CB},${key},${q(S.menu)}!$D$${MENU_FIRST}:$D$${MENU_LAST})` };
    row.getCell(5).value = { formula: `SUMIF(${CB},${key},${q(S.menu)}!$E$${MENU_FIRST}:$E$${MENU_LAST})` };
    row.getCell(6).value = { formula: `IF(D${r}>0,E${r}/D${r},"")` };
    row.getCell(7).value = { formula: `SUMIF(${CB},${key},${q(S.menu)}!$G$${MENU_FIRST}:$G$${MENU_LAST})` };
    row.getCell(8).value = { formula: `SUMIF(${CB},${key},${q(S.menu)}!$H$${MENU_FIRST}:$H$${MENU_LAST})` };
    row.getCell(9).value = { formula: `IF(D${r}>0,D${r}-H${r},"")` };
    row.getCell(10).value = { formula: `IF(D${r}>0,I${r}/D${r},"")` };
    for (let c2 = 2; c2 <= 10; c2++) asText(row.getCell(c2));
    row.getCell(2).font = { name: FONT, size: 10, bold: true, color: { argb: C.ink } };
    row.getCell(3).numFmt = NUM.int; row.getCell(3).alignment = { horizontal: 'center' };
    [4, 5, 7, 8, 9].forEach((c2) => { row.getCell(c2).numFmt = NUM.won; });
    [6, 10].forEach((c2) => { row.getCell(c2).numFmt = NUM.pct; });
    row.getCell(6).font = { name: FONT, size: 10, bold: true, color: { argb: C.accent2 } };
    if (i % 2 === 1) for (let c2 = 2; c2 <= 10; c2++) row.getCell(c2).fill = fill(C.band);
  });
  const CAT_LAST = CAT + 1 + cats.length;
  wsB.addConditionalFormatting({
    ref: `F${CAT + 2}:F${CAT_LAST}`,
    rules: [{ type: 'colorScale', priority: 5,
      cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
      color: [{ argb: 'FFD1FAE5' }, { argb: 'FFFEF3C7' }, { argb: 'FFFECACA' }] }],
  });

  /* 원가율 상위 / 마진 상위 */
  const TOP = CAT_LAST + 2;
  sectionBar(wsB, TOP, '▸  식재료 원가율 상위 10  (개선 우선순위)', 11, C.bad);
  headerRow(wsB, TOP + 1, ['', '순위', '메뉴명', '판매가', '식재료원가', '원가율', '', '순위', '메뉴명', '판매가', '']);
  wsB.getCell(TOP + 1, 7).value = '';
  const KEY = `${q(S.menu)}!$M$${MENU_FIRST}:$M$${MENU_LAST}`;
  const NAM = `${q(S.menu)}!$C$${MENU_FIRST}:$C$${MENU_LAST}`;
  const PRC = `${q(S.menu)}!$D$${MENU_FIRST}:$D$${MENU_LAST}`;
  const FDC = `${q(S.menu)}!$E$${MENU_FIRST}:$E$${MENU_LAST}`;
  const FDR = `${q(S.menu)}!$F$${MENU_FIRST}:$F$${MENU_LAST}`;
  for (let i = 0; i < 10; i++) {
    const r = TOP + 2 + i;
    const row = wsB.getRow(r);
    const pick = (col) => `IFERROR(INDEX(${col},MATCH(LARGE(${KEY},${i + 1}),${KEY},0)),"")`;
    row.getCell(2).value = i + 1;
    row.getCell(3).value = { formula: pick(NAM) };
    row.getCell(4).value = { formula: pick(PRC) };
    row.getCell(5).value = { formula: pick(FDC) };
    row.getCell(6).value = { formula: pick(FDR) };
    const pickS = (col) => `IFERROR(INDEX(${col},MATCH(SMALL(${KEY},${i + 1}),${KEY},0)),"")`;
    row.getCell(8).value = i + 1;
    row.getCell(9).value = { formula: pickS(NAM) };
    row.getCell(10).value = { formula: pickS(FDR) };
    for (let c2 = 2; c2 <= 10; c2++) asText(row.getCell(c2));
    [2, 8].forEach((c2) => { row.getCell(c2).alignment = { horizontal: 'center' };
      row.getCell(c2).font = { name: FONT, size: 9, color: { argb: C.muted } }; });
    [4, 5].forEach((c2) => { row.getCell(c2).numFmt = NUM.won; });
    row.getCell(6).numFmt = NUM.pct;
    row.getCell(6).font = { name: FONT, size: 10, bold: true, color: { argb: C.bad } };
    row.getCell(10).numFmt = NUM.pct;
    row.getCell(10).font = { name: FONT, size: 10, bold: true, color: { argb: C.good } };
    row.getCell(7).border = undefined; row.getCell(7).value = '';
    if (i % 2 === 1) for (const c2 of [2, 3, 4, 5, 6, 8, 9, 10]) row.getCell(c2).fill = fill(C.band);
  }
  wsB.mergeCells(TOP + 1, 8, TOP + 1, 10);
  const rt = wsB.getCell(TOP + 1, 8);
  rt.value = '원가율 하위 10 (효자 메뉴)';
  rt.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
  rt.fill = fill(C.good);
  rt.alignment = { horizontal: 'center', vertical: 'middle' };

  /* ═══════════════ ⚠ 확인 필요 ═══════════════ */
  const wsX = grab(S.issue);
  wsX.columns = [{ width: 6 }, { width: 22 }, { width: 22 }, { width: 28 }, { width: 72 }];
  sheetTitle(wsX, '⚠ 확인 필요 항목', '원본 자료에서 값이 비었거나 추정이 들어간 부분입니다. 실제 값으로 채우면 정확도가 올라갑니다.', 5);
  headerRow(wsX, 4, ['No.', '구분', '메뉴 / 대상', '항목', '설명 및 조치']);
  const HINT = {
    '판매가 없음': '④ 메뉴 원가표에서 판매가를 입력하세요. 입력 전까지 원가율은 계산되지 않습니다.',
    '식재료 단가 미입력': '① 식재료 단가에서 구매가격을 입력하세요.',
    '식재료 규격 미입력': '① 식재료 단가에서 총중량(g)을 입력하세요. (개당 판매 품목이면 그대로 두어도 됩니다.)',
  };
  (data.issues || []).forEach((it, i) => {
    const r = 5 + i;
    const row = wsX.getRow(r);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = it.type;
    row.getCell(3).value = it.menu || '-';
    row.getCell(4).value = it.name || '-';
    row.getCell(5).value = it.note || HINT[it.type] || '';
    for (let c = 1; c <= 5; c++) asText(row.getCell(c));
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).font = { name: FONT, size: 9, bold: true, color: { argb: C.warn } };
    row.getCell(5).font = { name: FONT, size: 9, color: { argb: C.muted } };
    if (i % 2 === 1) for (let c = 1; c <= 5; c++) row.getCell(c).fill = fill(C.band);
  });
  wsX.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + (data.issues || []).length, column: 5 } };

  /* ═══════════════ 📘 사용안내 (맨 앞으로) ═══════════════ */
  const wsG = grab(S.guide);
  wsG.columns = [{ width: 4 }, { width: 22 }, { width: 96 }, { width: 4 }];
  sheetTitle(wsG, `📘 ${data.meta.brand} · 메뉴 원가 분석서`, `${data.meta.source} · v${data.meta.version}`, 4);

  let g = 4;
  const gRow = (label, text, style = {}) => {
    const row = wsG.getRow(g);
    row.getCell(2).value = label;
    row.getCell(3).value = text;
    row.getCell(2).font = { name: FONT, size: 10, bold: true, color: { argb: style.lc || C.accent2 } };
    row.getCell(3).font = { name: FONT, size: 10, color: { argb: C.inkSoft } };
    row.getCell(2).alignment = { vertical: 'top', horizontal: 'left', indent: 1 };
    row.getCell(3).alignment = { vertical: 'top', wrapText: true };
    [2, 3].forEach((c) => { row.getCell(c).border = box; row.getCell(c).fill = fill(style.bg || C.white); });
    row.height = style.h || 22;
    g++;
  };
  const gSec = (t) => { sectionBar(wsG, g, t, 4, C.inkSoft); g++; };

  gSec('▸  이 파일의 구조');
  gRow('① 식재료 단가', '식재료 118종의 구매가격 → g당 단가. 여기만 고치면 모든 메뉴 원가가 따라 바뀝니다.');
  gRow('② 프렙 원가', '커리 그레이비·탄두리 소스 등 반제품 11종의 g당 원가. 프렙 안에 프렙이 들어가도 자동 계산됩니다.');
  gRow('③ 고정비 설정', '월 고정비·월 추정매출·판정 기준. 고정비 배분율이 여기서 결정됩니다.');
  gRow('④ 메뉴 원가표', '메뉴 87종의 판매가·원가·원가율·마진 한눈에. 판매가만 입력하면 됩니다.');
  gRow('⑤ 레시피 상세', '레시피북과 똑같은 재료·사용량. 한 줄 = 재료 1개의 단일 서식입니다.');
  gRow('⑥ 분석 대시보드', 'KPI·카테고리별 원가율·개선 우선순위 TOP10. 전부 수식이라 자동 갱신됩니다.');
  gRow('⚠ 확인 필요', '값이 비었거나 추정한 항목 목록. 채워 넣을수록 정확해집니다.');
  g++;

  gSec('▸  색상 규칙');
  const legend = [
    ['노란 셀', '직접 입력하는 값 (구매가격, 사용량, 판매가, 고정비 …)', C.input, 'FF92400E'],
    ['회색 셀', '수식이 자동 계산하는 값 — 덮어쓰지 마세요', C.panel, C.inkSoft],
    ['✅ 양호', '식재료 원가율이 목표(기본 30%) 이하', C.goodBg, C.good],
    ['🟡 주의', '목표 초과 ~ 주의선(기본 38%) 이하', C.warnBg, C.warn],
    ['🔴 과다', '주의선 초과 — 레시피·판매가 재검토 필요', C.badBg, C.bad],
  ];
  legend.forEach(([a, b, bg, fc]) => gRow(a, b, { bg, lc: fc }));
  g++;

  gSec('▸  계산 방식');
  gRow('g당 단가', '구매가격 ÷ 총중량(g)');
  gRow('재료비', '사용량 ÷ 수율 × g당 단가   (수율 100% 면 사용량 × 단가)');
  gRow('프렙 g당 원가', '프렙 총 재료비 ÷ 완성중량(g)');
  gRow('식재료 원가', '해당 메뉴의 재료비 전부 합계 (⑤ 시트 SUMIF)');
  gRow('고정비 배분', '판매가 × (배분대상 고정비 ÷ 월 추정매출) — 판매가에 비례해 배분');
  gRow('총원가 / 마진', '총원가 = 식재료 원가 + 고정비 배분,  마진 = 판매가 − 총원가');
  g++;

  gSec('▸  꼭 알아두실 점');
  gRow('고정비 조정', '원본 고정비 목록의 「외상 매입금-식재료비(월 1,700만원)」는 메뉴별 식재료 원가에 이미 반영되어 있어 그대로 두면 이중 계산됩니다. 그래서 ③ 시트에서 「제외」로 두었습니다. 포함시키려면 「포함」으로 바꾸면 됩니다.', { bg: C.warnBg, lc: C.warn, h: 46 });
  gRow('오류 방지', '모든 나눗셈은 분모가 0이면 0을 돌려주고, 모든 조회는 IFERROR로 감쌌습니다. 재료명을 바꾸거나 지워도 #DIV/0!·#N/A 가 뜨지 않습니다.', { h: 34 });
  gRow('재료 추가', '⑤ 시트에서 줄을 복사해 메뉴명·재료명만 바꾸면 됩니다. 재료명은 ① 시트의 이름과 정확히 같아야 단가가 잡힙니다.', { h: 34 });
  gRow('웹·모바일', '같은 데이터로 만든 웹 버전에서는 PC·휴대폰 모두에서 단가를 수정하고 이 엑셀을 다시 내려받을 수 있습니다.', { h: 34 });

  [wsG, wsB, wsM, wsD, wsI, wsP, wsF, wsX].forEach((ws) => {
    ws.properties.defaultRowHeight = 19;
    ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                     margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };
    ws.views = ws.views && ws.views.length ? ws.views : [{ showGridLines: false }];
    ws.views = ws.views.map((v) => ({ ...v, showGridLines: false }));
  });

  return wb;
}

/** 엑셀에 실제로 기록되는 행 순서 (레벨 정렬 반영) — 검증 스크립트가 사용 */
function ordering(data) {
  const prepLv = levelize(data.preps, (p) => p.name,
                          (p) => p.items.filter((i) => i.kind === '프렙').map((i) => i.name));
  const preps = data.preps.map((p, i) => ({ p, i, lv: prepLv.get(p.name) || 0 }))
    .sort((a, b) => a.lv - b.lv || a.i - b.i).map((x) => x.p.name);
  const menuLv = levelize(data.menus, (m) => m.name,
                          (m) => m.lines.filter((l) => l.kind === '메뉴').map((l) => l.name));
  const menus = data.menus.map((m, i) => ({ m, i, lv: menuLv.get(m.name) || 0 }))
    .sort((a, b) => a.lv - b.lv || a.i - b.i).map((x) => x.m.name);
  return { preps, menus };
}

if (typeof module === 'object' && module.exports) module.exports = { build, ordering };
else self.XlsxBuilder = { build, ordering };

/* CLI: node tools/build-xlsx.js [출력경로] */
if (typeof require === 'function' && typeof module === 'object' && require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const dataPath = path.join(__dirname, '..', 'data', 'dataset.json');
  const out = process.argv[2] || path.join(__dirname, '..', 'public', 'downloads', '에베레스트_원가분석서.xlsx');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  build(data).xlsx.writeFile(out).then(() => {
    console.log('✅  생성 완료:', out, (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
  });
}

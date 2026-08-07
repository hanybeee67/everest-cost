/* JS 엔진 계산 결과를 엑셀 셀 좌표에 매핑 → 엑셀 실제 계산값과 대조용 */
const fs = require('fs');
const Calc = require('../shared/calc.js');
const { ordering } = require('./build-xlsx.js');
const data = JSON.parse(fs.readFileSync(__dirname + '/../data/dataset.json', 'utf8'));
const r = Calc.compute(data);
const exp = {};
const S = { ing: "'① 식재료 단가'", prep: "'② 프렙 원가'", fixed: "'③ 고정비 설정'",
            menu: "'④ 메뉴 원가표'", detail: "'⑤ 레시피 상세'", dash: "'⑥ 분석 대시보드'" };

const ord = ordering(data);
const prepByName = new Map(r.preps.map((p) => [p.name, p]));
const menuByName = new Map(r.menus.map((m) => [m.name, m]));

// ① 식재료 g당 단가 (G열, 6행부터)
r.ingredients.forEach((it, i) => { exp[`${S.ing}!G${6 + i}`] = it.unitCost; });

// ② 프렙 총원가(E) / g당원가(F)  6행부터 (레벨 정렬 순서)
ord.preps.forEach((name, i) => {
  const p = prepByName.get(name);
  exp[`${S.prep}!E${6 + i}`] = p.totalCost;
  exp[`${S.prep}!F${6 + i}`] = p.unitCost;
});

// ④ 메뉴: 식재료원가(E) 고정비(G) 총원가(H) 마진(J)  6행부터 (레벨 정렬 순서)
ord.menus.forEach((name, i) => {
  const m = menuByName.get(name);
  const row = 6 + i;
  exp[`${S.menu}!E${row}`] = Math.round(m.foodCost * 10) / 10;
  exp[`${S.menu}!G${row}`] = Math.round(m.fixedCost);
  exp[`${S.menu}!H${row}`] = Math.round(Math.round(m.foodCost * 10) / 10 + Math.round(m.fixedCost));
  if (m.hasPrice) {
    exp[`${S.menu}!F${row}`] = m.foodRate;
    exp[`${S.menu}!J${row}`] = m.price - Math.round(Math.round(m.foodCost * 10) / 10 + Math.round(m.fixedCost));
  }
});

// ③ 고정비 합계·배분율
const FX_LAST = 5 + data.fixedCosts.length;
exp[`${S.fixed}!C${FX_LAST + 1}`] = r.summary.fixedTotal;
exp[`${S.fixed}!C${FX_LAST + 2}`] = r.summary.fixedAllocatable;
exp[`${S.fixed}!C${FX_LAST + 5}`] = r.summary.monthlyRevenue;
exp[`${S.fixed}!C${FX_LAST + 6}`] = r.summary.fixedRate;

fs.writeFileSync(__dirname + '/../data/_expected.json', JSON.stringify(exp, null, 0));
console.log('기대값 셀', Object.keys(exp).length);

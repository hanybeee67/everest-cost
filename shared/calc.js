/* =====================================================================
 *  원가 계산 엔진  (브라우저 / Node 공용)
 *  엑셀 수식과 1:1 로 동일한 로직 — 어디서 계산해도 같은 값이 나온다.
 * =====================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  /** 0 나눗셈 방지 — 엑셀의 IF(분모>0, …, 0) 과 동일 */
  const div = (a, b) => (num(b) > 0 ? num(a) / num(b) : 0);
  const round = (v, d = 0) => { const p = Math.pow(10, d); return Math.round(num(v) * p) / p; };

  /**
   * @param {object} data dataset.json 구조
   * @returns {object} 계산 결과가 채워진 뷰모델
   */
  function compute(data) {
    /* ── 1. 식재료 g당 단가 ────────────────────────────── */
    const ingByName = new Map();
    const ingredients = data.ingredients.map((i) => {
      const unitCost = div(i.price, i.weight_g);          // 원/g
      const row = { ...i, unitCost, valid: num(i.weight_g) > 0 && num(i.price) > 0 };
      ingByName.set(i.name, row);
      return row;
    });

    /* ── 2. 프렙 g당 원가 (프렙 안의 프렙까지 재귀, 순환참조 차단) ── */
    const prepByName = new Map(data.preps.map((p) => [p.name, p]));
    const prepCache = new Map();
    const prepStack = new Set();

    function prepUnitCost(name) {
      if (prepCache.has(name)) return prepCache.get(name).unitCost;
      const p = prepByName.get(name);
      if (!p || prepStack.has(name)) return 0;            // 없거나 순환 → 0
      prepStack.add(name);
      let total = 0;
      const items = p.items.map((it) => {
        let uc = 0;
        if (it.kind === '프렙') uc = prepUnitCost(it.name);
        else if (it.kind === '식재료') uc = ingByName.get(it.name)?.unitCost ?? 0;
        const cost = num(it.qty) * uc;
        total += cost;
        return { ...it, unitCost: uc, cost };
      });
      prepStack.delete(name);
      const res = { ...p, items, totalCost: total, unitCost: div(total, p.yield_g),
                    inputG: p.items.reduce((s, i) => s + num(i.qty), 0) };
      prepCache.set(name, res);
      return res.unitCost;
    }
    data.preps.forEach((p) => prepUnitCost(p.name));
    const preps = data.preps.map((p) => prepCache.get(p.name));

    /* ── 3. 고정비 배분율 ───────────────────────────────── */
    const fixedTotal      = data.fixedCosts.reduce((s, f) => s + num(f.amount), 0);
    const fixedAllocatable = data.fixedCosts.reduce((s, f) => s + (f.include === false ? 0 : num(f.amount)), 0);
    const monthlyRevenue = num(data.settings.monthlyRevenue);
    const fixedRate = div(fixedAllocatable, monthlyRevenue);   // 매출 1원당 배분 고정비

    /* ── 4. 메뉴 원가 (세트메뉴가 참조하는 단품까지 재귀) ── */
    const menuByName = new Map(data.menus.map((m) => [m.name, m]));
    const menuCache = new Map();
    const menuStack = new Set();

    function menuFoodCost(name) {
      if (menuCache.has(name)) return menuCache.get(name).foodCost;
      const m = menuByName.get(name);
      if (!m || menuStack.has(name)) return 0;
      menuStack.add(name);
      let food = 0;
      const lines = m.lines.map((l) => {
        let unitCost = 0, cost = 0, basis = '';
        if (l.kind === '무료') { basis = '무상(수돗물 등)'; }
        else if (l.kind === '메뉴') {
          unitCost = menuFoodCost(l.name);
          cost = num(l.qty) * unitCost;
          basis = '단품 메뉴 원가 × 수량';
        } else if (l.kind === '프렙') {
          unitCost = prepCache.get(l.name)?.unitCost ?? 0;
          cost = div(num(l.qty), num(l.yield)) * unitCost;
          basis = '프렙 g당 원가';
        } else if (l.kind === '식재료') {
          unitCost = ingByName.get(l.name)?.unitCost ?? 0;
          cost = div(num(l.qty), num(l.yield)) * unitCost;
          basis = '식재료 g당 단가';
        }
        food += cost;
        return { ...l, unitCost, cost, basis };
      });
      menuStack.delete(name);

      const price     = num(m.price);
      const fixedCost = price * fixedRate;
      const totalCost = food + fixedCost;
      const res = {
        ...m, lines,
        foodCost: food,
        fixedCost,
        totalCost,
        foodRate:   div(food, price),
        totalRate:  div(totalCost, price),
        margin:     price ? price - totalCost : 0,
        marginRate: div(price - totalCost, price),
        grossMargin: price ? price - food : 0,
        hasPrice: price > 0,
      };
      res.grade = grade(res, data.settings);
      menuCache.set(name, res);
      return res.foodCost;
    }
    data.menus.forEach((m) => menuFoodCost(m.name));
    const menus = data.menus.map((m) => menuCache.get(m.name));

    /* ── 5. 카테고리 집계 ──────────────────────────────── */
    const catMap = new Map();
    menus.forEach((m) => {
      if (!catMap.has(m.category))
        catMap.set(m.category, { category: m.category, icon: m.icon, count: 0,
                                 price: 0, foodCost: 0, fixedCost: 0, totalCost: 0, priced: 0 });
      const c = catMap.get(m.category);
      c.count++;
      if (m.hasPrice) { c.priced++; c.price += m.price; c.foodCost += m.foodCost;
                        c.fixedCost += m.fixedCost; c.totalCost += m.totalCost; }
    });
    const categories = (data.categoryOrder || [])
      .map((c) => catMap.get(c)).filter(Boolean)
      .map((c) => ({ ...c, foodRate: div(c.foodCost, c.price),
                     totalRate: div(c.totalCost, c.price),
                     margin: c.price - c.totalCost,
                     marginRate: div(c.price - c.totalCost, c.price) }));

    /* ── 6. 전체 요약 ─────────────────────────────────── */
    const priced = menus.filter((m) => m.hasPrice);
    const sum = (f) => priced.reduce((s, m) => s + f(m), 0);
    const summary = {
      menuCount: menus.length,
      pricedCount: priced.length,
      avgFoodRate:  div(sum((m) => m.foodCost),  sum((m) => m.price)),
      avgTotalRate: div(sum((m) => m.totalCost), sum((m) => m.price)),
      avgMarginRate: div(sum((m) => m.price - m.totalCost), sum((m) => m.price)),
      good: menus.filter((m) => m.grade.key === 'good').length,
      warn: menus.filter((m) => m.grade.key === 'warn').length,
      bad:  menus.filter((m) => m.grade.key === 'bad').length,
      none: menus.filter((m) => m.grade.key === 'none').length,
      fixedTotal, fixedAllocatable, monthlyRevenue, fixedRate,
    };

    return { ingredients, preps, menus, categories, summary,
             fixedCosts: data.fixedCosts, settings: data.settings,
             issues: data.issues || [], meta: data.meta };
  }

  /** 식재료 원가율 기준 등급 */
  function grade(m, s) {
    if (!m.hasPrice)             return { key: 'none', label: '판매가 미입력', icon: '⬜' };
    if (m.foodRate <= s.targetFoodCostRate) return { key: 'good', label: '양호', icon: '✅' };
    if (m.foodRate <= s.warnFoodCostRate)   return { key: 'warn', label: '주의', icon: '🟡' };
    return { key: 'bad', label: '과다', icon: '🔴' };
  }

  return { compute, num, div, round };
});

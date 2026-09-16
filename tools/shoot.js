/* =====================================================================
 *  사용설명서에 들어갈 화면 그림을 다시 찍는다.
 *  화면이 바뀌면 그림도 같이 바뀌어야 설명서가 거짓말을 하지 않는다.
 *
 *  사용법:  node tools/shoot.js [찍을 것 이름 …]
 *           이름을 안 주면 아래 SHOTS 전부를 찍는다.
 * =====================================================================*/
const path = require('path');
const fs = require('fs');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'shots');
const FILE = 'file://' + path.join(ROOT, 'public', 'downloads', '원가분석_템플릿.html');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';

const PC = { viewport: { width: 800, height: 550 }, deviceScaleFactor: 2 };
const PHONE = devices['iPhone 13'];

/** 로그인 — 템플릿은 계정이 없으므로 처음 넣는 값이 그대로 등록된다 */
async function login(page, id = 'admin', pw = 'everest') {
  await page.click('#btnAuth');
  await page.waitForSelector('#loginModal:not([hidden])');
  await page.fill('#loginId', id);
  await page.fill('#loginPw', pw);
  await page.click('#loginSubmit');
  await page.waitForSelector('#loginModal', { state: 'hidden' });
}
const en = (page) => page.click('#langSwitch button[data-lang="en"]');
const openFirstCard = async (page) => { await page.click('.rcard'); await page.waitForTimeout(350); };

const SHOTS = {
  kitchen: [PC, async (p) => { await p.waitForTimeout(250); }],
  recipe:  [PC, async (p) => { await openFirstCard(p); }],
  'recipe-cost': [PC, async (p) => { await login(p); await openFirstCard(p); }],
  en:      [PC, async (p) => { await en(p); await openFirstCard(p); }],
  'm-kitchen': [PHONE, async (p) => { await p.waitForTimeout(250); }],
  'm-recipe':  [PHONE, async (p) => { await openFirstCard(p); }],
  'm-en':      [PHONE, async (p) => { await en(p); await openFirstCard(p); }],
};

(async () => {
  const want = process.argv.slice(2).filter((a) => SHOTS[a]);
  const keys = want.length ? want : Object.keys(SHOTS);
  const browser = await chromium.launch({ executablePath: CHROME });
  fs.mkdirSync(OUT, { recursive: true });

  for (const key of keys) {
    const [cfg, act] = SHOTS[key];
    const ctx = await browser.newContext(cfg);
    const page = await ctx.newPage();
    await page.goto(FILE);
    await page.waitForSelector('#app:not([hidden])');
    await act(page);
    await page.waitForTimeout(250);
    const png = await page.screenshot();
    const out = path.join(OUT, `tpl-${key}.webp`);
    fs.writeFileSync(out + '.png', png);
    await ctx.close();
    console.log('  📸', path.basename(out));
  }
  await browser.close();
  console.log('\nPNG 로 찍었습니다. WebP 변환:  python3 tools/shoot-webp.py');
})();

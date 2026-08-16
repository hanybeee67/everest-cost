/* =====================================================================
 *  단일 HTML 파일 빌더
 *  데이터 · 계산엔진 · 엑셀생성기 · 스타일 · 화면을 HTML 하나로 합친다.
 *  인터넷도 서버도 필요 없이, 파일을 더블클릭하면 바로 실행된다.
 * =====================================================================*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const OUT = process.argv[2] || path.join(ROOT, 'public', 'downloads', '에베레스트_원가분석_단일파일.html');
const DATA = process.argv[3] || 'data/dataset.json';

/* ── 재료 모으기 ──────────────────────────────────────── */
const dataset = JSON.parse(read(DATA));
const css     = read('public/app.css');
const calcJs  = read('shared/calc.js');
const xlsxJs  = read('tools/build-xlsx.js');
const appJs   = read('public/app.js');
const excelJs = read('node_modules/exceljs/dist/exceljs.bare.min.js');
const iconSvg = read('public/icon.svg');

/* index.html 의 <body> 안쪽만 가져와 재사용 — 화면 구조를 한 곳에서만 관리한다 */
const indexHtml = read('public/index.html');
const bodyInner = indexHtml
  .slice(indexHtml.indexOf('<body>') + 6, indexHtml.lastIndexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '')       // 외부 스크립트 태그 제거 (아래에서 인라인)
  .trim();

/* </script> 가 문자열 안에 들어가면 HTML 파서가 스크립트를 끊어버린다 */
const safe = (s) => s.replace(/<\/script>/gi, '<\\/script>');
const favicon = 'data:image/svg+xml;base64,' + Buffer.from(iconSvg).toString('base64');

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f172a">
<title>${dataset.meta.brand ? dataset.meta.brand + ' · ' : ''}메뉴 원가 분석</title>
<link rel="icon" href="${favicon}">
<!--
  ═══════════════════════════════════════════════════════════════
   ${dataset.meta.brand || ''} · ${dataset.meta.title || '메뉴 원가 분석'}  (단일 파일 버전)
   생성일 ${new Date().toISOString().slice(0, 10)}

   · 이 파일 하나면 끝입니다. 인터넷도, 설치도, 서버도 필요 없습니다.
   · 파일을 더블클릭하면 브라우저에서 바로 열립니다.
   · 고친 단가는 그 브라우저에 저장됩니다.
     다른 기기로 옮기려면 [백업] 으로 JSON 을 저장해 [복원] 하세요.
   · [엑셀 내려받기] 를 누르면 지금 값 그대로 엑셀이 만들어집니다.
  ═══════════════════════════════════════════════════════════════
-->
<style>
${css}
</style>
</head>
<body>

${bodyInner}

<script id="ovData" type="application/json">null</script>
<script>${safe(excelJs)}</script>
<script>window.EMBEDDED_DATASET = ${safe(JSON.stringify(dataset))};</script>
<script>${safe(calcJs)}</script>
<script>${safe(xlsxJs)}</script>
<script>${safe(appJs)}</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`✅  단일 파일 생성 완료`);
console.log(`    ${OUT}`);
console.log(`    ${kb}KB · 메뉴 ${dataset.menus.length} · 식재료 ${dataset.ingredients.length} · 프렙 ${dataset.preps.length}`);

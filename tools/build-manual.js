/* =====================================================================
 *  사용설명서(매뉴얼) 단일 HTML 파일 생성기
 *  화면 캡처를 파일 안에 박아 넣어, 인터넷 없이 열어도 그림이 보인다.
 * =====================================================================*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'public', 'downloads', '원가분석_템플릿_사용설명서.html');
const SHOTS = process.argv[3] || path.join(ROOT, 'assets', 'shots');

const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'template.json'), 'utf8'));

/* ── 화면 그림 불러오기 ───────────────────────────────── */
function img(name) {
  const f = path.join(SHOTS, `tpl-${name}.webp`);
  if (!fs.existsSync(f)) { console.warn('  (그림 없음:', name, ')'); return ''; }
  return 'data:image/webp;base64,' + fs.readFileSync(f).toString('base64');
}
const FIG = {};
['dash', 'menu', 'detail', 'detail2', 'set', 'ing', 'prep', 'fix', 'issue', 'import',
 'm-dash', 'm-menu', 'm-detail'].forEach((k) => { FIG[k] = img(k); });

const figure = (key, caption, note) => FIG[key]
  ? `<figure class="fig${note ? ' fig-note' : ''}">
       <img src="${FIG[key]}" alt="${caption}" decoding="async">
       <figcaption><b>${caption}</b>${note ? ` — ${note}` : ''}</figcaption>
     </figure>`
  : '';

const CSS = `
:root{
  --bg:#f5f7fa; --paper:#fff; --ink:#0f172a; --ink-2:#334155; --muted:#64748b; --faint:#94a3b8;
  --line:#e2e8f0; --line-2:#cbd5e1; --soft:#f1f5f9;
  --accent:#0d9488; --accent-ink:#0f766e; --accent-soft:#ccfbf1;
  --good:#047857; --good-bg:#ecfdf5; --warn:#b45309; --warn-bg:#fffbeb;
  --bad:#be123c; --bad-bg:#fff1f2; --input:#fffbeb;
  --shadow:0 1px 2px rgba(15,23,42,.05), 0 12px 32px -18px rgba(15,23,42,.28);
  --r:16px;
  --font:-apple-system,BlinkMacSystemFont,"Pretendard","Apple SD Gothic Neo","Malgun Gothic","맑은 고딕",Roboto,sans-serif;
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#0b1120; --paper:#111a2e; --ink:#e8eefc; --ink-2:#c2cde3; --muted:#8fa0bd; --faint:#68789a;
    --line:#22304d; --line-2:#2e3f63; --soft:#182339;
    --accent:#2dd4bf; --accent-ink:#5eead4; --accent-soft:#134e4a;
    --good:#34d399; --good-bg:#0d2b23; --warn:#fbbf24; --warn-bg:#33270c;
    --bad:#fb7185; --bad-bg:#3a1420; --input:#2a2410;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 12px 32px -18px rgba(0,0,0,.8);
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);font-size:16px;line-height:1.75;
     -webkit-text-size-adjust:100%}
img{max-width:100%;height:auto;display:block}
h1,h2,h3,h4{margin:0;line-height:1.3;letter-spacing:-.02em}
a{color:var(--accent-ink)}
code{background:var(--soft);padding:2px 6px;border-radius:6px;font-size:.9em;
     font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}

/* 표지 */
.cover{
  background:linear-gradient(150deg,#0f172a 0%,#134e4a 62%,#0d9488 130%);
  color:#fff;padding:76px 24px 64px;text-align:center;
}
.cover .badge{display:inline-block;padding:6px 15px;border-radius:999px;background:rgba(255,255,255,.14);
  font-size:12.5px;font-weight:700;letter-spacing:.08em;margin-bottom:20px}
.cover h1{font-size:clamp(28px,6vw,46px);font-weight:800;margin-bottom:12px}
.cover p{margin:0 auto;max-width:640px;color:rgba(255,255,255,.85);font-size:clamp(14px,2.6vw,17px)}
.cover .meta{margin-top:26px;font-size:12.5px;color:rgba(255,255,255,.6)}

/* 레이아웃 */
.wrap{max-width:960px;margin:0 auto;padding:0 20px 80px}
section{background:var(--paper);border:1px solid var(--line);border-radius:var(--r);
        padding:30px 30px 34px;margin-top:22px;box-shadow:var(--shadow)}
section:first-of-type{margin-top:-40px}
.eyebrow{font-size:12px;font-weight:800;letter-spacing:.1em;color:var(--accent-ink);margin-bottom:6px}
h2{font-size:clamp(20px,3.6vw,26px);font-weight:800;margin-bottom:6px}
h2 + .lead{color:var(--muted);font-size:15px;margin:0 0 20px}
h3{font-size:17px;font-weight:750;margin:26px 0 8px}
h3:first-of-type{margin-top:6px}
p{margin:0 0 12px}
ul,ol{margin:0 0 14px;padding-left:22px}
li{margin:5px 0}
.small{font-size:13.5px;color:var(--muted)}

/* 목차 */
.toc{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:6px}
.toc a{display:flex;gap:11px;align-items:center;padding:12px 14px;border-radius:12px;background:var(--soft);
       text-decoration:none;color:var(--ink);font-weight:650;font-size:14.5px;border:1px solid transparent}
.toc a:hover{border-color:var(--accent);background:var(--accent-soft)}
.toc a i{font-style:normal;font-size:19px}

/* 카드 */
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin:16px 0}
.tile{background:var(--soft);border-radius:14px;padding:16px 18px;border:1px solid var(--line)}
.tile b{display:block;font-size:15px;margin-bottom:4px}
.tile span{font-size:13.5px;color:var(--muted)}

/* 단계 */
.steps{list-style:none;padding:0;margin:18px 0 0;counter-reset:st}
.steps > li{counter-increment:st;position:relative;padding:0 0 26px 52px;border-left:2px dashed var(--line);
            margin-left:16px}
.steps > li:last-child{border-left-color:transparent;padding-bottom:0}
.steps > li::before{content:counter(st);position:absolute;left:-19px;top:-2px;width:36px;height:36px;
  border-radius:50%;background:var(--accent);color:#04211d;font-weight:800;font-size:15px;
  display:grid;place-items:center;box-shadow:0 0 0 5px var(--paper)}
.steps h3{margin:0 0 6px;font-size:17px}

/* 그림 */
.fig{margin:16px 0 6px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--soft)}
.fig img{width:100%}
.fig figcaption{padding:10px 14px;font-size:13px;color:var(--muted);background:var(--paper);
                border-top:1px solid var(--line)}
.fig figcaption b{color:var(--ink-2)}
.figrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.figrow .fig{margin:16px 0 0}

/* 표 */
.tablewrap{overflow-x:auto;margin:14px 0}
table{width:100%;border-collapse:collapse;font-size:14px;min-width:440px}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
th{background:var(--soft);font-size:12.5px;font-weight:750;color:var(--muted);letter-spacing:.03em;
   white-space:nowrap}
td b{font-weight:700}

/* 강조 박스 */
.note{border-radius:12px;padding:14px 16px;margin:14px 0;font-size:14.5px;border:1px solid}
.note b{font-weight:750}
.note.tip{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 35%,transparent);color:var(--accent-ink)}
.note.warn{background:var(--warn-bg);border-color:color-mix(in srgb,var(--warn) 35%,transparent);color:var(--warn)}
.note.info{background:var(--soft);border-color:var(--line-2);color:var(--ink-2)}

/* 색 칩 */
.chip{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12.5px;font-weight:750;white-space:nowrap}
.c-good{background:var(--good-bg);color:var(--good)}
.c-warn{background:var(--warn-bg);color:var(--warn)}
.c-bad{background:var(--bad-bg);color:var(--bad)}
.c-none{background:var(--soft);color:var(--muted)}
.c-input{background:var(--input);color:#92400e;border:1px solid #f59e0b}
@media (prefers-color-scheme:dark){ .c-input{color:#fbbf24} }

/* 수식 */
.formula{background:var(--soft);border-left:3px solid var(--accent);border-radius:0 12px 12px 0;
         padding:14px 18px;margin:12px 0;font-size:14.5px;line-height:2}
.formula b{color:var(--accent-ink)}

/* 흐름도 */
.flow{display:flex;align-items:stretch;gap:10px;flex-wrap:wrap;margin:18px 0}
.flow .box{flex:1;min-width:150px;background:var(--soft);border:1px solid var(--line);border-radius:13px;
           padding:14px 16px}
.flow .box b{display:block;font-size:14.5px;margin-bottom:3px}
.flow .box span{font-size:12.5px;color:var(--muted)}
.flow .arrow{align-self:center;color:var(--faint);font-size:20px;font-weight:700}

/* FAQ */
details{border:1px solid var(--line);border-radius:12px;padding:0;margin:9px 0;background:var(--soft);overflow:hidden}
summary{cursor:pointer;padding:13px 16px;font-weight:700;font-size:14.5px;list-style:none}
summary::-webkit-details-marker{display:none}
summary::before{content:"＋ ";color:var(--accent-ink);font-weight:800}
details[open] summary::before{content:"− "}
details[open] summary{border-bottom:1px solid var(--line)}
details .body{padding:13px 16px;font-size:14.5px;background:var(--paper)}
details .body p:last-child{margin-bottom:0}

/* 체크리스트 */
.check{list-style:none;padding:0;margin:12px 0}
.check li{position:relative;padding:9px 0 9px 34px;border-bottom:1px dashed var(--line);font-size:14.5px}
.check li:last-child{border-bottom:0}
.check li::before{content:"☐";position:absolute;left:6px;top:8px;font-size:17px;color:var(--accent)}

footer{text-align:center;padding:34px 20px 20px;color:var(--faint);font-size:12.5px}

@media (max-width:640px){
  section{padding:22px 18px 26px;border-radius:14px}
  section:first-of-type{margin-top:-28px}
  .wrap{padding:0 12px 60px}
  .steps > li{padding-left:44px}
  .cover{padding:56px 18px 52px}
}
@media print{
  body{background:#fff}
  section{box-shadow:none;break-inside:avoid;page-break-inside:avoid}
  .cover{background:#0f172a !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  details{break-inside:avoid} details:not([open]) .body{display:block}
  .toc{display:none}
}
`;

const ex = tpl.menus;
const money = (n) => Number(n).toLocaleString('ko-KR');

const HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0f172a">
<title>메뉴 원가 분석 템플릿 · 사용설명서</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📘</text></svg>">
<style>${CSS}</style>
</head>
<body>

<header class="cover">
  <div class="badge">사용설명서 · MANUAL</div>
  <h1>메뉴 원가 분석 템플릿</h1>
  <p>식재료 값만 넣으면 메뉴별 원가·원가율·마진이 자동으로 계산됩니다.<br>
     설치도, 인터넷도, 엑셀 수식 지식도 필요 없습니다.</p>
  <div class="meta">HTML 파일 1개 · PC / 휴대폰 겸용 · 오프라인 동작 · ${new Date().toISOString().slice(0, 10)}</div>
</header>

<div class="wrap">

<section id="intro">
  <div class="eyebrow">한눈에 보기</div>
  <h2>이 템플릿이 하는 일</h2>
  <p class="lead">식재료 구매가격과 레시피만 넣으면, 나머지는 전부 자동으로 계산됩니다.</p>

  <div class="flow">
    <div class="box"><b>① 식재료 값 입력</b><span>구매가격 · 규격</span></div>
    <div class="arrow">→</div>
    <div class="box"><b>② 레시피 입력</b><span>재료와 사용량</span></div>
    <div class="arrow">→</div>
    <div class="box"><b>③ 자동 계산</b><span>원가 · 원가율 · 마진</span></div>
    <div class="arrow">→</div>
    <div class="box"><b>④ 엑셀 출력</b><span>수식이 살아있는 파일</span></div>
  </div>

  <div class="cards">
    <div class="tile"><b>파일 하나면 끝</b><span>더블클릭하면 브라우저에서 바로 열립니다. 설치·인터넷 불필요.</span></div>
    <div class="tile"><b>고치면 즉시 반영</b><span>식재료 값 하나만 바꿔도 관련된 모든 메뉴 원가가 다시 계산됩니다.</span></div>
    <div class="tile"><b>자동 저장</b><span>값을 고치면 알아서 저장됩니다. 저장 버튼이 없습니다.</span></div>
    <div class="tile"><b>휴대폰에서도</b><span>같은 파일이 화면 크기에 맞춰 모양을 바꿉니다.</span></div>
  </div>

  <h3>목차</h3>
  <nav class="toc">
    <a href="#start"><i>🚀</i>5분 만에 시작하기</a>
    <a href="#screens"><i>🗂</i>화면별 사용법</a>
    <a href="#recipe"><i>📋</i>레시피와 원가 상세</a>
    <a href="#calc"><i>🧮</i>원가 계산 방식</a>
    <a href="#vat"><i>🧾</i>부가세 설정 (중요)</a>
    <a href="#bulk"><i>📋</i>엑셀에서 일괄 등록</a>
    <a href="#examples"><i>💡</i>예시 3개가 보여주는 것</a>
    <a href="#save"><i>💾</i>저장 · 백업 · 기기 이동</a>
    <a href="#excel"><i>📊</i>엑셀로 내보내기</a>
    <a href="#faq"><i>❓</i>자주 묻는 질문</a>
    <a href="#checklist"><i>✅</i>도입 체크리스트</a>
  </nav>
</section>

<section id="start">
  <div class="eyebrow">STEP BY STEP</div>
  <h2>5분 만에 시작하기</h2>
  <p class="lead">템플릿에는 예시 데이터가 들어 있습니다. 아래 순서대로 우리 매장 값으로 바꾸면 됩니다.</p>

  <ol class="steps">
    <li>
      <h3>파일 열기</h3>
      <p>받은 HTML 파일을 <b>더블클릭</b>하면 기본 브라우저에서 열립니다.
         Chrome · Edge · Safari 어디서든 똑같이 동작합니다.</p>
      <div class="note tip">💡 자주 쓰신다면 바탕화면에 두거나, 브라우저에서 <b>즐겨찾기</b>에 추가해 두세요.</div>
    </li>

    <li>
      <h3>회사 이름 바꾸기</h3>
      <p><b>고정비</b> 화면 맨 아래 <b>「기본 정보」</b>에서 회사·매장 이름을 입력합니다.
         왼쪽 위 이름과 엑셀 제목에 바로 반영됩니다.</p>
      <p>같은 자리에서 <b>메뉴 카테고리</b>도 추가·삭제할 수 있습니다.
         (기본 제공: 메인 요리 · 사이드 · 음료 · 세트메뉴)</p>
    </li>

    <li>
      <h3>식재료 등록하기</h3>
      <p><b>식재료</b> 화면에서 <b>「＋ 식재료 추가」</b>를 누르고 이름 · 구매가격 · 총중량을 넣습니다.</p>
      <div class="note info">
        <b>총중량은 "포장 하나에 몇 g이 들었나"</b>입니다.<br>
        예) 20kg 쌀 한 포대 62,000원 → 구매가격 <code>62000</code>, 총중량 <code>20000</code> → g당 3.1원
      </div>
      ${figure('ing', '식재료 화면', '노란 칸만 채우면 오른쪽 g당 단가가 자동으로 나옵니다')}
      <div class="note tip">
        💡 <b>재료가 많다면 하나씩 넣지 마세요.</b> 아래쪽 <b>「📋 엑셀에서 일괄 등록」</b> 으로
        엑셀에서 복사해 한 번에 넣을 수 있습니다. (<a href="#bulk">자세히</a>)
      </div>
    </li>

    <li>
      <h3>부가세 설정 확인하기 <span class="chip c-bad">필수</span></h3>
      <p><b>고정비</b> 화면의 <b>「부가세 처리」</b>에서 우리 매장에 맞는 것을 고릅니다.
         기본값은 <b>「부가세 포함」</b>(일반과세 · 대부분의 식당)입니다.</p>
      <p>이 설정 하나로 원가율이 달라집니다. 자세한 내용은
         <a href="#vat">부가세 설정</a> 항목을 꼭 읽어 주세요.</p>
    </li>

    <li>
      <h3>고정비와 월매출 넣기</h3>
      <p><b>고정비</b> 화면에서 인건비 · 임대료 등 월 고정비와 <b>월 추정매출</b>을 우리 매장 값으로 바꿉니다.
         이 둘로 <b>고정비 배분율</b>이 정해지고, 메뉴마다 판매가에 비례해 고정비가 나눠 붙습니다.</p>
      ${figure('fix', '고정비 화면', '「배분 포함」 체크를 끄면 그 항목은 메뉴 원가에 반영되지 않습니다')}
      <div class="note warn">
        ⚠️ <b>식재료 매입비는 「제외」로 두세요.</b> 메뉴별 식재료 원가에 이미 들어가 있어서,
        고정비에도 넣으면 같은 돈을 두 번 세게 됩니다. 템플릿은 처음부터 제외로 설정되어 있습니다.
      </div>
    </li>

    <li>
      <h3>메뉴 등록하기</h3>
      <p><b>메뉴</b> 화면 아래 입력칸에 <b>메뉴 이름 · 카테고리 · 판매가</b>를 넣고
         <b>「＋ 메뉴 추가」</b>를 누르면 상세 화면이 바로 열립니다.
         거기서 <b>「＋ 재료 추가」</b>로 레시피를 채우세요.</p>
      ${figure('menu', '메뉴 화면', '표 아래쪽이 새 메뉴를 넣는 자리입니다')}
    </li>

    <li>
      <h3>예시 데이터 지우기</h3>
      <p>사용법을 다 익히셨으면 예시로 들어 있는
         <b>${ex.map((m) => m.name).join(' · ')}</b> 를 지우세요.
         각 줄 오른쪽 <b>✕</b> 또는 메뉴 상세 맨 아래 <b>「이 메뉴 삭제」</b>를 누르면 됩니다.</p>
      <div class="note tip">
        💡 지우기 전에 <b>백업</b> 버튼으로 파일을 하나 받아 두면, 언제든 예시 상태로 돌아갈 수 있습니다.
      </div>
    </li>
  </ol>
</section>

<section id="screens">
  <div class="eyebrow">화면 안내</div>
  <h2>화면별 사용법</h2>
  <p class="lead">왼쪽 메뉴(휴대폰은 아래쪽 탭)로 6개 화면을 오갑니다.</p>

  <h3>📊 대시보드 — 전체 현황</h3>
  <p>평균 원가율 · 마진율, 판정 현황, 카테고리별 분석, 그리고
     <b>개선 우선순위 TOP 10</b>(원가율이 높은 메뉴)과 <b>효자 메뉴 TOP 10</b>을 보여줍니다.
     목록의 메뉴를 누르면 바로 상세로 갑니다.</p>
  ${figure('dash', '대시보드', '값을 하나라도 고치면 이 화면의 숫자도 함께 바뀝니다')}

  <h3>🍽 메뉴 — 원가·마진 한눈에</h3>
  <p>검색 · 카테고리 · 판정으로 걸러 보고, 원가율 높은 순 · 마진 큰 순 등으로 정렬할 수 있습니다.
     <b>판매가는 표에서 바로 고칠 수 있습니다.</b></p>

  <h3>🥬 식재료 · 🧪 프렙 · 💰 고정비</h3>
  <div class="tablewrap"><table>
    <tr><th>화면</th><th>넣는 값</th><th>자동으로 나오는 값</th></tr>
    <tr><td><b>식재료</b></td><td>구매가격 · 규격 · 총중량(g)</td><td>g당 단가</td></tr>
    <tr><td><b>프렙</b></td><td>투입 재료와 투입량 · 완성중량(g)</td><td>총 재료비 · g당 원가</td></tr>
    <tr><td><b>고정비</b></td><td>항목별 월 금액 · 월 추정매출</td><td>고정비 배분율</td></tr>
  </table></div>
  ${figure('prep', '프렙(반제품) 화면', '소스처럼 한 번에 많이 만들어 두는 것은 여기에 등록하면 g당 원가가 계산됩니다')}

  <h3>⚠️ 점검 — 빠진 값 찾기</h3>
  <p>판매가가 비었거나 단가가 0원인 항목을 모아 보여줍니다.
     처음에는 <b>시작하기 안내</b>가 들어 있으니 순서대로 따라 하시면 됩니다.</p>
  ${figure('issue', '점검 화면', '항목을 누르면 해당 메뉴로 바로 이동합니다')}

  <h3>📱 휴대폰에서는</h3>
  <p>같은 파일이 화면 크기에 맞춰 <b>표 대신 카드</b>, <b>왼쪽 메뉴 대신 아래쪽 탭</b>으로 바뀝니다.
     보기만 하는 게 아니라 <b>값 수정도 그대로 됩니다.</b></p>
  <div class="figrow">
    ${figure('m-dash', '휴대폰 · 대시보드')}
    ${figure('m-menu', '휴대폰 · 메뉴 목록')}
    ${figure('m-detail', '휴대폰 · 메뉴 상세')}
  </div>
</section>

<section id="recipe">
  <div class="eyebrow">핵심 화면</div>
  <h2>메뉴를 누르면 레시피가 나옵니다</h2>
  <p class="lead">메뉴 목록에서 아무 메뉴나 누르면 오른쪽에서 상세가 열립니다.
     레시피 · 재료별 원가 · 조리법이 한 화면에 있습니다.</p>

  ${figure('detail', '메뉴 상세 — 윗부분', '판매가를 고치면 원가율·마진이 즉시 다시 계산됩니다')}

  <h3>재료 한 줄에 들어가는 것</h3>
  <div class="tablewrap"><table>
    <tr><th>칸</th><th>설명</th></tr>
    <tr><td><b>구분</b></td><td>식재료 · 프렙 · 메뉴 · 무료 중에서 고릅니다 (아래 표 참고)</td></tr>
    <tr><td><b>재료 이름</b></td><td>등록된 목록에서 고릅니다. 목록에 없으면 먼저 식재료 화면에서 등록하세요.</td></tr>
    <tr><td><b>사용량</b></td><td>1인분에 들어가는 g 수</td></tr>
    <tr><td><b>수율%</b></td><td>손질하고 남는 비율. 껍질을 벗겨 15%가 버려지면 <code>85</code></td></tr>
    <tr><td><b>g당 단가</b></td><td>자동 계산 (식재료·프렙 화면에서 가져옴)</td></tr>
    <tr><td><b>재료비</b></td><td>자동 계산</td></tr>
  </table></div>

  <h3>「구분」 네 가지</h3>
  <div class="tablewrap"><table>
    <tr><th>구분</th><th>언제 쓰나</th><th>원가 계산</th></tr>
    <tr><td><b>식재료</b></td><td>사서 그대로 쓰는 재료</td><td>사용량 ÷ 수율 × g당 단가</td></tr>
    <tr><td><b>프렙</b></td><td>미리 만들어 둔 소스·반제품</td><td>사용량 ÷ 수율 × 프렙 g당 원가</td></tr>
    <tr><td><b>메뉴</b></td><td>세트에 들어가는 다른 단품</td><td>수량 × 그 메뉴의 식재료 원가</td></tr>
    <tr><td><b>무료</b></td><td>수돗물 등 돈이 들지 않는 것</td><td>0원</td></tr>
  </table></div>

  ${figure('detail2', '메뉴 상세 — 아랫부분', '조리법은 한 줄에 한 단계씩 적으면 번호가 자동으로 매겨집니다')}

  <div class="note tip">
    💡 <b>조리법과 가니쉬도 여기서 바로 적습니다.</b> 원가표이자 레시피북으로 함께 쓸 수 있어,
    신입 직원 교육 자료로도 그대로 활용됩니다.
  </div>
</section>

<section id="calc">
  <div class="eyebrow">계산 원리</div>
  <h2>원가는 이렇게 계산됩니다</h2>
  <p class="lead">복잡해 보여도 곱하기·나누기뿐입니다. 한 번만 이해하시면 숫자를 믿고 쓰실 수 있습니다.</p>

  <div class="formula">
    <b>g당 단가</b> = 구매가격 ÷ 총중량(g)<br>
    <b>재료비</b> = 사용량 ÷ 수율 × g당 단가<br>
    <b>프렙 g당 원가</b> = 프렙 총 재료비 ÷ 완성중량(g)<br>
    <b>식재료 원가</b> = 그 메뉴 재료비의 합계<br>
    <b>공급가액</b> = 판매가 ÷ 1.1 &nbsp;<span style="color:var(--muted)">(부가세 포함일 때)</span><br>
    <b>고정비 배분</b> = 공급가액 × (배분대상 고정비 ÷ 월매출 공급가액)<br>
    <b>총원가</b> = 식재료 원가 + 고정비 배분<br>
    <b>마진</b> = 공급가액 − 총원가
  </div>
  <div class="note warn">
    ⚠️ 원가율·마진율은 판매가가 아니라 <b>공급가액</b> 기준입니다.
    부가세는 매장 매출이 아니라 잠시 맡아 두는 돈이기 때문입니다. (<a href="#vat">자세히</a>)
  </div>

  <h3>예시로 따라가 보기 — ${ex[0].name}</h3>
  <p>템플릿의 <b>닭가슴살</b>은 1kg에 12,000원, 사용량 100g, 수율 90%입니다.</p>
  <div class="formula">
    g당 단가 = 12,000 ÷ 1,000 = <b>12원</b><br>
    재료비 = 100 ÷ 0.9 × 12 = <b>1,333원</b>
  </div>
  <p class="small">수율 90%란 손질하면서 10%가 버려진다는 뜻입니다.
     실제로 100g을 쓰려면 111g을 사야 하므로, 그만큼 원가를 더 잡습니다.</p>

  <h3>수율을 왜 넣나</h3>
  <p>껍질·뼈·다듬어 버리는 부분을 빼지 않으면 원가가 실제보다 싸게 나옵니다.
     버리는 게 없으면 <b>100</b>을 그대로 두시면 됩니다.</p>

  <h3>고정비 배분, 왜 메뉴마다 금액이 다른가요?</h3>
  <p>인건비·임대료 같은 고정비는 특정 메뉴 하나를 위해 쓰는 돈이 아니라 매장 전체를 운영하는 데 드는 돈입니다.
     그래서 이 프로그램은 <b>메뉴의 공급가액(판매가에서 부가세를 뺀 금액)에 비례</b>해서 나눠 붙입니다 —
     매출에서 차지하는 몫이 큰 메뉴일수록, 고정비도 그만큼 더 많이 짊어지는 방식입니다.</p>

  <div class="formula">
    ① 배분 대상 고정비 = 「배분 포함」 체크된 항목의 합계<br>
    ② 고정비 배분율 = 배분 대상 고정비 ÷ 월매출(공급가액)<br>
    ③ 메뉴별 고정비 배분액 = 그 메뉴의 공급가액 × 고정비 배분율
  </div>
  <p class="small">
    <b>월 추정매출</b>은 메뉴 판매가를 자동으로 더한 값이 아니라, <b>고정비</b> 화면에서 직접 입력하는 값입니다.
    POS의 실제(또는 예상) 월 매출을 넣어야 배분율이 정확해집니다.
  </p>

  <p>템플릿 예시로 직접 따라가 보겠습니다. (고정비 화면 기본값)</p>
  <div class="tablewrap"><table>
    <tr><th>고정비 항목</th><th>월 금액</th><th>배분 포함</th></tr>
    <tr><td>인건비</td><td>8,000,000원</td><td>✅</td></tr>
    <tr><td>임대료</td><td>3,000,000원</td><td>✅</td></tr>
    <tr><td>공과금</td><td>800,000원</td><td>✅</td></tr>
    <tr><td>배달·광고 수수료</td><td>1,500,000원</td><td>✅</td></tr>
    <tr><td>식재료 매입비</td><td>6,000,000원</td><td>❌ 제외 (이중 계산 방지)</td></tr>
  </table></div>

  <div class="formula">
    배분 대상 고정비 = 8,000,000 + 3,000,000 + 800,000 + 1,500,000 = <b>13,300,000원</b><br>
    월매출(공급가액) = 30,000,000 ÷ 1.1 = <b>27,272,727원</b><br>
    고정비 배분율 = 13,300,000 ÷ 27,272,727 ≈ <b>48.8%</b>
  </div>

  <p>이 <b>48.8%</b>를 메뉴마다 <b>각자의 공급가액</b>에 곱하면 끝입니다 — 배분율은 모든 메뉴에 똑같이 적용되지만,
     곱해지는 공급가액이 메뉴마다 다르니 결과 금액도 달라지는 것입니다.</p>

  <div class="tablewrap"><table>
    <tr><th>메뉴</th><th>판매가</th><th>공급가액</th><th>고정비 배분 (× 48.8%)</th></tr>
    <tr><td>감자 크림 수프</td><td>5,000원</td><td>4,545원</td><td><b>약 2,217원</b></td></tr>
    <tr><td>치킨 볶음밥</td><td>9,000원</td><td>8,182원</td><td><b>약 3,990원</b></td></tr>
    <tr><td>런치 세트</td><td>12,000원</td><td>10,909원</td><td><b>약 5,320원</b></td></tr>
  </table></div>

  <p class="small">판매가가 높을수록 공급가액도 크고, 곱해지는 배분율(48.8%)은 모든 메뉴에 동일하므로
     <b>비싼 메뉴일수록 고정비를 더 많이 짊어지는 구조</b>입니다. 조리 시간이나 손이 얼마나 가는지는
     반영하지 않는, 매출 비중을 기준으로 한 단순하고 투명한 배분 방식입니다.</p>

  <div class="note info">
    💡 이 방식은 계산이 쉽고 이해하기 쉽다는 장점이 있습니다. 다만 유독 조리 시간이 오래 걸리거나
    손이 많이 가는 메뉴가 있다면, 그 메뉴의 실제 부담은 이 배분액보다 클 수 있다는 점을 참고해 주세요.
    고정비 항목별 「배분 포함」 여부와 월 추정매출은 <b>고정비</b> 화면에서 언제든 우리 매장 실정에 맞게
    조정할 수 있습니다.
  </div>

  <h3>판정 색깔의 뜻</h3>
  <div class="tablewrap"><table>
    <tr><th>표시</th><th>기준 (식재료 원가율)</th><th>뜻</th></tr>
    <tr><td><span class="chip c-good">✅ 양호</span></td><td>목표 이하 (기본 30%)</td><td>수익성이 확보된 메뉴</td></tr>
    <tr><td><span class="chip c-warn">🟡 주의</span></td><td>목표 초과 ~ 주의선 (기본 38%)</td><td>지켜봐야 할 메뉴</td></tr>
    <tr><td><span class="chip c-bad">🔴 과다</span></td><td>주의선 초과</td><td>레시피나 판매가 재검토 필요</td></tr>
    <tr><td><span class="chip c-none">⬜ 미입력</span></td><td>판매가가 0원</td><td>판매가를 넣어야 계산됩니다</td></tr>
  </table></div>
  <p class="small">기준값(30% · 38%)은 <b>고정비</b> 화면에서 우리 업장에 맞게 바꿀 수 있습니다.</p>

  <div class="note info">
    <b>노란 칸은 직접 넣는 값, 나머지는 자동 계산입니다.</b>
    화면 어디서든 <span class="chip c-input">노란 배경</span>이면 고칠 수 있다는 뜻입니다.
  </div>
</section>

<section id="vat">
  <div class="eyebrow">가장 중요한 설정</div>
  <h2>부가세 설정 — 이걸 틀리면 원가율이 틀립니다</h2>
  <p class="lead">원가 계산에서 가장 많이 놓치는 부분입니다. 5분만 읽어 주세요.</p>

  <h3>왜 중요한가</h3>
  <p>손님이 <b>9,000원</b>을 냈다고 해서 매장에 9,000원이 남는 게 아닙니다.
     일반과세 사업자라면 그중 <b>10%는 부가세</b>로, 결국 나라에 냅니다.</p>

  <div class="formula">
    손님이 낸 돈 <b>9,000원</b><br>
    − 부가세 &nbsp;818원<br>
    = 매장에 남는 돈(공급가액) <b>8,182원</b>
  </div>

  <p>원가율은 <b>공급가액을 기준으로</b> 봐야 맞습니다. 판매가로 계산하면 원가율이 실제보다 낮게 나옵니다.</p>

  <div class="tablewrap"><table>
    <tr><th>구분</th><th>계산</th><th>결과</th></tr>
    <tr><td>판매가 기준 (틀림)</td><td>2,339 ÷ 9,000</td><td>26.0%</td></tr>
    <tr><td><b>공급가액 기준 (맞음)</b></td><td>2,339 ÷ 8,182</td><td><b>28.6%</b></td></tr>
  </table></div>

  <div class="note warn">
    ⚠️ 목표 원가율이 30%라면, <b>26%(양호)로 보이던 메뉴가 실제로는 28.6%</b> 로 아슬아슬합니다.
    이 차이 때문에 「양호」와 「주의」 판정이 뒤집히는 메뉴가 생깁니다.
  </div>

  <h3>세 가지 중에서 고르세요</h3>
  <div class="tablewrap"><table>
    <tr><th>선택</th><th>이런 경우</th><th>계산 방식</th></tr>
    <tr><td><b>부가세 포함</b><br><span class="small">(기본값)</span></td>
        <td>메뉴판 가격이 손님이 내는 금액 — <b>대부분의 식당</b></td>
        <td>판매가 ÷ 1.1 = 공급가액</td></tr>
    <tr><td><b>부가세 별도</b></td><td>판매가를 이미 공급가액으로 관리하는 경우</td>
        <td>판매가 = 공급가액</td></tr>
    <tr><td><b>면세 사업자</b></td><td>부가세 면제 대상</td><td>판매가 = 공급가액</td></tr>
  </table></div>

  <div class="note info">
    <b>월 추정매출도 같은 기준으로 넣으세요.</b> 「부가세 포함」을 골랐다면 POS에 찍히는
    부가세 포함 매출을 그대로 넣으면 됩니다. 프로그램이 알아서 나눠 계산합니다.
  </div>
  ${figure('fix', '고정비 화면의 부가세 설정', '설정을 바꾸면 전체 메뉴의 원가율이 즉시 다시 계산됩니다')}
</section>

<section id="bulk">
  <div class="eyebrow">시간 절약</div>
  <h2>엑셀에서 복사해 한 번에 등록하기</h2>
  <p class="lead">식재료 100종을 하나씩 넣을 필요 없습니다. 엑셀에서 복사해 붙여넣으면 끝입니다.</p>

  <h3>식재료 일괄 등록</h3>
  <ol>
    <li><b>식재료</b> 화면 아래 <b>「📋 엑셀에서 일괄 등록」</b> 클릭</li>
    <li>엑셀에서 아래 순서로 5개 열을 <b>선택해 복사(Ctrl+C)</b></li>
    <li>입력창에 <b>붙여넣기(Ctrl+V)</b> → 미리보기 확인 → <b>「등록하기」</b></li>
  </ol>

  <div class="tablewrap"><table>
    <tr><th>식재료명</th><th>구매가격</th><th>규격수량</th><th>단위</th><th>총중량(g)</th></tr>
    <tr><td>닭가슴살</td><td>12000</td><td>1</td><td>kg</td><td>1000</td></tr>
    <tr><td>양파</td><td>14000</td><td>15</td><td>kg</td><td>15000</td></tr>
    <tr><td>계란</td><td>9000</td><td>30</td><td>개</td><td>1800</td></tr>
  </table></div>

  ${figure('import', '일괄 등록 미리보기', '등록 전에 몇 건이 추가되고 몇 건이 갱신되는지 먼저 보여 줍니다')}

  <div class="cards">
    <div class="tile"><b>맨 윗줄 제목 자동 인식</b><span>「식재료명·구매가격…」 같은 제목 줄은 알아서 건너뜁니다.</span></div>
    <div class="tile"><b>「28,000원」도 인식</b><span>쉼표와 「원」이 붙어 있어도 숫자만 읽습니다.</span></div>
    <div class="tile"><b>이미 있는 이름은 갱신</b><span>같은 이름이 있으면 새로 만들지 않고 값만 바꿉니다. 단가 일괄 갱신에 쓰세요.</span></div>
    <div class="tile"><b>이상한 줄은 건너뜀</b><span>이름이 비었거나 중복된 줄은 이유와 함께 알려 주고 넘어갑니다.</span></div>
  </div>

  <h3>메뉴 일괄 등록</h3>
  <p><b>메뉴</b> 화면 아래 <b>「📋 일괄 등록」</b> 에서 <b>메뉴명 · 카테고리 · 판매가</b> 3개 열을 붙여넣으면
     메뉴가 한 번에 만들어집니다. 없는 카테고리는 자동으로 생성됩니다.
     레시피는 그다음 메뉴를 눌러 채우시면 됩니다.</p>

  <div class="note tip">
    💡 <b>단가가 오를 때도 유용합니다.</b> 거래처에서 받은 단가표를 그대로 붙여넣으면
    기존 식재료 가격이 한 번에 갱신되고, 전체 메뉴 원가가 즉시 다시 계산됩니다.
  </div>
</section>

<section id="examples">
  <div class="eyebrow">예시 데이터</div>
  <h2>예시 ${ex.length}개가 보여주는 것</h2>
  <p class="lead">템플릿에 들어 있는 예시는 각각 다른 사용법을 보여 주려고 넣은 것입니다.</p>

  <div class="tablewrap"><table>
    <tr><th>예시 메뉴</th><th>판매가</th><th>무엇을 보여주나</th></tr>
    <tr><td><b>${ex[0].name}</b></td><td>${money(ex[0].price)}원</td>
        <td>일반 <b>식재료</b>와 미리 만들어 둔 <b>프렙(기본 볶음 소스)</b>을 함께 쓰는 가장 흔한 형태</td></tr>
    <tr><td><b>${ex[1].name}</b></td><td>${money(ex[1].price)}원</td>
        <td>껍질을 벗겨 버리는 <b>수율 85%</b> 처리와, 돈이 들지 않는 수돗물의 <b>무료</b> 처리</td></tr>
    <tr><td><b>${ex[2].name}</b></td><td>${money(ex[2].price)}원</td>
        <td>다른 메뉴를 구성품으로 넣는 <b>세트메뉴</b> — 단품 원가가 자동 합산됩니다</td></tr>
  </table></div>

  ${figure('set', '세트메뉴 예시', '구분을 「메뉴」로 하면 그 단품의 식재료 원가를 그대로 가져옵니다')}

  <div class="note tip">
    💡 <b>세트메뉴의 장점</b> — 나중에 ${ex[0].name}의 재료값이 오르면,
    세트 원가도 자동으로 함께 올라갑니다. 따로 고칠 필요가 없습니다.
  </div>
</section>

<section id="save">
  <div class="eyebrow">데이터 관리</div>
  <h2>저장 · 백업 · 다른 PC로 옮기기</h2>

  <h3>저장 버튼이 없습니다 — 자동 저장입니다</h3>
  <p>값을 고치면 <b>약 0.7초 뒤 자동으로 저장</b>되고, 왼쪽 아래(휴대폰은 오른쪽 위)에
     <b>「자동 저장됨 · 시각」</b>이 표시됩니다. 그냥 창을 닫아도 값이 남습니다.</p>
  <div class="note warn">
    ⚠️ <b>빨간 띠가 뜨면</b> 브라우저가 저장을 거부하는 상태입니다(시크릿/비공개 모드 등).
    이때는 값이 남지 않으니 반드시 <b>백업</b>으로 파일을 받아 두세요.
  </div>

  <h3>세 개의 버튼</h3>
  <div class="tablewrap"><table>
    <tr><th>버튼</th><th>하는 일</th><th>언제 쓰나</th></tr>
    <tr><td><b>이 값 그대로 파일 저장</b></td>
        <td>지금 값까지 통째로 담은 HTML 파일을 만듭니다</td>
        <td>다른 PC로 옮길 때 — <b>파일 하나만 보내면 됩니다</b></td></tr>
    <tr><td><b>백업</b></td><td>값만 담은 작은 JSON 파일을 받습니다</td>
        <td>주기적인 안전 보관용</td></tr>
    <tr><td><b>복원</b></td><td>백업 JSON을 다시 불러옵니다</td>
        <td>실수로 지웠을 때 · 다른 기기에서 이어 쓸 때</td></tr>
  </table></div>

  <h3>다른 PC로 옮기는 방법</h3>
  <p><b>HTML 파일만 복사하면 원본(예시) 값으로 열립니다.</b> 고친 값은 브라우저 안에 저장되기 때문입니다.
     값까지 함께 옮기려면:</p>
  <ol>
    <li>쓰던 PC에서 <b>「이 값 그대로 파일 저장」</b> 클릭</li>
    <li>만들어진 HTML 파일을 USB · 메신저 · 메일로 새 PC에 전달</li>
    <li>새 PC에서 더블클릭 → 고친 값 그대로 열립니다</li>
  </ol>
  <div class="note info">
    <b>값이 겹치면?</b> 파일에 담긴 값과 그 PC에 저장된 값 중 <b>더 최근에 저장된 쪽</b>이 자동으로 선택됩니다.
    새 PC에서는 받아온 값이, 쓰던 PC에서는 그동안 고친 값이 자연스럽게 이어집니다.
  </div>

  <h3>여러 사람이 같은 값을 봐야 한다면</h3>
  <p>단일 파일은 <b>기기마다 따로</b> 저장됩니다. 사무실 PC와 주방 태블릿이 항상 같은 값을 봐야 한다면
     웹 서버(Render 등)에 올려 쓰는 방식이 필요합니다. 이 경우 값은 서버에 저장되어 자동으로 공유됩니다.</p>
</section>

<section id="excel">
  <div class="eyebrow">출력</div>
  <h2>엑셀로 내보내기</h2>
  <p class="lead"><b>「엑셀 내려받기」</b>를 누르면 지금 화면의 값 그대로 엑셀 파일이 만들어집니다.
     인터넷이 없어도 됩니다.</p>

  <div class="tablewrap"><table>
    <tr><th>시트</th><th>내용</th></tr>
    <tr><td>📘 사용안내</td><td>구조 · 색상 규칙 · 계산식</td></tr>
    <tr><td>⑥ 분석 대시보드</td><td>KPI · 카테고리 분석 · 원가율 상위/하위 10</td></tr>
    <tr><td>④ 메뉴 원가표</td><td>전체 메뉴 요약 (필터 · 정렬 가능)</td></tr>
    <tr><td>⑤ 레시피 상세</td><td>재료 한 줄씩 — 한 가지 서식으로 통일</td></tr>
    <tr><td>① 식재료 단가</td><td>구매가격 → g당 단가</td></tr>
    <tr><td>② 프렙 원가</td><td>반제품 총 재료비 → g당 원가</td></tr>
    <tr><td>③ 고정비 설정</td><td>고정비 · 월매출 · 판정 기준</td></tr>
    <tr><td>⚠ 확인 필요</td><td>비었거나 확인이 필요한 값</td></tr>
  </table></div>

  <div class="note tip">
    💡 <b>엑셀 안의 수식이 살아 있습니다.</b> 엑셀에서 식재료 가격만 바꿔도
    전체 메뉴 원가가 다시 계산됩니다. 회계사무소·본사에 그대로 보내셔도 됩니다.
  </div>
  <div class="note info">
    모든 나눗셈과 조회에 오류 방지 처리가 되어 있어,
    값이 비거나 이름을 바꿔도 <code>#DIV/0!</code> · <code>#N/A</code> 같은 오류가 뜨지 않습니다.
  </div>
</section>

<section id="faq">
  <div class="eyebrow">FAQ</div>
  <h2>자주 묻는 질문</h2>

  <details><summary>인터넷이 없어도 되나요?</summary>
    <div class="body"><p>네. 파일 안에 모든 것이 들어 있어 외부로 나가는 통신이 전혀 없습니다.
    매장 와이파이가 끊겨도 그대로 쓰실 수 있습니다.</p></div></details>

  <details><summary>엑셀이 설치되어 있어야 하나요?</summary>
    <div class="body"><p>아니요. 브라우저만 있으면 됩니다. 엑셀은 「엑셀 내려받기」로 받은 파일을
    열어 볼 때만 필요합니다.</p></div></details>

  <details><summary>재료를 몇 개까지 넣을 수 있나요?</summary>
    <div class="body"><p>실무상 제한은 없습니다. 식재료 수백 종, 메뉴 백여 개도 문제없이 동작합니다.</p></div></details>

  <details><summary>실수로 지웠는데 되돌릴 수 있나요?</summary>
    <div class="body"><p>되돌리기 기능은 없습니다. 대신 <b>백업</b>으로 받아 둔 JSON 파일을
    <b>복원</b>하면 그 시점으로 돌아갑니다. 큰 작업 전에는 백업을 먼저 받아 두세요.</p>
    <p>예시 데이터만 되살리려면 <b>「수정값 초기화」</b>를 누르면 처음 상태로 돌아갑니다.</p></div></details>

  <details><summary>g이 아니라 개수로 세는 재료는 어떻게 하나요?</summary>
    <div class="body"><p>총중량 칸에 <b>1개의 무게</b>를 넣으면 됩니다.
    예) 계란 1판(30구) 9,000원, 1개 60g → 구매가격 <code>9000</code>, 총중량 <code>1800</code> → g당 5원.
    레시피에서 계란 1개를 쓰면 사용량 <code>60</code>.</p></div></details>

  <details><summary>고정비 배분율이 너무 높게 나옵니다</summary>
    <div class="body"><p><b>월 추정매출</b>이 실제보다 낮게 들어갔거나,
    고정비에 <b>식재료 매입비</b>가 「포함」으로 되어 있을 가능성이 큽니다.
    식재료비는 메뉴 원가에 이미 반영되므로 「제외」가 맞습니다.</p></div></details>

  <details><summary>같은 재료인데 매입처마다 가격이 다릅니다</summary>
    <div class="body"><p>「양파(A거래처)」「양파(B거래처)」처럼 나눠 등록하거나,
    평균 단가 하나로 관리하시면 됩니다. 가격이 바뀔 때 한 곳만 고치면 전체가 다시 계산됩니다.</p></div></details>

  <details><summary>부가세 포함인지 별도인지 어떻게 아나요?</summary>
    <div class="body"><p>메뉴판에 적힌 가격이 손님이 실제로 내는 금액이라면 <b>「부가세 포함」</b> 입니다.
    일반적인 식당은 거의 전부 여기에 해당합니다. 간이과세자·면세사업자라면
    세무 담당자에게 확인 후 「면세 사업자」를 고르세요.</p></div></details>

  <details><summary>재료가 200개인데 다 손으로 넣어야 하나요?</summary>
    <div class="body"><p>아니요. <b>「📋 엑셀에서 일괄 등록」</b> 에 엑셀 범위를 복사해 붙여넣으면 한 번에 들어갑니다.
    거래처 단가표를 그대로 붙여넣어 <b>가격만 일괄 갱신</b>하는 것도 됩니다.</p></div></details>

  <details><summary>상업적으로 사용해도 되나요?</summary>
    <div class="body"><p>구매 조건에 따릅니다. 이 프로그램은 엑셀 생성을 위해 오픈소스(ExcelJS, MIT)를 포함하며,
    해당 저작권 고지는 <b>고정비 화면 맨 아래 「라이선스 · 오픈소스 고지」</b> 에서 확인할 수 있습니다.
    재배포 시 이 고지가 함께 제공되어야 합니다.</p></div></details>

  <details><summary>휴대폰에서도 값을 고칠 수 있나요?</summary>
    <div class="body"><p>네. 보기 전용이 아니라 PC와 똑같이 수정·저장·엑셀 출력까지 됩니다.
    다만 저장은 그 휴대폰 브라우저에 되므로, PC와 값을 맞추려면 백업/복원을 쓰세요.</p></div></details>
</section>

<section id="checklist">
  <div class="eyebrow">도입 체크리스트</div>
  <h2>처음 세팅할 때 확인할 것</h2>
  <ul class="check">
    <li>회사·매장 이름을 우리 이름으로 바꿨다</li>
    <li>메뉴 카테고리를 우리 매장에 맞게 정리했다</li>
    <li>자주 쓰는 식재료를 구매가격·총중량과 함께 등록했다 (일괄 등록 활용)</li>
    <li>미리 만들어 두는 소스·반제품을 프렙으로 등록했다</li>
    <li><b>부가세 처리</b>를 우리 사업자 유형에 맞게 설정했다</li>
    <li>월 고정비와 월 추정매출을 실제 값으로 넣었다</li>
    <li>식재료 매입비는 고정비 배분에서 「제외」로 두었다</li>
    <li>목표 원가율·주의 원가율을 우리 기준으로 정했다</li>
    <li>메뉴를 등록하고 레시피(재료·사용량·수율)를 넣었다</li>
    <li>손질 손실이 있는 재료에 수율을 반영했다</li>
    <li>예시 메뉴 ${ex.length}개를 지웠다</li>
    <li>점검 화면에 남은 항목이 없는지 확인했다</li>
    <li>백업 파일을 받아 안전한 곳에 보관했다</li>
  </ul>

  <div class="note tip">
    💡 <b>운영 요령</b> — 식재료 가격은 매입 단가가 바뀔 때마다,
    고정비와 월매출은 <b>분기에 한 번</b> 정도 손보시면 충분합니다.
    바꾼 뒤에는 대시보드의 평균 원가율이 어떻게 움직였는지 확인해 보세요.
  </div>
</section>

</div>

<footer>
  메뉴 원가 분석 템플릿 · 사용설명서<br>
  이 문서는 파일 하나로 되어 있어 인터넷 없이도 그림까지 그대로 보입니다.
</footer>

</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, HTML, 'utf8');
console.log('✅  사용설명서 생성 완료');
console.log('   ', OUT);
console.log('   ', (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB · 그림 ' + Object.values(FIG).filter(Boolean).length + '장');

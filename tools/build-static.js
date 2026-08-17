/* 정적 배포(Render Static Site)용 파일 모으기
   public/ 하나만 올리면 서버 없이 동작하도록 필요한 파일을 복사한다. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');

/* 배포에 실을 데이터 선택
   기본: data/dataset.json (에베레스트)
   데모/판매용 템플릿으로 배포하려면  DATASET=data/template.json npm run build:static */
const DATASET = process.env.DATASET || 'data/dataset.json';

const copies = [
  [DATASET,                                    'public/dataset.json'],
  ['shared/calc.js',                           'public/calc.js'],
  ['tools/build-xlsx.js',                      'public/build-xlsx.js'],
  ['node_modules/exceljs/dist/exceljs.bare.min.js', 'public/vendor/exceljs.min.js'],
];

console.log('배포 데이터:', DATASET);
for (const [from, to] of copies) {
  const src = path.join(ROOT, from), dst = path.join(ROOT, to);
  if (!fs.existsSync(src)) { console.error('✗ 원본 없음:', from); process.exit(1); }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log('✓', to, (fs.statSync(dst).size / 1024).toFixed(0) + 'KB');
}

// 엑셀 파일과 단일 HTML 파일도 최신으로 다시 생성
const runArgsEarly = (f, args) => require('child_process')
  .execFileSync(process.execPath, [path.join(ROOT, f), ...args], { stdio: 'inherit' });
// 에베레스트 실데이터 산출물
runArgsEarly('tools/build-xlsx.js', ['public/downloads/에베레스트_원가분석서.xlsx']);
runArgsEarly('tools/build-single.js', ['public/downloads/에베레스트_원가분석_단일파일.html', 'data/dataset.json']);
// 범용 템플릿 · 사용설명서
runArgsEarly('tools/build-single.js', ['public/downloads/원가분석_템플릿.html', 'data/template.json']);
runArgsEarly('tools/build-manual.js', []);
console.log('\n정적 배포 준비 완료 → public/ 폴더를 그대로 올리면 됩니다.');

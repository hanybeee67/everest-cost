/* 정적 배포(Render Static Site)용 파일 모으기
   public/ 하나만 올리면 서버 없이 동작하도록 필요한 파일을 복사한다. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');

const copies = [
  ['data/dataset.json',                        'public/dataset.json'],
  ['shared/calc.js',                           'public/calc.js'],
  ['tools/build-xlsx.js',                      'public/build-xlsx.js'],
  ['node_modules/exceljs/dist/exceljs.bare.min.js', 'public/vendor/exceljs.min.js'],
];

for (const [from, to] of copies) {
  const src = path.join(ROOT, from), dst = path.join(ROOT, to);
  if (!fs.existsSync(src)) { console.error('✗ 원본 없음:', from); process.exit(1); }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log('✓', to, (fs.statSync(dst).size / 1024).toFixed(0) + 'KB');
}

// 엑셀 파일도 최신으로 다시 생성
require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'tools/build-xlsx.js')], { stdio: 'inherit' });
console.log('\n정적 배포 준비 완료 → public/ 폴더를 그대로 올리면 됩니다.');

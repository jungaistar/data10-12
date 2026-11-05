// 헤드리스 브라우저로 주요 흐름 점검 (선택 — playwright-core 가 있는 PC 에서만)
//   PLAYWRIGHT_CORE=/경로/node_modules/playwright-core node scripts/check-browser.mjs
// file:// 로 index.html 을 열어 1단계 저장(v1) 옮기기 → 샘플 → 10개 화면 → 모델별 이력(묶음·PDF 보기·붙이기·바꾸기·빼기·과거 이력·중지)
// → 관리대장 단계 바꾸기 → 샘플 엑셀 가져오기 → PDF 두 장 비교 → AI 답 되돌리기 → 보고서 내려받기 → JSON 백업(PDF 포함) 지우고 되살리기
// 순서로 누르고, JS 오류와 폭별 가로 넘침을 잽니다. BREAK=1 이면 일부러 넓은 상자를 넣어 넘침 검사가 잡는지 봅니다.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const url = 'file://' + path.join(root, 'index.html');

const errors = [], problems = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', d => d.accept());
function ok(cond, msg) { if (!cond) { problems.push(msg); console.log('  FAIL ' + msg); } else console.log('  ok  ' + msg); }
async function go(hash) { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(150); }
async function overflow() {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth, bad = [];
    document.querySelectorAll('main *').forEach(el => {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      let p = el.parentElement, inScroll = false;
      while (p) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') { inScroll = true; break; } p = p.parentElement; }
      if (!inScroll && r.right > W + 1) bad.push(el.tagName + '.' + el.className);
    });
    return bad.slice(0, 3);
  });
}

const fs = require('fs');
async function idbCount() {
  return page.evaluate(() => new Promise(res => { const rq = indexedDB.open('data10-12.pdfs', 1); rq.onsuccess = () => { const t = rq.result.transaction('pdfs', 'readonly').objectStore('pdfs').count(); t.onsuccess = () => res(t.result); }; rq.onerror = () => res(-1); }));
}
async function openGroup(key) {
  const g = page.locator('details.group[data-key="' + key + '"]');
  if (!(await g.evaluate(d => d.open))) { await g.locator('summary').click(); await page.waitForTimeout(100); }
  return g;
}
async function toastText() { await page.waitForTimeout(350); return (await page.textContent('#toast')) || ''; }

// 0) 1단계(v1)로 저장된 22건이 2차로 옮겨지는지 — 수강생 브라우저에 이미 있는 데이터와 같은 모양
await page.goto(url);
await page.evaluate(() => {
  const S = window.CTSample.build(window.CTLogic.localToday());
  const recs = S.records.map((e, i) => ({ body: e.body, kind: e.kind, product: e.product, model: e.model, certNo: e.certNo, issued: e.issued, expires: e.expires, stage: e.stage, applied: '', leadDays: e.leadDays, owner: '품질', person: '담당', distributed: e.distributed, note: '', history: i === 0 ? [{ certNo: 'OLD-1', issued: '2016-01-01', expires: '2021-01-01', applied: '', distributed: '', closed: '2021-01-02' }] : [], key: 'k' + i, id: 'c' + i }));
  localStorage.setItem('data10-12.db', JSON.stringify({ v: 1, records: recs, files: [{ name: '내 관리대장.xlsx', sheet: 'Sheet1', rows: 22, at: '2026-10-26 10:00' }], settings: {}, flow: null, compare: {}, mask: true, maskCertNo: true, sample: false }));
});
await page.reload();
await page.waitForTimeout(300);
ok((await page.textContent('#dataChip')).includes('운영 중 인증 22건'), '1단계 저장 22건이 운영 중 22건으로 옮겨짐');
await go('#/models');
ok((await page.textContent('main')).includes('OLD-1'), '옛 이력(OLD-1)이 모델별 이력에 보임');
const v2 = await page.evaluate(() => JSON.parse(localStorage.getItem('data10-12.db')));
ok(v2.v === 2 && v2.records.length === 22 && v2.records.every(r => r.state === 'active') && v2.records[0].history[0].state === 'renewed', '저장 모양 v2 · 22건 모두 운영 중 · 이력 상태 갱신됨');

if (process.env.BREAK) await page.addStyleTag({ content: '.page-head { min-width: 900px; }' });
await go('#/import');
await page.locator('button', { hasText: '샘플로 시작' }).first().click();
await page.waitForTimeout(900);
ok(await page.locator('#sampleBanner').isVisible(), '샘플 띠 보임');
ok((await page.textContent('#dataChip')).includes('운영 중 인증 22건 · 중지·종료 3건'), '샘플: 운영 중 22 · 중지·종료 3');
ok(await idbCount() === 6, '샘플 인증서 PDF 6장이 IndexedDB 에');
const dash = await page.textContent('main');
ok(/만료\s*2건/.test(dash) && /지연\s*2건/.test(dash) && /임박\s*3건/.test(dash), '대시보드 상태 타일(만료 2 · 지연 2 · 임박 3)');

for (const id of ['import', 'dash', 'gantt', 'ledger', 'models', 'alert', 'flow', 'compare', 'report', 'settings']) {
  for (const w of [1280, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await go('#/' + id);
    const bad = await overflow();
    ok(!bad.length, id + ' ' + w + 'px 가로 넘침 없음' + (bad.length ? ' — ' + bad.join(', ') : ''));
  }
}
// 좁은 화면에서 PDF 보기 창도 넘치지 않는지
await page.setViewportSize({ width: 390, height: 800 });
await go('#/models');
await (await openGroup('DV20')).locator('button.btn-pdf').first().click();
await page.waitForTimeout(300);
const vbad = await page.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('#pdfViewer *')].filter(el => el.getBoundingClientRect().right > W + 1).map(el => el.tagName + '.' + el.className).slice(0, 3); });
ok(!vbad.length, 'PDF 보기 창 390px 넘침 없음' + (vbad.length ? ' — ' + vbad.join(', ') : ''));
await page.keyboard.press('Escape');
await page.setViewportSize({ width: 1280, height: 900 });

// 모델별 이력 — 묶음 · PDF
await go('#/models');
let mt = await page.textContent('main');
const hc = await openGroup('HC100계열');
const hcText = await hc.textContent();
ok(hcText.includes('hc-100계열') && /중지/.test(hcText) && hcText.includes('고객 요구 없어 갱신 중지'), 'HC-100 묶음에 표기가 다른 BV 중지 인증과 사유');
ok(await page.locator('details.group[data-key="DV20"] table.list tbody tr').count() === 2, 'DV-20 · DV20 이 한 묶음(인증 2건)');
ok(await page.locator('details.group[data-key="GP25"]').textContent().then(t => t.includes('폐기') && t.includes('모델 단종')), '폐기된 GP-25 묶음과 사유');
ok(/인증서 PDF\s*6장/.test(mt), 'PDF 6장 타일');
await hc.locator('button.btn-pdf').first().click();
await page.waitForTimeout(300);
ok(await page.locator('#pdfViewer').isVisible(), 'PDF 보기 — 화면 안 보기 창');
const src = await page.locator('#pdfViewer iframe').getAttribute('src');
const head = await page.evaluate(u => fetch(u).then(r => r.arrayBuffer()).then(b => String.fromCharCode(...new Uint8Array(b).slice(0, 5))), src);
ok(src.startsWith('blob:') && head === '%PDF-', 'blob 주소의 내용이 PDF');
// 헤드리스 셸에는 PDF 보기 플러그인이 없어 새 탭이 PDF 를 내려받기로 처리합니다(실제 크롬·엣지는 새 탭에 PDF 를 그림)
// → 새 탭이 열리고, 그 클릭으로 받은 파일 주소가 보기 창의 blob 주소와 같은지로 봅니다
const newTab = ctx.waitForEvent('page'), tabDl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await page.locator('#pdfNewTab').click();
const tab = await newTab, got = await tabDl;
ok(await page.locator('#pdfNewTab').getAttribute('target') === '_blank' && !!tab && got && got.url() === src, '「새 탭에서 열기」 → 새 탭 + 같은 blob 주소의 PDF');
await tab.close();
await page.locator('#pdfViewer button', { hasText: '닫기' }).click();
ok(!(await page.locator('#pdfViewer').count()), '보기 창 닫힘');
// 붙이기: 아직 PDF 없는 인증(LR PV-45 는 있음 → KR HA-12 묶음)
const ha = await openGroup('HA12');
await ha.locator('input[type=file][aria-label="인증서 PDF 붙이기"]').first().setInputFiles(path.join(root, 'samples/인증서_첨부_샘플.pdf'));
let tt = await toastText();
ok(/PDF 를 붙였습니다/.test(tt) && await idbCount() === 7, 'PDF 붙이기 → 7장');
await ha.locator('input[type=file][aria-label="인증서 PDF 붙이기"]').first().setInputFiles({ name: 'not.pdf', mimeType: 'application/pdf', buffer: Buffer.from('hello') }).catch(() => {});
// 위 줄은 이미 붙어 있어 「바꾸기」로 바뀌었으므로, 바꾸기 입력으로 시험
await ha.locator('input[type=file][aria-label="바꾸기"]').first().setInputFiles({ name: 'not.pdf', mimeType: 'application/pdf', buffer: Buffer.from('hello') });
tt = await toastText();
ok(/PDF 가 아닙니다/.test(tt) && await idbCount() === 7, 'PDF 가 아닌 파일은 거절');
const big = Buffer.alloc(16 * 1024 * 1024, 32); big.write('%PDF-1.4');
await ha.locator('input[type=file][aria-label="바꾸기"]').first().setInputFiles({ name: 'big.pdf', mimeType: 'application/pdf', buffer: big });
tt = await toastText();
ok(/15MB 까지/.test(tt) && await idbCount() === 7, '15MB 넘는 PDF 는 크기 안내와 함께 거절');
await ha.locator('input[type=file][aria-label="바꾸기"]').first().setInputFiles(path.join(root, 'samples/인증서_신규_샘플.pdf'));
tt = await toastText();
ok(/인증서_신규_샘플\.pdf/.test(tt) && await idbCount() === 7, 'PDF 바꾸기 — 옛 파일은 지우고 7장 그대로');
await ha.locator('button', { hasText: 'PDF 빼기' }).first().click();
await page.waitForTimeout(300);
ok(await idbCount() === 6 && await ha.locator('input[aria-label="인증서 PDF 붙이기"]').count() > 0, 'PDF 빼기 → 6장');
// 과거 이력 직접 더하기 (PDF 함께)
await ha.locator('button', { hasText: '과거 이력 추가' }).click();
await page.waitForTimeout(200);
const form = page.locator('.hist-form');
await form.locator('input[aria-label="지난 인증서 번호"]').fill('TA-15-0001');
await form.locator('input[aria-label="발급일"]').fill('2015-03-01');
await form.locator('input[aria-label="만료일"]').fill('2020-02-28');
await form.locator('input[aria-label="이력 인증서 PDF"]').setInputFiles(path.join(root, 'samples/인증서_이전_샘플.pdf'));
await form.locator('button', { hasText: '이력 더하기' }).click();
await page.waitForTimeout(400);
ok((await ha.textContent()).includes('TA-15-0001') && await idbCount() === 7, '과거 이력 추가(PDF 포함) → 이력에 보이고 PDF 7장');
// 운영 중 → 중지 : 알림·칩에서 빠짐
await go('#/alert');
const alertsBefore = await page.locator('table.list tbody tr').count();
await go('#/models');
const hm = await openGroup('HM30');
await hm.locator('button', { hasText: '중지·종료로' }).click();
await page.waitForTimeout(200);
await page.locator('.hist-form select[aria-label="운영 상태"]').selectOption('stopped');
await page.locator('.hist-form input[aria-label="중지 사유"]').fill('수주 없음(시험)');
await page.locator('.hist-form button', { hasText: '저장' }).click();
await page.waitForTimeout(300);
ok((await page.textContent('#dataChip')).includes('운영 중 인증 21건 · 중지·종료 4건'), '중지로 바꾸면 운영 중 21 · 중지·종료 4');
await go('#/alert');
ok(!(await page.textContent('main')).includes('HM-30') && await page.locator('table.list tbody tr').count() < alertsBefore + 99, '중지한 HM-30 은 알림에 없음');
await go('#/ledger');
await page.locator('select[aria-label="상태"]').selectOption('inactive');
await page.waitForTimeout(200);
ok(await page.locator('table.list tbody tr').count() === 4, '관리대장 「중지·종료」 거르기 4건');
await page.locator('select[aria-label="상태"]').selectOption('all');
await page.waitForTimeout(150);

await go('#/gantt');
ok(await page.locator('svg.gantt rect.ph-prep').count() > 5, '간트 막대(준비) 그려짐');
await go('#/flow');
ok(await page.locator('svg.flow rect.box').count() === 9, '흐름도 상자 9개');
ok(!(await page.textContent('main')).includes('A(최종 책임)가'), '기본 흐름 RACI 경고 없음');

// 관리대장: 지연인 ABS DV-20 을 「신청 완료」로 → 지연이 풀림
await go('#/ledger');
const row = page.locator('table.list tbody tr', { hasText: 'DV-20' }).first();
await row.locator('select').selectOption('apply');
await page.waitForTimeout(200);
await go('#/dash');
ok(/지연\s*1건/.test(await page.textContent('main')), '진행 단계를 바꾸면 지연이 1건으로');

// 알림: 메일 초안과 mailto
await go('#/alert');
const hrefs = await page.locator('a.btn', { hasText: '메일 앱으로 열기' }).evaluateAll(a => a.map(x => x.getAttribute('href')));
ok(hrefs.length === 3 && hrefs.every(h => h.startsWith('mailto:?subject=')), '부서별 메일 초안 3개(mailto)');

// 가져오기: 샘플 엑셀 → 샘플이 실제 데이터로 바뀜
await go('#/import');
await page.setInputFiles('input[type=file][accept=".xlsx,.xlsm,.xls,.csv"]', path.join(root, 'samples/인증_관리대장_샘플.xlsx'));
await page.waitForTimeout(400);
await page.locator('button', { hasText: '개 파일 반영' }).click();
await page.waitForTimeout(300);
ok(!(await page.locator('#sampleBanner').isVisible()), '실제 파일 반영 뒤 샘플 띠 사라짐');
ok((await page.textContent('#dataChip')).includes('운영 중 인증 22건 · 중지·종료 3건'), '샘플 엑셀(관리대장 + 인증 이력 시트) → 운영 중 22 · 중지·종료 3');
await go('#/models');
ok(/지난 인증서 이력\s*7줄/.test(await page.textContent('main')), '이력 시트에서 지난 인증서 7줄');
ok(await idbCount() === 0, '샘플을 실제 파일로 바꾸면 샘플 PDF 도 지움');

// 비교: PDF 두 장
await go('#/compare');
const fileInputs = page.locator('input[type=file][accept=".pdf,.txt,.csv,.md"]');
await fileInputs.nth(0).setInputFiles(path.join(root, 'samples/인증서_이전_샘플.pdf'));
await page.waitForTimeout(1200);
await page.locator('input[type=file][accept=".pdf,.txt,.csv,.md"]').nth(1).setInputFiles(path.join(root, 'samples/인증서_신규_샘플.pdf'));
await page.waitForTimeout(1200);
const cmpText = await page.textContent('main');
ok(/내용 변경 \(6건\)/.test(cmpText), 'PDF 글자층으로 읽어 내용 변경 6건');
ok(cmpText.includes('420 bar'), '정격압력 변경이 보임');
// 가리기: 가릴 낱말을 넣고 프롬프트에 안 남는지
await page.locator('textarea[aria-label="가릴 낱말"]').fill('Example Hydraulics Ltd.');
await page.locator('textarea[aria-label="가릴 낱말"]').dispatchEvent('change');
await page.waitForTimeout(200);
const prompt = await page.locator('textarea[aria-label="AI 프롬프트"]').inputValue();
ok(!/TA-21-0457|TA-26-0981/.test(prompt) && /인증번호1/.test(prompt), '프롬프트에 인증서 번호 대신 별칭');
await page.locator('textarea[aria-label="AI 답"]').fill('인증번호2 로 바뀌었습니다.');
await page.locator('textarea[aria-label="AI 답"]').dispatchEvent('change');
await page.waitForTimeout(200);
ok((await page.locator('textarea[aria-label="AI 답"]').inputValue()).includes('TA-26-0981'), 'AI 답의 별칭을 원래 번호로 되돌림');

// 보고서: 두 종류, 엑셀·Word 내려받기
await go('#/report');
ok((await page.textContent('main')).includes('인증 갱신 현황 보고'), '현황 보고');
let dl = page.waitForEvent('download'); await page.locator('button', { hasText: '엑셀로' }).click(); ok((await dl).suggestedFilename().endsWith('.xlsx'), '보고서 엑셀 내려받기');
await page.locator('button', { hasText: '변경 내용 보고' }).click(); await page.waitForTimeout(150);
const rp = await page.textContent('main');
ok(rp.includes('인증서 변경 내용 보고') && rp.includes('TA-26-0981'), '변경 내용 보고(AI 요약 포함)');
dl = page.waitForEvent('download'); await page.locator('button', { hasText: 'Word 로' }).click(); ok((await dl).suggestedFilename().endsWith('.doc'), 'Word 내려받기');

// JSON 백업(PDF 포함) → 모두 지우기 → 되살리기
await go('#/models');
await (await openGroup('PV45')).locator('input[aria-label="인증서 PDF 붙이기"]').first().setInputFiles(path.join(root, 'samples/인증서_첨부_샘플.pdf'));
await page.waitForTimeout(400);
await go('#/settings');
dl = page.waitForEvent('download'); await page.locator('button', { hasText: 'JSON 백업(PDF 포함)' }).click();
const bk = await (await dl).path(); const bj = JSON.parse(fs.readFileSync(bk, 'utf8'));
ok(bj.records.length === 25 && bj.pdfs.length === 1 && bj.pdfs[0].b64.length > 100, 'JSON 백업에 인증 25건 + PDF 1장(base64)');
dl = page.waitForEvent('download'); await page.locator('button', { hasText: 'JSON 백업(PDF 빼고)' }).click();
const bj2 = JSON.parse(fs.readFileSync(await (await dl).path(), 'utf8'));
ok(!bj2.pdfs && bj2.pdfsOmitted === 1, 'PDF 빼고 백업에는 빠진 장 수만');
await go('#/import');
await page.locator('button', { hasText: '모든 데이터 지우기' }).click();
await page.waitForTimeout(300);
ok(await idbCount() === 0 && (await page.textContent('#dataChip')).includes('데이터 없음'), '모두 지우기 — PDF 도 지움');
await go('#/settings');
await page.setInputFiles('input[type=file][accept=".json"]', bk);
await page.waitForTimeout(600);
ok(await idbCount() === 1 && (await page.textContent('#dataChip')).includes('운영 중 인증 22건'), '백업 되살리기 — 25건 · PDF 1장');
await go('#/models');
await (await openGroup('PV45')).locator('button.btn-pdf').first().click();
await page.waitForTimeout(300);
const src2 = await page.locator('#pdfViewer iframe').getAttribute('src');
ok(await page.evaluate(u => fetch(u).then(r => r.arrayBuffer()).then(b => b.byteLength > 500), src2), '되살린 PDF 가 열림');

await browser.close();
if (errors.length) { console.log('JS 오류:\n' + errors.join('\n')); }
console.log(errors.length || problems.length ? '\n문제 ' + (errors.length + problems.length) + '건' : '\n모두 통과');
process.exitCode = errors.length || problems.length ? 1 : 0;

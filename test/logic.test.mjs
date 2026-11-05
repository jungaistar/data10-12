// 실행: node test/logic.test.mjs   (의존성 없음 — vendor 의 SheetJS 만 씀)
// 실제 관리대장·인증서는 아직 받지 않았습니다(기획서 10장 ①②). 제출 글의 항목대로 만든 작은 가상 표와 가상 샘플로 검사합니다.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../js/logic.js');
const Sample = require('../js/sample-data.js');
const XLSX = require('../vendor/xlsx.full.min.js');
const E = require('../js/ai-endpoint.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
const T = '2026-10-21';
const S = L.cleanSettings({});

console.log('날짜 읽기');
test('여러 표기의 날짜를 같은 날로 읽음 (ISO·점·한글·영문 월·일.월.년·엑셀 일련번호)', () => {
  ['2027-03-15', '2027.3.15', '2027년 3월 15일', '15-Mar-2027', '15 March 2027', 'March 15, 2027', '15.03.2027', '15/03/2027', 46461].forEach(v => assert.equal(L.toISO(v), '2027-03-15', String(v)));
  assert.equal(L.toISO(new Date(2027, 2, 15)), '2027-03-15');
});
test('없는 날짜·빈칸은 빈 글자, 「/」 일·월이 둘 다 12 이하면 애매하다고 알림', () => {
  assert.equal(L.toISO('2027-02-30'), ''); assert.equal(L.toISO(''), ''); assert.equal(L.toISO('미정'), '');
  assert.equal(L.toISO('05/06/2027'), '2027-06-05'); assert.equal(L.isAmbiguousDate('05/06/2027'), true);
  assert.equal(L.isAmbiguousDate('15/03/2027'), false); assert.equal(L.toISO('03/15/2027'), '2027-03-15');
});
test('날짜 계산 — 더하기·사이 일수·해 더하기(2월 29일)', () => {
  assert.equal(L.addDays('2026-12-25', 10), '2027-01-04');
  assert.equal(L.daysBetween('2026-10-21', '2026-11-30'), 40);
  assert.equal(L.addYears('2028-02-29', 1), '2029-02-28');
  assert.equal(L.dLabel(0), 'D-day'); assert.equal(L.dLabel(5), 'D-5'); assert.equal(L.dLabel(-3), 'D+3');
});

console.log('관리대장 열 찾기');
const HEAD = ['인증기관', '인증 종류', '제품', '모델', '인증서 번호', '발급일', '만료일', '진행 단계', '주관 부서', '담당자', '비고'];
const TINY = [
  ['■ 인증 관리대장'], [], HEAD,
  ['DNV', 'Type Approval', '실린더', 'C-1', 'TA-1', '2022-01-10', '2027-01-09', '준비', '품질', '담당A', ''],
  ['ABS', 'Works Approval', '공장', '-', 'WA-1', '2024.03.01', '28-Feb-2027', '', '품질', '담당B', ''],
  ['KR', 'ISO 9001', '시스템', '-', 'Q-1', '2024-01-01', '미정', '', '', '', ''],     // 만료일 못 읽음 → 건너뜀
  ['BV', 'TA', '밸브', 'V-1', 'TA-2', '2023-05-01', '05/06/2028', '심사', '', '', ''],  // 애매한 날짜 → 알림
  [],
  ['합계', '', '', '', '', '', '', '', '', '', '']
];
test('제목·빈 줄 아래 머리행을 찾고 열을 모두 연결', () => {
  const d = L.detectColumns(TINY);
  assert.equal(d.headerRow, 2);
  ['body', 'kind', 'product', 'model', 'certNo', 'issued', 'expires', 'stage', 'owner', 'person', 'note'].forEach((f, i) => assert.equal(d.map[f], i, f));
  assert.deepEqual(d.missing, []);
});
test('열 이름이 달라도 찾음 — 선급·인증 구분·인증서 No.·유효기간·진행 상태·담당 부서·리드타임(일)', () => {
  const d = L.detectColumns([Sample.HEAD.concat(['갱신 리드타임(일)', '배포일'])]);
  assert.equal(d.map.body, 1); assert.equal(d.map.kind, 2); assert.equal(d.map.certNo, 5); assert.equal(d.map.expires, 7);
  assert.equal(d.map.stage, 8); assert.equal(d.map.owner, 9); assert.equal(d.map.leadDays, 12); assert.equal(d.map.distributed, 13);
  assert.equal(L.matchField('Valid until'), 'expires'); assert.equal(L.matchField('Classification Society'), 'body');
  assert.equal(L.matchField('Date of Issue'), 'issued'); assert.equal(L.matchField('인증 만료일'), 'expires');
});
test('필수 열(만료일)이 없으면 알리고, 열 연결(덮어쓰기)로 고칠 수 있음', () => {
  const aoa = [['기관', '종류', '끝나는 날'], ['DNV', 'TA', '2027-01-01']];
  const d = L.detectColumns(aoa);
  assert.equal(d.headerRow, -1); assert.ok(d.missing.includes('expires'));
  const p = L.parseSheet(aoa, { overrides: { expires: 2 } });
  assert.equal(p.records.length, 1); assert.equal(p.records[0].expires, '2027-01-01');
});

console.log('행 읽기 · 합치기');
test('합계 줄·빈 줄 건너뜀, 만료일 못 읽은 행은 알리고 건너뜀, 애매한 날짜 알림', () => {
  const p = L.parseSheet(TINY);
  assert.equal(p.records.length, 3);
  assert.ok(p.warnings.some(w => w.row === 6 && /만료일/.test(w.msg)));
  assert.ok(p.warnings.some(w => w.row === 7 && /일\/월/.test(w.msg)));
  assert.equal(p.records[1].expires, '2027-02-28'); assert.equal(p.records[1].issued, '2024-03-01');
  assert.equal(p.records[0].stage, 'prep'); assert.equal(p.records[2].stage, 'review');
});
test('진행 단계 글자 → 단계', () => {
  const m = { '': 'none', '미착수': 'none', '준비중': 'prep', '서류 작성': 'prep', '신청': 'apply', '접수 완료': 'apply', '기관 심사': 'review', '보완 요청 대응': 'review', '발급 완료': 'done', '갱신완료': 'done', 'Issued': 'done' };
  Object.keys(m).forEach(k => assert.equal(L.parseStage(k), m[k], k));
});
test('같은 인증을 다시 가져오면 한 행 — 새 값으로 고치되 도구에서 바꾼 진행 단계·배포일은 지킴', () => {
  const a = L.parseSheet(TINY).records;
  a[0].stage = 'apply'; a[0].distributed = '';
  a[1].distributed = '2026-10-01';
  const b = L.parseSheet(TINY).records; b[0].note = '새 비고';
  const m = L.mergeRecords(a, b);
  assert.equal(m.records.length, 3); assert.deepEqual(m.stat, { added: 0, updated: 3 });
  assert.equal(m.records[0].stage, 'apply'); assert.equal(m.records[0].note, '새 비고'); assert.equal(m.records[1].distributed, '2026-10-01');
  assert.equal(m.records[0].id, a[0].id);
});
test('다음 주기로 넘기기 — 이전 번호·날짜는 이력에, 단계는 미착수로, 새 만료일은 이전보다 뒤여야', () => {
  const r = { body: 'DNV', kind: 'TA', certNo: 'TA-1', issued: '2022-01-10', expires: '2027-01-09', stage: 'done', distributed: '2026-12-01', history: [] };
  const n = L.renewRecord(r, { certNo: 'TA-9', issued: '2026-12-20', expires: '2031-12-19' }, '2026-12-21');
  assert.equal(n.certNo, 'TA-9'); assert.equal(n.expires, '2031-12-19'); assert.equal(n.stage, 'none'); assert.equal(n.distributed, '');
  const h0 = n.history[0];
  assert.deepEqual([h0.certNo, h0.issued, h0.expires, h0.applied, h0.distributed, h0.closed, h0.state, h0.src], ['TA-1', '2022-01-10', '2027-01-09', '', '2026-12-01', '2026-12-21', 'renewed', 'renew']);
  assert.equal(r.stage, 'done', '원본은 그대로');
  assert.throws(() => L.renewRecord(r, { expires: '2026-01-01' }, T), /뒤여야/);
});

console.log('리드타임 · 만료일 역산');
test('Type Approval: 만료일에서 여유 30 → 발급 14 → 피드백 30 → 기관 심사 45 → 준비 60 을 거꾸로 (전체 179일)', () => {
  const p = L.plan({ kind: 'Type Approval', expires: '2027-06-30' }, S);
  assert.equal(p.lead, 179);
  assert.equal(p.targetIssue, '2027-05-31'); assert.equal(p.issueStart, '2027-05-17'); assert.equal(p.feedbackStart, '2027-04-17');
  assert.equal(p.applyDate, '2027-03-03'); assert.equal(p.prepStart, '2027-01-02'); assert.equal(p.noticeDate, '2026-12-03');
  assert.equal(L.daysBetween(p.prepStart, p.expires), 179);
  p.phases.forEach((ph, i) => { if (i) assert.equal(ph.from, p.phases[i - 1].to, '단계가 이어짐'); });
});
test('인증 종류 맞추기 — 약어(TA)는 낱말일 때만, 모르는 종류는 기본값', () => {
  assert.match(L.kindRule(S, 'TA').name, /Type Approval/);
  assert.match(L.kindRule(S, '공장승인').name, /Works/);
  assert.match(L.kindRule(S, 'ISO 9001').name, /ISO/);
  assert.match(L.kindRule(S, 'DATA sheet').name, /기타/, '「DATA」 안의 ta 에 걸리면 안 됨');
  assert.match(L.kindRule(S, 'PED').name, /기타/);
});
test('기관별 추가 일수는 기관 심사 기간에 더함', () => {
  const S2 = L.cleanSettings({ bodyExtra: [{ body: 'ABS', days: 15 }] });
  const a = L.plan({ body: 'ABS', kind: 'TA', expires: '2027-06-30' }, S2), b = L.plan({ body: 'DNV', kind: 'TA', expires: '2027-06-30' }, S2);
  assert.equal(a.lead, 194); assert.equal(a.parts.review, 60); assert.equal(b.lead, 179);
  assert.equal(L.daysBetween(a.applyDate, a.feedbackStart), 60);
});
test('대장에 리드타임(일)이 있으면 단계 비율은 두고 전체 길이를 그 값에 맞춤', () => {
  const p = L.plan({ kind: 'TA', expires: '2028-06-30', leadDays: 240 }, S);
  assert.equal(p.lead, 240); assert.equal(p.custom, true);
  assert.equal(L.daysBetween(p.prepStart, p.expires), 240);
  assert.ok(p.parts.review > 45 && p.parts.feedback > 30, '각 단계가 함께 늘어남');
});

console.log('상태 신호');
const R = (o) => Object.assign({ body: 'DNV', kind: 'TA', expires: '2027-06-30', stage: 'none', history: [] }, o);
test('정상 → 준비 예정 → 준비 시작 → 지연 → 임박 → 만료 (날짜만 바꿔 같은 인증)', () => {
  const r = R({});   // 준비 예정 안내 2026-12-03, 준비 시작 2027-01-02, 신청 기한 2027-03-03, 만료 2027-06-30
  assert.equal(L.status(r, S, '2026-11-01').code, 'ok');
  assert.equal(L.status(r, S, '2026-12-10').code, 'soon');
  assert.equal(L.status(r, S, '2027-01-05').code, 'active');
  assert.equal(L.status(r, S, '2027-01-09').code, 'active', '유예 7일 안');
  assert.equal(L.status(r, S, '2027-01-10').code, 'late', '준비 시작 기한 + 8일');
  assert.equal(L.status(r, S, '2027-07-01').code, 'expired');
});
test('일정대로 단계를 밟으면 지연이 아니고, 만료 60일 안이면 임박', () => {
  assert.equal(L.status(R({ stage: 'prep' }), S, '2027-02-01').code, 'active');
  assert.equal(L.status(R({ stage: 'prep' }), S, '2027-02-01').label, '진행 중');
  assert.equal(L.status(R({ stage: 'prep' }), S, '2027-03-20').code, 'late', '신청 기한 2027-03-03 + 17일');
  assert.equal(L.status(R({ stage: 'review' }), S, '2027-05-10').code, 'urgent');
  assert.match(L.status(R({ stage: 'prep' }), S, '2027-03-20').msg, /인증기관 신청 기한\(2027-03-03\)이 17일/);
});
test('발급 완료: 배포일이 없으면 「배포 필요」, 있으면 「완료」 — 만료가 지나도 완료로 봄', () => {
  assert.equal(L.status(R({ stage: 'done' }), S, '2027-05-01').code, 'distribute');
  assert.equal(L.status(R({ stage: 'done', distributed: '2027-05-02' }), S, '2027-07-05').code, 'done');
  assert.equal(L.status(R({ expires: '' }), S, T).code, 'nodate');
});
test('유예 일수 설정을 바꾸면 지연 판정이 바뀜', () => {
  const S0 = L.cleanSettings({ graceDays: 0 });
  assert.equal(L.status(R({}), S0, '2027-01-03').code, 'late');
  assert.equal(L.status(R({}), S, '2027-01-03').code, 'active');
});

console.log('알림 · 메일 초안');
test('인증마다 끝나지 않은 일 가운데 미리 보기 안의 가장 최근 일 하나만', () => {
  const r = R({});
  let a = L.alerts([r], S, '2027-03-10');     // 준비 예정·준비 시작·신청 기한이 모두 지남 → 신청 기한 하나
  assert.equal(a.length, 1); assert.equal(a[0].key, 'apply'); assert.equal(a[0].days, -7);
  a = L.alerts([R({ stage: 'apply' })], S, '2027-03-10');   // 신청을 마쳤으면 신청 알림 없음, 다음 일은 아직 멀어 알림 없음
  assert.equal(a.length, 0);
  a = L.alerts([r], S, '2026-11-28');                      // 안내일 12-03 이 미리 보기 7일 안
  assert.equal(a[0].key, 'notice'); assert.equal(a[0].days, 5);
  assert.equal(L.alerts([r], S, '2026-11-20').length, 0);
});
test('알림 받는 부서 = 규칙의 부서 + 주관 부서, 배포 알림은 영업·품질·개발', () => {
  const a = L.alerts([R({ stage: 'done' }), R({ owner: '영업팀', certNo: 'X' })], S, '2027-03-10');
  const dist = a.find(x => x.key === 'distribute'), app = a.find(x => x.key === 'apply');
  assert.deepEqual(dist.depts.slice().sort(), ['dev', 'quality', 'sales']);
  assert.deepEqual(app.depts.slice().sort(), ['quality', 'sales'], '신청 알림은 품질만이지만 주관 부서(영업팀)가 더해짐');
});
test('부서별 메일 초안 — 받는 사람·제목·본문·mailto 인코딩, 알림 없는 부서는 초안 없음', () => {
  const S2 = L.cleanSettings({ depts: [{ id: 'quality', name: '품질', email: 'qa@example.com; qa2@example.com' }, { id: 'sales', name: '영업', email: '' }, { id: 'dev', name: '개발', email: '' }] });
  const a = L.alerts([R({ certNo: 'TA-1' })], S2, '2027-03-10');
  const m = L.mailDrafts(a, S2, '2027-03-10');
  assert.deepEqual(m.map(x => x.dept.id), ['quality'], '신청 알림은 품질만');
  assert.match(m[0].mailto, /^mailto:qa@example\.com,qa2@example\.com\?subject=/);
  assert.match(decodeURIComponent(m[0].mailto.split('body=')[1]), /인증기관 신청 기한 2027-03-03 \(7일 지남\)/);
  assert.match(m[0].body, /품질 담당자님께/); assert.match(m[0].subject, /1건 \(품질\)/);
});
test('메일 본문이 길면 mailto 는 줄이고 표시', () => {
  const many = Array.from({ length: 40 }, (_, i) => R({ certNo: 'N' + i, model: 'M' + i }));
  const m = L.mailDrafts(L.alerts(many, S, '2027-03-10'), S, '2027-03-10')[0];
  assert.equal(m.cut, true); assert.ok(decodeURIComponent(m.mailto.split('body=')[1]).length < m.body.length);
});

console.log('업무흐름 · R/R');
test('기본 흐름은 RACI 규칙(단계마다 R 하나 이상, A 하나)을 지킴', () => {
  const f = L.cleanFlow(L.defaultFlow());
  assert.deepEqual(L.checkFlow(f), []);
  assert.equal(f.steps.length, 9);
});
test('A 가 둘이거나 R 이 없으면 알림, 잘못 적은 역할은 지움', () => {
  const f = L.cleanFlow({ lanes: ['품질', '개발'], steps: [{ name: '가', days: 1, roles: { '품질': 'A', '개발': 'a' } }, { name: '나', days: 2, roles: { '품질': 'X', '개발': 'R/A' } }] });
  const w = L.checkFlow(f);
  assert.equal(w.length, 2); assert.match(w[0].msg, /R\(실행\)이 없습니다/); assert.match(w[1].msg, /A\(최종 책임\)가 2개/);
  assert.equal(f.steps[1].roles['품질'], undefined);
});
test('흐름도 좌표 — 상자는 R 부서 줄에, 왼쪽에서 오른쪽으로 겹치지 않고, 화살표는 단계 수 - 1, 누적 일수', () => {
  const f = L.cleanFlow(L.defaultFlow()), g = L.flowLayout(f);
  assert.equal(g.boxes.length, 9); assert.equal(g.arrows.length, 8);
  assert.equal(f.lanes[g.boxes[0].lane], '품질'); assert.equal(f.lanes[g.boxes[1].lane], '개발'); assert.equal(f.lanes[g.boxes[4].lane], '인증기관');
  for (let i = 1; i < g.boxes.length; i++) assert.ok(g.boxes[i].x >= g.boxes[i - 1].x + g.boxes[i - 1].w, '겹침 없음');
  g.boxes.forEach(b => { assert.ok(b.x + b.w <= g.width && b.y + b.h <= g.height); assert.ok(b.lines.length <= 2); });
  assert.equal(g.total, 135); assert.equal(g.boxes[8].to, 135);
  assert.match(g.arrows[0].d, /V/, '줄이 바뀌면 꺾인 화살표');
});

console.log('인증서 비교');
const cmp = L.compareCerts(Sample.OLD, Sample.NEW);
test('「항목: 값」을 읽고 같은 항목 이름이 또 나오면 #2', () => {
  const kv = L.parseKV('Product: A\nRated pressure : 350 bar\nNote   free text col\n1. condition: x\n10:30 meeting\nProduct: B');
  assert.deepEqual(kv.map(x => x.key), ['Product', 'Rated pressure', 'Note', 'Product']);
  assert.equal(kv[3].k, 'product#2'); assert.equal(kv[2].value, 'free text col');
});
test('샘플 인증서 — 내용 변경 6건, 번호·날짜 변경 3건(인증서 번호·발급일·유효기간)을 나눠 냄', () => {
  assert.deepEqual(cmp.content.map(x => x.key), ['Bore diameter', 'Rated pressure', 'Test pressure', 'Rules', 'Application', 'Place of manufacture']);
  assert.deepEqual(cmp.routine.map(x => x.key), ['Certificate No.', 'Date of issue', 'Valid until']);
  assert.equal(cmp.count['같음'], 6);
  assert.equal(cmp.content[1].old, '350 bar'); assert.equal(cmp.content[1].new, '420 bar');
});
test('항목이 아닌 조건 문장의 차이 — 3번 바뀜(- / +), 4번 추가', () => {
  assert.equal(cmp.free.length, 3);
  assert.deepEqual(cmp.free.map(o => o.op), ['-', '+', '+']);
  assert.match(cmp.free[2].b, /^4\. Type testing/);
});
test('추가·삭제 항목, 띄어쓰기·대소문자만 다른 값은 같음', () => {
  const c = L.compareCerts('A: 1\nB:  two  words\nC: x', 'a: 1\nB: Two words\nD: y');
  assert.deepEqual(c.items.map(i => i.kind), ['같음', '같음', '삭제', '추가']);
});
test('낱말 단위 차이 — 350 → 420 만 바뀜', () => {
  const w = L.wordDiff('350 bar', '420 bar');
  assert.deepEqual(w.filter(x => x.op !== '=').map(x => x.op + x.t), ['-350', '+420']);
});
test('PDF 글 조각 → 줄 (같은 높이 한 줄, 벌어진 칸은 공백 세 칸)', () => {
  const it = (s, x, y) => ({ str: s, transform: [10, 0, 0, 10, x, y], width: s.length * 5 });
  const t = L.itemsToLines([it('Rated pressure', 50, 700), it('420 bar', 250, 700), it('Product:', 50, 720), it('Cylinder', 95, 720)]);
  assert.equal(t, 'Product: Cylinder\nRated pressure   420 bar');
  assert.equal(L.parseKV(t)[1].value, '420 bar');
});

console.log('이름 가리기 · AI 프롬프트');
const meta = { body: 'DNV', kind: 'Type Approval', product: '유압 실린더' };
test('프롬프트에 가릴 낱말·메일·인증서 번호가 남지 않고, 별칭 대응표로 되돌림', () => {
  const text = 'Maker: Example Hydraulics Ltd. / cert.team@example-hydraulics.test / 031-123-4567 / TA-21-0457 / 2026-10-15';
  const r = L.maskText(text, { words: ['Example Hydraulics Ltd.'], certNos: ['TA-21-0457'] });
  assert.ok(!/Example|@|123-4567|TA-21-0457/.test(r.text), r.text);
  assert.match(r.text, /2026-10-15/, '날짜는 가리지 않음');
  assert.equal(L.unmaskText(r.text, r.map), text);
  assert.deepEqual(L.findLeaks(r.text, r.map), []);
});
test('비교 프롬프트 — 사실(항목 비교·조건 차이)만, 인증서 번호는 별칭, 요청형 문장', () => {
  const ap = L.aiComparePrompt(cmp, meta, { words: ['Example Hydraulics Ltd.'], certNos: ['TA-21-0457', 'TA-26-0981'] });
  assert.ok(!/TA-21-0457|TA-26-0981/.test(ap.prompt));
  assert.match(ap.prompt, /Rated pressure \/ 이전: 350 bar \/ 신규: 420 bar/);
  assert.match(ap.prompt, /\+ 4\. Type testing/);
  assert.match(ap.prompt, /써줘/);
  assert.equal(L.unmaskText('인증번호2 로 바뀜, 인증번호1 은 폐기', ap.map), 'TA-26-0981 로 바뀜, TA-21-0457 은 폐기');
  const plain = L.aiComparePrompt(cmp, meta, { mask: false });
  assert.match(plain.prompt, /TA-21-0457/);
});
test('「인증번호1」 되돌리기가 「인증번호10」을 건드리지 않음', () => {
  const map = {}; for (let i = 1; i <= 10; i++) map['인증번호' + i] = 'N' + i;
  assert.equal(L.unmaskText('인증번호10 · 인증번호1', map), 'N10 · N1');
});

console.log('가상 샘플 · 집계');
const b = Sample.build(T);
const parsed = L.parseSheet(b.aoa);
test('샘플 관리대장 22건을 경고 없이 읽고 값이 같음', () => {
  assert.equal(parsed.records.length, 22); assert.deepEqual(parsed.warnings, []);
  parsed.records.forEach((r, i) => { const e = b.records[i]; ['body', 'kind', 'certNo', 'issued', 'expires', 'stage', 'distributed'].forEach(f => assert.equal(r[f], e[f], i + ' ' + f)); });
  assert.equal(parsed.records[11].leadDays, 240);
});
test('샘플을 엑셀 파일로 썼다 다시 읽어도 같음(날짜 칸 포함)', () => {
  const aoa = b.aoa.map((row, i) => i < 3 ? row : row.map((v, c) => (c === 6 || c === 7) ? new Date(v + 'T00:00:00') : v));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), '관리대장');
  const back = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellDates: true }), { type: 'buffer', cellDates: true });
  const p = L.parseSheet(XLSX.utils.sheet_to_json(back.Sheets['관리대장'], { header: 1, raw: true, defval: null }));
  assert.equal(p.records.length, 22);
  p.records.forEach((r, i) => { assert.equal(r.expires, b.records[i].expires); assert.equal(r.issued, b.records[i].issued); });
});
test('샘플 상태 분포 — 만료 2 · 지연 2 · 임박 3 · 배포 필요 1 · 준비 시작/진행 4 · 준비 예정 1 · 정상 8 · 완료 1', () => {
  const sm = L.summary(parsed.records, S, T);
  assert.deepEqual({ expired: sm.count.expired, late: sm.count.late, urgent: sm.count.urgent, distribute: sm.count.distribute, active: sm.count.active, soon: sm.count.soon, ok: sm.count.ok, done: sm.count.done },
    { expired: 2, late: 2, urgent: 3, distribute: 1, active: 4, soon: 1, ok: 8, done: 1 });
  assert.equal(sm.list[0].st.code, 'expired', '위험한 것부터');
  assert.equal(sm.months.length, 12); assert.equal(sm.months[0].key, '2026-10');
  assert.equal(sm.attention.length, 8);
});
test('샘플 알림 11건, 품질 메일에 전부, 영업 메일은 만료·임박·배포만', () => {
  const a = L.alerts(parsed.records, S, T);
  assert.equal(a.length, 11);
  const m = L.mailDrafts(a, S, T), q = m.find(x => x.dept.id === 'quality'), s = m.find(x => x.dept.id === 'sales');
  assert.equal(q.items.length, 11);
  assert.ok(s.items.every(x => ['expire', 'urgent', 'distribute'].includes(x.key)));
});
test('관리대장 내보내기 표 — 머리와 칸 수가 같고 계획 날짜가 들어감', () => {
  const rows = L.ledgerRows(parsed.records, S, T);
  assert.equal(rows.length, 22); rows.forEach(r => assert.equal(r.length, L.LEDGER_HEAD.length));
  assert.equal(rows[0][L.LEDGER_HEAD.indexOf('상태 신호')], '임박');
  assert.equal(rows[0][L.LEDGER_HEAD.indexOf('신청 기한')], L.plan(parsed.records[0], S).applyDate);
});

console.log('저장 · AI 연결');
test('저장 모양을 JSON 으로 왕복해도 같고, 망가진 값은 기본값으로', () => {
  const db = L.emptyDb(); db.records = parsed.records; db.settings.urgentDays = 90;
  const back = L.restoreDb(JSON.parse(JSON.stringify(db)));
  assert.equal(back.records.length, 22); assert.equal(back.settings.urgentDays, 90); assert.equal(back.flow.steps.length, 9);
  const bad = L.restoreDb({ records: [{ body: 'x' }, null], settings: { urgentDays: 'abc', depts: [] }, flow: 'x' });
  assert.equal(bad.records.length, 0); assert.equal(bad.settings.urgentDays, 60); assert.equal(bad.settings.depts.length, 3);
});
test('AI 연결 — 저장 칸 이름이 이 리포 것, 요청 모양', () => {
  assert.equal(E.STORE_KEY, 'data10-12.ai');
  const req = E.buildChatRequest({ baseUrl: 'https://llm.example.com/v1/', model: 'm', apiKey: '' }, E.promptMessages('hi'));
  assert.equal(req.url, 'https://llm.example.com/v1/chat/completions'); assert.equal(req.init.headers.Authorization, undefined);
});


console.log('2차 — 운영 상태 · 모델-형식 묶음 · 이력 · PDF · 옛 저장 옮기기');
const TODAY2 = '2026-10-27';
function readBook(aoaLedger, aoaHist) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaLedger), '관리대장');
  if (aoaHist) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaHist), '인증 이력');
  const back = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array', cellDates: true });
  const sheets = back.SheetNames.map(n => ({ name: n, aoa: XLSX.utils.sheet_to_json(back.Sheets[n], { header: 1, raw: true, defval: null }) }));
  return sheets;
}
// 앱의 가져오기와 같은 순서: 관리대장 시트 고르기 → 이력 시트는 history 로 → 인증은 합치고, 이력 줄은 같은 인증 줄에 붙임
function importSheets(existing, sheets) {
  const pick = L.pickSheet(sheets);
  const main = L.parseSheet(pick.aoa);
  const hist = sheets.filter(x => x.name !== pick.name && L.isHistorySheet(x.name)).map(x => L.parseSheet(x.aoa, { history: true }));
  const all = main.records.concat(...hist.map(x => x.records));
  const m = L.mergeRecords(existing, all.filter(r => !r.isHistory));
  const a = L.attachHistory(m.records, all.filter(r => r.isHistory));
  a.records.forEach(L.stripImport);
  return { pick: pick.name, main, hist, records: a.records, stat: Object.assign({}, m.stat, a.stat) };
}
test('「모델-형식」 열 이름 — 모델-형식 · 모델·형식 · 모델/형식 · Model Type 모두 모델·형식 칸으로', () => {
  ['모델-형식', '모델·형식', '모델/형식', '모델 형식', 'Model Type', '형식(모델)', '모델'].forEach(t => assert.equal(L.matchField(t), 'model', t));
  ['운영 상태', '인증 상태', '런닝 여부', '이력 상태'].forEach(t => assert.equal(L.matchField(t), 'state', t));
  assert.equal(L.matchField('중지 사유'), 'stopReason'); assert.equal(L.matchField('폐기 일자'), 'stopDate'); assert.equal(L.matchField('중지일'), 'stopDate');
});
test('묶음 키 — 띄어쓰기·대소문자·하이픈 모양이 달라도 같은 키, 빈칸·「-」는 키 없음', () => {
  const k = L.modelKey('HC-100 계열');
  assert.equal(k, 'HC100계열');
  ['hc100계열', ' HC–100  계열 ', 'HC—100 계열', 'HC－100 계열', 'Hc_100계열', 'HC‐100 계열'].forEach(v => assert.equal(L.modelKey(v), k, v));
  assert.notEqual(L.modelKey('HC-1000 계열'), k);
  ['', '-', '－', '없음', 'N/A', null].forEach(v => assert.equal(L.modelKey(v), '', String(v)));
});
test('운영 상태 글자 — 중지·폐기·만료 종료·갱신됨·운영 중, 진행 단계 칸에서는 분명한 말만', () => {
  const m = { '중지': 'stopped', '갱신 중단': 'stopped', '보류': 'stopped', '폐기': 'withdrawn', '단종': 'withdrawn', 'Withdrawn': 'withdrawn', '만료 종료': 'lapsed', '미갱신': 'lapsed', '갱신됨': 'renewed', '이전 인증서': 'renewed', '운영 중': 'active', '런닝': 'active', 'Running': 'active', '': '' };
  Object.keys(m).forEach(t => assert.equal(L.parseState(t), m[t], t));
  assert.equal(L.parseState('만료', true), '', '진행 단계의 「만료」 는 운영 상태가 아님');
  assert.equal(L.parseState('중지', true), 'stopped');
});
const H2 = ['인증기관', '인증 종류', '제품', '모델-형식', '인증서 번호', '발급일', '만료일', '진행 단계', '운영 상태', '중지 사유', '중지일'];
const LED2 = [H2,
  ['DNV', 'Type Approval', '실린더', 'C-1', 'TA-3', '2022-01-10', '2027-01-09', '준비', '운영 중', '', ''],
  ['DNV', 'Type Approval', '실린더', 'c 1', 'TA-2', '2017-01-10', '2022-01-09', '', '갱신됨', '', ''],            // 같은 줄의 지난 인증서
  ['BV', 'Type Approval', '실린더', 'C–1', 'TA-9', '2021-03-01', '2026-02-28', '', '중지', '고객 요구 없음', '2025-12-01'],
  ['KR', 'Type Approval', '밸브', 'V-7', 'TA-5', '2020-01-01', '2025-06-30', '중지', '', '', ''],                 // 운영 상태 칸이 비고 진행 단계에 「중지」
  ['ABS', 'Type Approval', '밸브', 'V-7', 'TA-6', '2023-01-01', '2028-01-01', '', '', '', '']];
test('관리대장 줄의 운영 상태 — 중지(사유·중지일), 진행 단계 칸의 「중지」, 「갱신됨」 줄은 이력으로', () => {
  const p = L.parseSheet(LED2);
  assert.equal(p.records.length, 5); assert.deepEqual(p.warnings, []);
  const [a, old, bv, kr, abs] = p.records;
  assert.equal(a.state, 'active'); assert.equal(old.isHistory, true); assert.equal(old.histState, 'renewed');
  assert.equal(bv.state, 'stopped'); assert.equal(bv.stopReason, '고객 요구 없음'); assert.equal(bv.stopDate, '2025-12-01'); assert.equal(bv.isHistory, false);
  assert.equal(kr.state, 'stopped'); assert.equal(kr.stage, 'none'); assert.equal(abs.state, 'active');
});
test('중지·종료 인증은 갱신 알림·대시보드 건수·월별 만료에서 빠지고 상태는 「중지」', () => {
  const r = importSheets([], readBook(LED2)).records;
  const bv = r.find(x => x.body === 'BV');
  const st = L.status(bv, S, TODAY2);
  assert.equal(st.code, 'inactive'); assert.equal(st.label, '중지'); assert.ok(/고객 요구 없음/.test(st.msg)); assert.equal(st.plan, undefined);
  assert.deepEqual(L.pendingEvents(bv, S, TODAY2), []);
  const al = L.alerts(r, S, TODAY2);
  assert.ok(!al.some(a => a.rec.body === 'BV' || a.rec.body === 'KR'), '알림에 중지 인증 없음');
  const sm = L.summary(r, S, TODAY2);
  assert.equal(sm.count.inactive, 2); assert.equal(sm.running, 2); assert.equal(sm.count.expired, 0, '만료일이 지난 중지 인증이 「만료」로 세지지 않음');
  assert.ok(!sm.attention.some(x => x.rec.body === 'KR'));
  // 되돌리면 알림이 돌아옴
  const back = L.setState(bv, 'active', '', '', TODAY2);
  assert.equal(L.status(back, S, TODAY2).code, 'expired'); assert.equal(back.stopReason, '');
});
test('이력 붙이기 — 표기가 다른 같은 모델 줄에 붙고, 같은 이력은 한 번만, 붙일 데 없는 줄은 인증 한 건으로', () => {
  const sheets = readBook(LED2, [['모델-형식', '인증기관', '인증 종류', '인증서 번호', '발급일', '만료일', '이력 상태', '사유'],
    ['C 1', 'DNV', 'Type Approval', 'TA-1', '2012-01-10', '2017-01-09', '갱신됨', ''],
    ['C-1', 'DNV', 'Type Approval', 'TA-2', '2017-01-10', '2022-01-09', '갱신됨', ''],      // 관리대장 줄과 같음 → 한 번만
    ['Z-9', 'LR', 'Type Approval', 'TA-77', '2015-01-01', '2020-01-01', '갱신됨', ''],
    ['Z-9', 'LR', 'Type Approval', 'TA-78', '2020-01-02', '2025-01-01', '폐기', '모델 단종']]);
  const r = importSheets([], sheets);
  assert.equal(r.pick, '관리대장');
  const dnv = r.records.find(x => x.body === 'DNV');
  assert.deepEqual(dnv.history.map(x => x.certNo), ['TA-1', 'TA-2']); assert.equal(r.stat.dup, 1);
  const z = r.records.find(x => x.model === 'Z-9');
  assert.equal(z.certNo, 'TA-78'); assert.equal(z.state, 'withdrawn'); assert.equal(z.stopReason, '모델 단종'); assert.deepEqual(z.history.map(x => x.certNo), ['TA-77']);
  assert.ok(r.records.every(x => x.isHistory === undefined && x.histState === undefined), '가져오기 표시는 저장하지 않음');
  // 같은 파일을 다시 넣어도 이력이 늘지 않음
  const again = importSheets(r.records, sheets);
  assert.equal(again.records.length, r.records.length); assert.equal(again.records.find(x => x.body === 'DNV').history.length, 2);
});
test('모델-형식 묶음 — 같은 모델의 기관별 인증과 지난 인증서를 최근 것부터, 중지 인증 포함', () => {
  const r = importSheets([], readBook(LED2)).records;
  const g = L.groupByModel(r, S, TODAY2);
  const c1 = g.find(x => x.key === 'C1');
  assert.equal(c1.records.length, 2); assert.equal(c1.running, 1); assert.equal(c1.stopped, 1); assert.equal(c1.histCount, 1);
  assert.deepEqual(c1.entries.map(e => e.certNo), ['TA-3', 'TA-9', 'TA-2']);
  assert.deepEqual(c1.names.sort(), ['C-1', 'C–1']);
  assert.equal(g.find(x => x.key === 'V7').records.length, 2);
});
test('과거 이력 직접 더하기 — 날짜·중복 확인, 이력은 날짜 순, 원본은 그대로', () => {
  const rec = { body: 'DNV', kind: 'TA', model: 'C-1', certNo: 'TA-3', issued: '2022-01-10', expires: '2027-01-09', history: [] };
  const n1 = L.addHistory(rec, { certNo: 'TA-2', issued: '2017-01-10', expires: '2022-01-09' });
  const n2 = L.addHistory(n1, { certNo: 'TA-0', issued: '2007-01-10', expires: '2012-01-09', state: 'stopped', reason: '설계 변경' });
  assert.deepEqual(n2.history.map(x => x.certNo), ['TA-0', 'TA-2']); assert.equal(n2.history[0].state, 'stopped'); assert.equal(n2.history[1].state, 'renewed');
  assert.equal(rec.history.length, 0);
  assert.throws(() => L.addHistory(n2, { certNo: 'TA-2', issued: '2017-01-10', expires: '2022-01-09' }), /이미 있습니다/);
  assert.throws(() => L.addHistory(n2, { certNo: 'TA-3', issued: '2022-01-10', expires: '2027-01-09' }), /지금 인증서/);
  assert.throws(() => L.addHistory(n2, { certNo: 'X' }), /발급일이나 만료일/);
  assert.throws(() => L.addHistory(n2, { certNo: 'X', issued: '2020-01-01', expires: '2019-01-01' }), /늦습니다/);
});
test('다음 주기로 넘기면 지금 인증서의 PDF 도 이력으로 내려감', () => {
  const r = { body: 'DNV', kind: 'TA', certNo: 'TA-1', issued: '2022-01-10', expires: '2027-01-09', stage: 'done', history: [], pdf: { id: 'pdf1', name: 'TA-1.pdf', size: 900 } };
  const n = L.renewRecord(r, { certNo: 'TA-9', expires: '2031-12-19' }, '2026-12-21');
  assert.equal(n.pdf, null); assert.equal(n.history[0].pdf.id, 'pdf1');
});
test('다시 가져와도 도구에서 정한 운영 상태·사유·PDF 는 지키고, 파일에 운영 상태가 있으면 그것을 따름', () => {
  const a = L.parseSheet(TINY).records.map(r => (r.state = 'active', r));
  const stopped = L.setState(a[0], 'stopped', '고객 요구 없음', '2026-10-01', TODAY2); stopped.pdf = { id: 'p9', name: 'x.pdf', size: 1 };
  const m = L.mergeRecords([stopped, a[1], a[2]], L.parseSheet(TINY).records);
  assert.equal(m.records[0].state, 'stopped'); assert.equal(m.records[0].stopReason, '고객 요구 없음'); assert.equal(m.records[0].pdf.id, 'p9');
  const withState = L.parseSheet([H2, ['DNV', 'Type Approval', '실린더', 'C-1', 'TA-1', '2022-01-10', '2027-01-09', '준비', '운영 중', '', '']]).records;
  const m2 = L.mergeRecords([Object.assign({}, stopped, { model: 'C-1', product: '실린더', key: undefined })].map(r => (r.key = L.recordKey(r), r)), withState);
  assert.equal(m2.records[0].state, 'active');
});
test('옛 저장(1단계 v1)을 그대로 옮김 — 22건·값·상태 신호가 같고, 운영 중·이력 id 가 붙음', () => {
  // 1단계 화면에서 저장되던 모양: state·pdf 칸 없음, 이력은 { certNo, issued, expires, applied, distributed, closed }
  const v1 = { v: 1, records: Sample.build(TODAY2).records.map((e, i) => ({ body: e.body, kind: e.kind, product: e.product, model: e.model, certNo: e.certNo, issued: e.issued, expires: e.expires, stage: e.stage, applied: '', leadDays: e.leadDays, owner: '품질', person: '담당', distributed: e.distributed, note: '메모' + i, history: i === 3 ? [{ certNo: 'OLD-1', issued: '2016-01-01', expires: '2021-01-01', applied: '', distributed: '', closed: '2021-01-02' }] : [], key: 'k' + i, id: 'c' + i })),
    files: [{ name: '내 관리대장.xlsx', sheet: 'Sheet1', rows: 22 }], settings: { urgentDays: 60 }, sample: false };
  const before = v1.records.map(r => L.status(r, S, TODAY2).code);
  const raw = JSON.stringify(v1);
  const db = L.restoreDb(JSON.parse(raw));
  assert.equal(db.v, 2); assert.equal(db.records.length, 22);
  db.records.forEach((r, i) => {
    const o = v1.records[i];
    ['body', 'kind', 'product', 'model', 'certNo', 'issued', 'expires', 'stage', 'note', 'id', 'key', 'distributed'].forEach(f => assert.equal(r[f], o[f], i + ' ' + f));
    assert.equal(r.state, 'active'); assert.equal(r.pdf, null);
  });
  assert.deepEqual(db.records.map(r => L.status(r, S, TODAY2).code), before, '상태 신호가 옮기기 전과 같음');
  const h = db.records[3].history[0];
  assert.equal(h.certNo, 'OLD-1'); assert.equal(h.closed, '2021-01-02'); assert.equal(h.state, 'renewed'); assert.ok(h.id);
  // 두 번 옮겨도 같음(id 가 바뀌지 않음)
  const twice = L.restoreDb(JSON.parse(JSON.stringify(db)));
  assert.equal(twice.records[3].history[0].id, h.id); assert.deepEqual(twice.records.map(r => r.state), db.records.map(r => r.state));
});
test('가상 샘플(2차) — 관리대장 22건(운영 중) + 이력 시트 → 25건(중지·종료 3), 지난 인증서 7줄, 운영 중 분포는 1단계와 같음', () => {
  const sb = Sample.build(TODAY2);
  const r = importSheets([], readBook(sb.aoa, sb.histAoa));
  assert.equal(r.main.records.length, 22); assert.equal(r.hist[0].records.length, 10); assert.deepEqual(r.hist[0].warnings, []);
  assert.equal(r.records.length, 25); assert.equal(r.stat.created, 3); assert.equal(r.stat.attached, 7);
  const sm = L.summary(r.records, S, TODAY2);
  assert.equal(sm.running, 22); assert.equal(sm.count.inactive, 3);
  assert.deepEqual([sm.count.expired, sm.count.late, sm.count.urgent, sm.count.distribute, sm.count.active, sm.count.soon, sm.count.ok, sm.count.done], [2, 2, 3, 1, 4, 1, 8, 1]);
  const g = L.groupByModel(r.records, S, TODAY2);
  const hc = g.find(x => x.key === 'HC100계열'), dv = g.find(x => x.key === 'DV20'), gp = g.find(x => x.key === 'GP25');
  assert.equal(hc.records.length, 2); assert.equal(hc.stopped, 1); assert.equal(hc.histCount, 3); assert.ok(hc.names.includes('hc-100계열'));
  assert.equal(dv.records.length, 2); assert.equal(dv.stopped, 1);
  assert.equal(gp.running, 0); assert.equal(gp.worst, null); assert.equal(gp.records[0].state, 'withdrawn');
  // 지난 인증서는 만료일이 이어짐(다음 인증서 발급 전날 만료)
  const dnv = r.records.find(x => x.model === 'HC-100 계열' && x.body === 'DNV');
  assert.equal(L.addDays(dnv.history[1].expires, 1), dnv.issued);
  // PDF 6장 — 붙일 줄이 모두 있음
  assert.equal(sb.pdfs.length, 6);
  sb.pdfs.forEach(p => {
    const rec = r.records.find(x => L.lineKey(x) === L.lineKey(p));
    assert.ok(rec && (rec.certNo === p.certNo || rec.history.some(h => h.certNo === p.certNo)), p.name);
  });
});
test('샘플 PDF — %PDF 머리, xref 위치가 맞고, 한글 없이(글꼴 Helvetica) 인증서 번호가 글자층에', () => {
  const sb = Sample.build(TODAY2), t = Sample.pdfString(sb.pdfs[0].text);
  assert.ok(t.startsWith('%PDF-1.4')); assert.ok(t.trim().endsWith('%%EOF')); assert.ok(!/[^\x00-\x7f]/.test(t));
  const xref = Number(/startxref\n(\d+)/.exec(t)[1]); assert.equal(t.slice(xref, xref + 4), 'xref');
  const offs = [...t.matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
  offs.forEach((o, i) => assert.equal(t.slice(o, o + String(i + 1).length + 6), (i + 1) + ' 0 obj'));
  assert.ok(t.includes(sb.pdfs[0].certNo)); assert.ok(t.includes('HC-100 series'));
  assert.equal(Sample.pdfBytes('x')[0], 37);
});
test('내보낸 관리대장 엑셀(관리대장 + 인증 이력)을 그대로 다시 넣어도 같음 — 운영 상태·이력·묶음', () => {
  const sb = Sample.build(TODAY2), r = importSheets([], readBook(sb.aoa, sb.histAoa)).records;
  const back = importSheets([], readBook([L.LEDGER_HEAD].concat(L.ledgerRows(r, S, TODAY2)), [L.HISTORY_HEAD].concat(L.historyRows(r))));
  assert.deepEqual(back.main.det.warnings, []);
  assert.equal(back.records.length, 25);
  const key = x => L.lineKey(x) + '|' + x.certNo;
  const A = Object.fromEntries(r.map(x => [key(x), x])), B = Object.fromEntries(back.records.map(x => [key(x), x]));
  assert.deepEqual(Object.keys(B).sort(), Object.keys(A).sort());
  Object.keys(A).forEach(k => {
    assert.equal(B[k].state, A[k].state, k); assert.equal(B[k].stopReason, A[k].stopReason, k); assert.equal(B[k].stage, A[k].stage, k);
    assert.equal(B[k].applied, A[k].applied, k + ' 신청일(계획 「신청 기한」 열이 아님)');
    assert.deepEqual(B[k].history.map(h => h.certNo + h.state), A[k].history.map(h => h.certNo + h.state), k);
  });
});

const { versions } = await import('../scripts/bump-version.mjs');
test('판 맞추기 — index.html ?v= · logic.js · app.js 가 같은 판 (scripts/bump-version.mjs)', () => {
  const v = versions();
  assert.equal(v.logic, L.VERSION, 'logic.js VERSION'); assert.equal(v.app, L.VERSION, 'app.js APP_VERSION');
  assert.ok(v.html.length >= 11 && v.html.every(x => x === L.VERSION), 'index.html 의 모든 js·css 에 ?v=' + L.VERSION + ' — ' + JSON.stringify(v.html));
});

console.log('\n' + passed + '개 통과' + (process.exitCode ? ' — 실패 있음' : ''));

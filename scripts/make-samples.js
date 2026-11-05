// 가상 샘플 파일 만들기: node scripts/make-samples.js [기준일 YYYY-MM-DD]
// js/sample-data.js 의 관리대장 22건을 .xlsx 로, 이전/신규 인증서 글을 .txt 와 글자층 있는 .pdf 로 씁니다(전부 지어낸 값).
// 방금 쓴 엑셀을 앱과 같은 방식으로 다시 읽어 행 수·날짜가 맞는지 확인합니다. 기준일 기본값은 2026-10-21.
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const L = require('../js/logic.js');
const Sample = require('../js/sample-data.js');

const base = process.argv[2] || '2026-10-21';
const out = path.join(__dirname, '..', 'samples');
fs.mkdirSync(out, { recursive: true });
const b = Sample.build(base);

// 1) 관리대장 엑셀 — 날짜 칸은 엑셀 날짜로
const aoa = b.aoa.map((row, i) => i < 3 ? row : row.map((v, c) => ([6, 7, 13].includes(c) && typeof v === 'string' && v) ? new Date(v + 'T00:00:00') : v));
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'yyyy-mm-dd' });
ws['!cols'] = [{ wch: 4 }, { wch: 8 }, { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 9 }, { wch: 8 }, { wch: 26 }, { wch: 10 }, { wch: 11 }];
XLSX.utils.book_append_sheet(wb, ws, '관리대장');
// 1-2) 이력 시트(2차) — 지난 인증서 · 중지·종료된 인증
const haoa = b.histAoa.map((row, i) => i < 2 ? row : row.map((v, c) => ([5, 6, 9].includes(c) && typeof v === 'string' && v) ? new Date(v + 'T00:00:00') : v));
const hws = XLSX.utils.aoa_to_sheet(haoa, { cellDates: true, dateNF: 'yyyy-mm-dd' });
hws['!cols'] = [{ wch: 13 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 30 }, { wch: 11 }, { wch: 16 }];
XLSX.utils.book_append_sheet(wb, hws, '인증 이력');
const file = path.join(out, '인증_관리대장_샘플.xlsx');
fs.writeFileSync(file, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellDates: true }));
const back = XLSX.read(fs.readFileSync(file), { type: 'buffer', cellDates: true });
const p = L.parseSheet(XLSX.utils.sheet_to_json(back.Sheets['관리대장'], { header: 1, raw: true, defval: null }));
if (p.det.missing.length || p.warnings.length || p.records.length !== b.records.length) throw new Error('다시 읽기 실패: ' + JSON.stringify(p.det.warnings.concat(p.warnings).slice(0, 3)));
p.records.forEach((r, i) => { if (r.expires !== b.records[i].expires || r.issued !== b.records[i].issued || r.distributed !== b.records[i].distributed) throw new Error((i + 1) + '행 날짜가 다름'); });
const hp = L.parseSheet(XLSX.utils.sheet_to_json(back.Sheets['인증 이력'], { header: 1, raw: true, defval: null }), { history: true });
if (hp.det.missing.length || hp.warnings.length || hp.records.length !== b.hist.length) throw new Error('이력 시트 다시 읽기 실패: ' + JSON.stringify(hp.det.warnings.concat(hp.warnings).slice(0, 3)));
const at = L.attachHistory(p.records, hp.records.filter(r => r.isHistory));
console.log('인증_관리대장_샘플.xlsx · 인증', p.records.length, '건 + 이력 시트', hp.records.length, '줄 → 인증', at.records.length, '건(새로 세운 중지·종료', at.stat.created, ') · 붙인 이력', at.stat.attached, '· 기준일', base);

// 2) 인증서 글 — .txt
fs.writeFileSync(path.join(out, '인증서_이전_샘플.txt'), Sample.OLD + '\n');
fs.writeFileSync(path.join(out, '인증서_신규_샘플.txt'), Sample.NEW + '\n');

// 3) 같은 글을 글자층 있는 PDF 로(Helvetica, 영문만) — ⑥ 화면의 「PDF 고르기」 시험용. 만드는 함수는 js/sample-data.js 의 pdfString(브라우저 샘플과 같음)
const pdf = text => Buffer.from(Sample.pdfString(text), 'latin1');
fs.writeFileSync(path.join(out, '인증서_이전_샘플.pdf'), pdf(Sample.OLD));
fs.writeFileSync(path.join(out, '인증서_신규_샘플.pdf'), pdf(Sample.NEW));
console.log('인증서_이전/신규_샘플 .txt · .pdf');

// 4) 인증서 첨부용 PDF 한 장(2차) — 「모델·형식별 이력」 화면에서 PDF 붙이기 시험용
fs.writeFileSync(path.join(out, '인증서_첨부_샘플.pdf'), pdf(b.pdfs[0].text));
console.log('인증서_첨부_샘플.pdf ·', b.pdfs[0].name.replace(/\.pdf$/, ''));

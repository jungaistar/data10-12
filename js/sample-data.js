/* 가상 샘플 — 인증 관리대장 22건 + 이전/신규 인증서 글(전부 지어낸 값)
   인증기관 이름(DNV·ABS·LR·KR·BV·CCS·RINA·ClassNK)은 공개된 선급 이름만 쓰고, 제품·모델·인증서 번호·담당자는 모두 가상입니다.
   만료일은 「기준일」에서 며칠 뒤로 정해, 언제 열어도 만료·지연·임박·배포 필요·준비 시작·준비 예정·정상·완료가 고루 보이게 했습니다.
   (기본 설정 기준. Type Approval 리드타임 179일 = 준비 60 + 기관 심사 45 + 피드백 30 + 발급 14 + 여유 30) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'));
  else root.CTSample = factory(root.CTLogic);
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';

  var HEAD = ['No', '선급', '인증 구분', '제품군', '모델-형식', '인증서 No.', '발급일자', '유효기간', '진행 상태', '담당 부서', '담당자', '비고'];
  // [선급, 인증 구분, 제품군, 모델, 만료(기준일 + 일), 진행 상태, 배포(완료 건), 주관 부서, 담당자, 비고, 리드타임(일·선택)]
  var ROWS = [
    ['DNV', 'Type Approval', '유압 실린더', 'HC-100 계열', 40, '기관 심사', '', '품질', '담당A', '시험 입회 일정 조율 중'],          // 임박
    ['ABS', 'Type Approval', '방향제어밸브', 'DV-20', 95, '준비', '', '품질', '담당B', ''],                                  // 지연(신청 기한 지남)
    ['LR', 'Type Approval', '유압 펌프', 'PV-45', 150, '준비', '', '품질', '담당A', ''],                                       // 준비 시작(진행 중)
    ['KR', 'Type Approval', '호스 어셈블리', 'HA-12', 185, '', '', '품질', '담당C', ''],                                      // 준비 예정
    ['BV', 'Type Approval', '피팅', 'FT-08', 400, '', '', '품질', '담당C', ''],                                               // 정상
    ['DNV', 'Works Approval', '공장 전체', '-', -12, '심사', '', '품질', '담당A', '공장 심사 보완 요청 대응 중'],                  // 만료
    ['KR', 'Works Approval', '공장 전체', '-', 260, '', '', '품질', '담당B', ''],                                              // 정상
    ['ABS', 'Type Approval', '유압 모터', 'HM-30', 20, '발급 완료', '', '품질', '담당B', '신규 인증서 수령'],                    // 배포 필요
    ['LR', 'Type Approval', '유압 실린더', 'HC-200 계열', 70, '발급 완료', 'Y', '품질', '담당A', ''],                           // 완료
    ['RINA', 'Type Approval', '밸브 블록', 'VB-10', 330, '', '', '개발', '담당D', ''],                                         // 정상
    ['CCS', 'Type Approval', '유압 펌프', 'PV-60', 175, '', '', '품질', '담당C', ''],                                          // 준비 시작(오늘 무렵)
    ['ClassNK', 'Type Approval', '유압 실린더', 'HC-300 계열', 600, '', '', '품질', '담당A', '', 240],                         // 정상(리드타임 240일 지정)
    ['BV', 'Works Approval', '공장 전체', '-', 130, '신청', '', '품질', '담당B', ''],                                          // 진행 중
    ['KR', 'ISO 9001', '품질경영시스템', '-', 45, '심사', '', '품질', '담당D', '사후 심사 일정 확정'],                          // 임박
    ['DNV', 'Type Approval', '어큐뮬레이터', 'AC-05', 210, '', '', '개발', '담당D', ''],                                       // 정상(내일 준비 예정 안내)
    ['ABS', 'Works Approval', '공장 전체', '-', 500, '', '', '품질', '담당B', ''],                                             // 정상
    ['KR', 'Type Approval', '오일 쿨러', 'OC-15', 88, '신청', '', '개발', '담당C', ''],                                         // 진행 중
    ['LR', 'Works Approval', '공장 전체', '-', 60, '심사', '', '품질', '담당A', ''],                                           // 임박
    ['BV', 'Type Approval', '유압 실린더', 'HC-400 계열', -40, '', '', '품질', '담당C', '갱신 여부 영업 확인 필요'],              // 만료
    ['DNV', 'Type Approval', '방향제어밸브', 'DV-40', 720, '', '', '품질', '담당B', ''],                                       // 정상
    ['CCS', 'Works Approval', '공장 전체', '-', 300, '', '', '품질', '담당D', ''],                                             // 정상
    ['RINA', 'Type Approval', '유압 펌프', 'PV-80', 110, '', '', '개발', '담당D', '']                                         // 지연(준비 시작 지남)
  ];
  var YEARS = { 'Type Approval': 5, 'Works Approval': 3, 'ISO 9001': 3 };
  var PREFIX = { 'Type Approval': 'TA', 'Works Approval': 'WA', 'ISO 9001': 'QMS' };

  /* today: 'YYYY-MM-DD' (기준일). 반환 { aoa, records(기대값), compare } */
  function build(today) {
    var aoa = [['인증 관리대장 (가상 샘플)'], ['기준일 ' + today + ' · 모든 값은 지어낸 것입니다'], HEAD];
    var expect = [];
    ROWS.forEach(function (r, i) {
      var exp = L.addDays(today, r[4]);
      var issued = L.addYears(exp, -YEARS[r[1]]);
      issued = L.addDays(issued, 1);
      var no = PREFIX[r[1]] + '-' + issued.slice(2, 4) + '-' + String(1000 + i * 37).slice(-4);
      var dist = r[6] === 'Y' ? L.addDays(today, -5) : '';
      var note = r[9] + (dist ? (r[9] ? ' · ' : '') + '배포 ' + dist : '');
      aoa.push([i + 1, r[0], r[1], r[2], r[3], no, issued, exp, r[5], r[7], r[8], note]);
      expect.push({ body: r[0], kind: r[1], product: r[2], model: r[3], certNo: no, issued: issued, expires: exp, stage: L.parseStage(r[5]), distributed: dist, leadDays: r[10] || null, offset: r[4] });
    });
    // 리드타임(일) 열 — 한 건만 값이 있음(ClassNK). 대장에 이런 열이 있으면 그 값을 씁니다
    // 운영 상태 열 — 관리대장의 22건은 모두 「운영 중」(런닝). 중지·종료된 인증은 이력 시트에 있습니다
    aoa[2] = HEAD.concat(['갱신 리드타임(일)', '배포일', '운영 상태']);
    for (var k = 3; k < aoa.length; k++) { var e = expect[k - 3]; aoa[k] = aoa[k].concat([e.leadDays || '', e.distributed || '', '운영 중']); }
    var hist = historySample(today, expect);
    return { aoa: aoa, records: expect, compare: compareSample(), histAoa: hist.aoa, hist: hist.rows, pdfs: pdfSample(today, expect, hist.rows) };
  }

  /* 이력 시트 — 지난 인증서와 중지·종료된 인증(2차). 모델·형식 표기를 일부러 조금씩 다르게 적었습니다(hc-100계열 · DV20) — 같은 묶음으로 모이는지 보려고.
     [모델-형식, 선급, 인증 구분, 제품군, 지금 인증서 기준 몇 주기 전(0 = 그 줄이 마지막), 만료(기준일 + 일, 직접 줄 때), 이력 상태, 사유, 중지일(기준일 + 일), 비고] */
  var HIST = [
    ['HC-100 계열', 'DNV', 'Type Approval', '유압 실린더', 1, null, '갱신됨', '', null, ''],
    ['HC-100 계열', 'DNV', 'Type Approval', '유압 실린더', 2, null, '갱신됨', '', null, '최초 형식승인'],
    ['DV-20', 'ABS', 'Type Approval', '방향제어밸브', 1, null, '갱신됨', '', null, ''],
    ['PV-45', 'LR', 'Type Approval', '유압 펌프', 1, null, '갱신됨', '', null, '규칙 개정으로 시험 추가'],
    ['HM-30', 'ABS', 'Type Approval', '유압 모터', 1, null, '중지', '설계 변경으로 일시 중지 후 재신청', -1900, ''],
    ['hc-100계열', 'BV', 'Type Approval', '유압 실린더', 0, -150, '중지', '고객 요구 없어 갱신 중지 — 영업 확인', -200, ''],
    ['hc-100계열', 'BV', 'Type Approval', '유압 실린더', 1, -150, '갱신됨', '', null, ''],
    ['DV20', 'RINA', 'Type Approval', '방향제어밸브', 0, -400, '만료 종료', '수출 지역 변경으로 갱신하지 않음', -400, ''],
    ['GP-25', 'KR', 'Type Approval', '기어 펌프', 0, -300, '폐기', '모델 단종', -700, ''],
    ['GP-25', 'KR', 'Type Approval', '기어 펌프', 1, -300, '갱신됨', '', null, '']
  ];
  var HIST_HEAD = ['모델-형식', '선급', '인증 구분', '제품군', '인증서 No.', '발급일자', '유효기간', '이력 상태', '중지 사유', '중지일', '비고'];
  function historySample(today, expect) {
    var aoa = [['인증 이력 (가상 샘플) — 지난 인증서 · 중지·종료된 인증'], HIST_HEAD], rows = [];
    HIST.forEach(function (h, i) {
      var years = YEARS[h[2]], cur = expect.filter(function (e) { return e.model === h[0] && e.body === h[1] && e.kind === h[2]; })[0];
      var lastExp = cur ? cur.expires : L.addDays(today, h[5]);
      var exp = lastExp;
      for (var c = 0; c < h[4]; c++) exp = L.addDays(L.addDays(L.addYears(exp, -years), 1), -1);   // 한 주기 앞: 다음 발급일 하루 전에 만료
      var issued = L.addDays(L.addYears(exp, -years), 1);
      var no = PREFIX[h[2]] + '-' + issued.slice(2, 4) + '-' + String(5000 + i * 53).slice(-4);
      var stop = h[8] == null ? '' : L.addDays(today, h[8]);
      var row = { model: h[0], body: h[1], kind: h[2], product: h[3], certNo: no, issued: issued, expires: exp, state: h[6], reason: h[7], stopDate: stop, note: h[9], back: h[4] };
      rows.push(row);
      aoa.push([h[0], h[1], h[2], h[3], no, issued, exp, h[6], h[7], stop, h[9]]);
    });
    return { aoa: aoa, rows: rows };
  }
  /* 인증서 PDF(가상) — 몇 건에만 붙입니다. 어느 줄에 붙일지: { model, body, kind, certNo } */
  function pdfSample(today, expect, hist) {
    var out = [];
    function one(x, title) {
      out.push({ model: x.model, body: x.body, kind: x.kind, certNo: x.certNo, name: x.certNo + '.pdf', text: certText(x, title) });
    }
    expect.filter(function (e) { return ['HC-100 계열', 'DV-20', 'PV-45', 'HM-30'].indexOf(e.model) >= 0 && e.kind === 'Type Approval' && ['DNV', 'ABS', 'LR'].indexOf(e.body) >= 0; }).forEach(function (e) { one(e, 'TYPE APPROVAL CERTIFICATE'); });
    hist.filter(function (h) { return (h.model === 'HC-100 계열' && h.back === 1) || (h.model === 'GP-25' && h.back === 0); }).forEach(function (h) { one(h, 'TYPE APPROVAL CERTIFICATE'); });
    return out;
  }
  function ascii(s) { return String(s || '').replace(/계열/g, 'series').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim(); }
  var PRODUCT_EN = { '유압 실린더': 'Hydraulic cylinder', '방향제어밸브': 'Directional control valve', '유압 펌프': 'Hydraulic pump', '유압 모터': 'Hydraulic motor', '기어 펌프': 'Gear pump' };
  function certText(x, title) {
    return [title + ' (SAMPLE - FICTITIOUS)', 'Certificate No.: ' + x.certNo, 'Society: ' + x.body, 'Date of issue: ' + x.issued, 'Valid until: ' + x.expires,
      'Manufacturer: Example Hydraulics Ltd.', 'Product: ' + (PRODUCT_EN[x.product] || ascii(x.product) || '-'), 'Type designation: ' + (ascii(x.model) || '-'),
      'This document is a generated sample for testing. All values are invented.'].join('\n');
  }
  /* 글자층 있는 1쪽 PDF(Helvetica, 영문만)를 글자(바이트마다 한 글자)로 — 브라우저·node 공용 */
  function pdfString(text) {
    var esc = function (s) { return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); };
    var lines = text.split('\n');
    var content = 'BT /F1 11 Tf 56 790 Td 15 TL\n';
    lines.forEach(function (l, i) {
      var m = /^([^:]+):\s*(.*)$/.exec(l);
      if (i === 0) content += '/F1 15 Tf (' + esc(l) + ') Tj /F1 11 Tf T* T*\n';
      else if (m && !/^\d+\./.test(l)) content += '(' + esc(m[1] + ':') + ') Tj 170 0 Td (' + esc(m[2]) + ') Tj -170 0 Td T*\n';   // 칸이 벌어진 표 모양
      else content += '(' + esc(l) + ') Tj T*\n';
    });
    content += 'ET';
    var objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    ];
    var body = '%PDF-1.4\n', offs = [];
    objs.forEach(function (o, i) { offs.push(body.length); body += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = body.length;
    body += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(function (o) { return ('0000000000' + o).slice(-10) + ' 00000 n \n'; }).join('');
    body += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    return body;
  }
  function pdfBytes(text) { var s = pdfString(text), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }

  /* 이전/신규 인증서 — 같은 형식의 가상 형식승인 인증서. 바뀐 곳: 번호·발급일·유효기간(정기), 보어 범위·정격압력·시험압력·규칙 판·적용 범위·제조 장소·조건 3·4 */
  var OLD = [
    'TYPE APPROVAL CERTIFICATE',
    'Certificate No.: TA-21-0457',
    'Date of issue: 2021-11-30',
    'Valid until: 2026-11-29',
    'Manufacturer: Example Hydraulics Ltd.',
    'Contact: cert.team@example-hydraulics.test',
    'Product: Hydraulic cylinder',
    'Type designation: HC-100 series',
    'Bore diameter: 40 - 200 mm',
    'Rated pressure: 350 bar',
    'Test pressure: 525 bar',
    'Operating temperature: -20 to +80 deg C',
    'Rules: Rules for Classification, Part 4 Chapter 7 (edition July 2020)',
    'Application: Steering gear and deck machinery',
    'Place of manufacture: Plant 1',
    'Conditions of approval:',
    '1. Each cylinder shall be pressure tested at 1.5 x rated pressure.',
    '2. Material certificates shall be type 3.1 according to EN 10204.',
    '3. Marking shall include type designation and serial number.'
  ].join('\n');
  var NEW = [
    'TYPE APPROVAL CERTIFICATE',
    'Certificate No.: TA-26-0981',
    'Date of issue: 2026-10-15',
    'Valid until: 2031-10-14',
    'Manufacturer: Example Hydraulics Ltd.',
    'Contact: cert.team@example-hydraulics.test',
    'Product: Hydraulic cylinder',
    'Type designation: HC-100 series',
    'Bore diameter: 40 - 250 mm',
    'Rated pressure: 420 bar',
    'Test pressure: 630 bar',
    'Operating temperature: -20 to +80 deg C',
    'Rules: Rules for Classification, Part 4 Chapter 7 (edition January 2025)',
    'Application: Steering gear, deck machinery and offshore cranes',
    'Place of manufacture: Plant 1 and Plant 2',
    'Conditions of approval:',
    '1. Each cylinder shall be pressure tested at 1.5 x rated pressure.',
    '2. Material certificates shall be type 3.1 according to EN 10204.',
    '3. Marking shall include type designation, serial number and rated pressure.',
    '4. Type testing shall be repeated when design changes affect pressure-retaining parts.'
  ].join('\n');
  function compareSample() {
    return { oldText: OLD, newText: NEW, oldName: '인증서_이전_샘플.txt', newName: '인증서_신규_샘플.txt', maskWords: ['Example Hydraulics Ltd.', 'example-hydraulics'] };
  }

  return { HEAD: HEAD, ROWS: ROWS, HIST: HIST, HIST_HEAD: HIST_HEAD, build: build, compareSample: compareSample, OLD: OLD, NEW: NEW, pdfString: pdfString, pdfBytes: pdfBytes, certText: certText };
});

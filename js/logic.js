/* 인증(Certification) 갱신 관리 — 순수 로직 (브라우저·node 공용, 화면 코드 없음)
   1. 글자·날짜          2. 관리대장 열 찾기     3. 행 읽기·합치기
   4. 설정(리드타임·부서·알림 규칙)              5. 갱신 계획(만료일 역산)
   6. 상태 신호           7. 알림·메일 초안       8. 업무흐름·R/R(RACI)
   9. 인증서 비교         10. 이름 가리기·AI 프롬프트
   11. 집계·내보내기 표   12. 저장 모양
   실제 관리대장·인증서는 아직 받지 않았습니다(기획서 10장 ①②). 열 이름 별칭은 흔한 표기를 넓게 잡아 두었습니다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CTLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* 판(版) — index.html 의 ?v= · app.js 의 APP_VERSION 과 같아야 합니다(scripts/bump-version.mjs 로 함께 올림).
     브라우저가 옛 logic.js 와 새 app.js 를 섞어 쓰면 app.js 가 이 값을 보고 계산을 멈춥니다. */
  var VERSION = '2026-11-11.6';

  /* ── 1. 글자·날짜 ─────────────────────────────────────────── */
  function str(v) { return v == null ? '' : String(v).trim(); }
  function norm(s) { return String(s == null ? '' : s).replace(/[\s()（）\[\]·.,:;_\/\-~'"#*]/g, '').toLowerCase(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoFromUTC(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function isoOk(y, m, d) {
    if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    var t = Date.UTC(y, m - 1, d), x = new Date(t);
    return x.getUTCMonth() === m - 1 ? isoFromUTC(t) : '';
  }
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  function monthNo(s) { return MONTHS[String(s).toLowerCase().slice(0, 4)] || MONTHS[String(s).toLowerCase().slice(0, 3)] || 0; }
  /* 엑셀 날짜(일련번호 · Date · 글자) → 'YYYY-MM-DD'. 못 읽으면 ''.
     읽는 글자: 2027-03-15 · 2027.3.15 · 2027년 3월 15일 · 15-Mar-2027 · 15 March 2027 · March 15, 2027 · 15.03.2027(일.월.년) · 15/03/2027
     「/」로 쓴 일·월이 둘 다 12 이하이면 일/월 순으로 읽고 isAmbiguousDate 로 알립니다(선급 인증서는 대개 일·월·년 순). */
  function toISO(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date || Object.prototype.toString.call(v) === '[object Date]') {
      if (isNaN(v.getTime())) return '';
      var d = new Date(v.getTime() + 12 * 3600 * 1000);
      return isoOk(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
    if (typeof v === 'number') {
      if (v < 20000 || v > 80000) return '';
      return isoFromUTC(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    }
    var s = String(v).trim(), m;
    if ((m = /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/.exec(s))) return isoOk(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[\s\-./]+([A-Za-z]{3,9})\.?[\s\-./,]+(\d{4})$/.exec(s)) && monthNo(m[2])) return isoOk(+m[3], monthNo(m[2]), +m[1]);
    if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s)) && monthNo(m[1])) return isoOk(+m[3], monthNo(m[1]), +m[2]);
    if ((m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s))) {
      var a = +m[1], b = +m[2];
      if (b > 12 && a <= 12) return isoOk(+m[3], a, b);   // 월/일 로만 읽힘
      return isoOk(+m[3], b, a);
    }
    if ((m = /^(\d{2})[-./](\d{1,2})[-./](\d{1,2})$/.exec(s))) return isoOk(2000 + +m[1], +m[2], +m[3]);
    if (/^\d{5}(\.\d+)?$/.test(s)) return toISO(Number(s));
    return '';
  }
  function isAmbiguousDate(v) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str(v));
    return !!(m && +m[1] <= 12 && +m[2] <= 12 && m[1] !== m[2]);
  }
  function isoToUTC(iso) { var p = String(iso).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function addDays(iso, n) { return isoFromUTC(isoToUTC(iso) + n * 86400000); }
  function daysBetween(a, b) { return Math.round((isoToUTC(b) - isoToUTC(a)) / 86400000); }
  function addYears(iso, n) {
    var p = iso.split('-').map(Number), y = p[0] + n, m = p[1], d = p[2];
    while (d > 28 && !isoOk(y, m, d)) d--;
    return isoOk(y, m, d);
  }
  function localToday(now) { var d = now || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dLabel(n) { return n === 0 ? 'D-day' : n > 0 ? 'D-' + n : 'D+' + (-n); }
  function colName(i) { var s = ''; i = Number(i); do { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0); return s; }
  function toNum(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var s = String(v).trim().replace(/,/g, '').replace(/\s*(일|days?|d)$/i, '');
    if (!s || s === '-') return null;
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  }
  function uniq(a) { var s = {}, o = []; (a || []).forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ── 2. 관리대장 열 찾기 ──────────────────────────────────── */
  var FIELDS = [
    { id: 'body', label: '인증기관(선급)', req: true, aliases: ['인증기관', '선급', '선급명', '선급사', '기관', '기관명', '발급기관', '인증처', '인증사', 'classificationsociety', 'society', 'class', 'certificationbody', 'body', 'issuer', 'issuedby'] },
    { id: 'kind', label: '인증 종류', req: true, aliases: ['인증종류', '인증구분', '인증명', '인증', '종류', '구분', '승인종류', '승인구분', '인증유형', 'certification', 'certificatetype', 'certtype', 'approvaltype', 'approval', 'scheme'] },
    { id: 'product', label: '제품(군)', req: false, aliases: ['제품', '제품군', '제품명', '품명', '대상제품', '적용제품', '품목', 'product', 'products', 'productgroup', 'item'] },
    { id: 'model', label: '모델·형식', req: false, aliases: ['모델형식', '형식모델', '모델형식명', '모델', '모델명', '형식', '형식명', '타입', '시리즈', 'model', 'models', 'modeltype', 'type', 'typedesignation', 'series'] },
    { id: 'certNo', label: '인증서 번호', req: false, aliases: ['인증서번호', '인증번호', '증서번호', '인증서no', '인증no', '승인번호', 'certificateno', 'certificatenumber', 'certno', 'certnumber', 'certificate'] },
    { id: 'issued', label: '발급일', req: false, aliases: ['발급일', '발급일자', '발행일', '인증일', '취득일', '승인일', '발효일', 'issuedate', 'dateofissue', 'issued', 'issuedon'] },
    { id: 'expires', label: '만료일', req: true, aliases: ['만료일', '만료일자', '만료', '만기일', '만기', '유효기간', '유효기한', '유효일', '유효기간만료일', '인증만료일', 'validuntil', 'validto', 'validity', 'expirydate', 'expiry', 'expirationdate', 'expires', 'expiredate'] },
    { id: 'stage', label: '진행 단계', req: false, aliases: ['진행단계', '진행상태', '진행', '상태', '단계', '갱신상태', '갱신진행', 'status', 'stage', 'progress'] },
    { id: 'applied', label: '신청일', req: false, aliases: ['신청일', '신청일자', '접수일', '갱신신청일', 'applied', 'applicationdate', 'appliedon'] },
    { id: 'leadDays', label: '갱신 리드타임(일)', req: false, aliases: ['리드타임', '갱신리드타임', '리드타임일', '갱신리드타임일', '소요기간', '소요일', '준비기간', 'leadtime', 'leadtimedays'] },
    { id: 'owner', label: '주관 부서', req: false, aliases: ['주관부서', '담당부서', '관리부서', '부서', '주관', 'dept', 'department', 'ownerdept'] },
    { id: 'person', label: '담당자', req: false, aliases: ['담당자', '담당', '관리자', '담당자명', 'pic', 'owner', 'personincharge', 'manager'] },
    { id: 'distributed', label: '배포일', req: false, aliases: ['배포일', '배포', '공유일', '배포일자', 'distributed', 'distributiondate'] },
    { id: 'state', label: '운영 상태', req: false, aliases: ['운영상태', '인증상태', '유지상태', '유지여부', '운영여부', '사용여부', '유효여부', '런닝', '러닝', '런닝여부', '이력상태', '이력구분', 'running', 'lifecycle', 'certstatus', 'certificatestatus'] },
    { id: 'stopReason', label: '중지 사유', req: false, aliases: ['중지사유', '중단사유', '폐기사유', '종료사유', '미갱신사유', '사유', 'reason', 'stopreason'] },
    { id: 'stopDate', label: '중지일', req: false, aliases: ['중지일', '중지일자', '중단일', '폐기일', '폐기일자', '종료일', '종료일자', 'stopdate', 'stoppedon', 'withdrawndate'] },
    { id: 'note', label: '비고', req: false, aliases: ['비고', '메모', '특이사항', '참고', 'remark', 'remarks', 'note', 'notes', 'comment'] }
  ];
  var FIELD_BY_ID = {}; FIELDS.forEach(function (f) { FIELD_BY_ID[f.id] = f; });

  function exactField(text) {
    var n = norm(text);
    if (!n) return null;
    for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].aliases.indexOf(n) >= 0) return FIELDS[i].id;
    return null;
  }
  function matchField(text) {
    var n = norm(text);
    if (!n) return null;
    var ex = exactField(text);
    if (ex) return ex;
    if (/중지|폐기|중단/.test(n)) return /사유/.test(n) ? 'stopReason' : /일|date/.test(n) ? 'stopDate' : 'state';
    if (/리드타임|leadtime/.test(n)) return 'leadDays';
    if (/만료|만기|유효|expir|valid/.test(n)) return 'expires';
    if (/발급|발행|issue/.test(n)) return 'issued';
    if (/신청|접수/.test(n)) return 'applied';
    if (/배포|공유/.test(n)) return 'distributed';
    if (/인증서?번호|certificateno|certno/.test(n)) return 'certNo';
    if (/선급|인증기관|society/.test(n)) return 'body';
    if (/인증(종류|구분|유형)/.test(n)) return 'kind';
    if (/부서|dept/.test(n)) return 'owner';
    if (/담당자/.test(n)) return 'person';
    if (/제품/.test(n)) return 'product';
    return null;
  }

  /* aoa: 시트를 행 배열로 읽은 것(SheetJS sheet_to_json header:1)
     반환: { headerRow, map:{field:col}, headers:[글자], missing:[field], warnings:[] } */
  function detectColumns(aoa, overrides) {
    aoa = aoa || [];
    var best = -1, bestScore = 0, bestMap = null, bestHeaders = null, bestDup = null, anyRow = 0, anyScore = 0;
    for (var r = 0; r < Math.min(aoa.length, 30); r++) {
      var row = aoa[r] || [], map = {}, headers = [], dup = [], exact = {};
      for (var c = 0; c < row.length; c++) {
        var t = str(row[c]), fid = matchField(t), ex = fid && exactField(t) === fid;
        headers.push(t);
        if (!fid) continue;
        // 정확히 같은 이름(별칭)의 열이 비슷한 이름(「신청 기한」 → 신청일)보다 먼저입니다 — 내보낸 엑셀을 다시 넣을 때
        // 정확한 이름이 이긴 경우, 진 쪽(비슷한 이름일 뿐)은 알리지 않습니다 — 둘 다 정확하거나 둘 다 비슷할 때만 알림
        if (map[fid] == null) { map[fid] = c; exact[fid] = ex; }
        else if (ex && !exact[fid]) { map[fid] = c; exact[fid] = true; }
        else if (ex || !exact[fid]) dup.push({ label: t, fid: fid });
      }
      var score = Object.keys(map).length;
      if (score > anyScore) { anyScore = score; anyRow = r; }
      if (map.expires != null && (map.body != null || map.kind != null) && score > bestScore) { best = r; bestScore = score; bestMap = map; bestHeaders = headers; bestDup = dup; }
    }
    var out = { headerRow: best, map: {}, headers: [], missing: [], warnings: [] };
    if (best < 0 || bestScore < 2) {
      out.headerRow = -1;
      out.warnings.push('머리행(인증기관·인증 종류·만료일 …)을 찾지 못했습니다. 관리대장 시트인지 확인하거나 열 연결에서 골라 주세요.');
      FIELDS.forEach(function (f) { if (f.req) out.missing.push(f.id); });
      if (!overrides) return out;
      // 사용자가 열을 골랐으면 글자가 가장 많이 맞은 줄을 머리행으로 보고 다시 맞춥니다
      out.headerRow = anyRow; out.headers = (aoa[anyRow] || []).map(str); out.missing = []; out.warnings = [];
      out.headers.forEach(function (t, c) { var f = matchField(t); if (f && out.map[f] == null) out.map[f] = c; });
    } else {
      out.map = bestMap; out.headers = bestHeaders;
      bestDup.forEach(function (d) { out.warnings.push('「' + d.label + '」 열도 ' + FIELD_BY_ID[d.fid].label + '(으)로 보입니다. ' + colName(out.map[d.fid]) + ' 열(「' + out.headers[out.map[d.fid]] + '」)을 씁니다.'); });
    }
    if (overrides) Object.keys(overrides).forEach(function (fid) {
      if (!FIELD_BY_ID[fid]) return;
      var v = overrides[fid];
      if (v === -1 || v === '' || v == null) delete out.map[fid]; else out.map[fid] = Number(v);
    });
    FIELDS.forEach(function (f) { if (f.req && out.map[f.id] == null) out.missing.push(f.id); });
    if (out.missing.length) out.warnings.push('꼭 필요한 열이 없습니다: ' + out.missing.map(function (id) { return FIELD_BY_ID[id].label; }).join(', ') + ' — 열 연결에서 골라 주세요.');
    return out;
  }

  /* ── 3. 행 읽기·합치기 ────────────────────────────────────── */
  var STAGES = [
    { id: 'none', label: '미착수' },
    { id: 'prep', label: '준비 중' },
    { id: 'apply', label: '신청 완료' },
    { id: 'review', label: '기관 심사·피드백' },
    { id: 'done', label: '발급 완료' }
  ];
  function stageIndex(id) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i].id === id) return i; return 0; }
  function stageLabel(id) { return STAGES[stageIndex(id)].label; }
  function parseStage(v) {
    var n = norm(v);
    if (!n || n === '-' || /미착수|대기|없음|해당없음|^none$|^todo$/.test(n)) return 'none';
    if (/발급완료|갱신완료|취득완료|^완료$|발급됨|^done$|^issued$|^completed?$/.test(n)) return 'done';
    if (/심사|피드백|보완|검토|audit|review|feedback|시험|입회/.test(n)) return 'review';
    if (/신청|접수|apply|applied|submitted/.test(n)) return 'apply';
    if (/준비|착수|작성|prep/.test(n)) return 'prep';
    if (/완료|발급/.test(n)) return 'done';
    return 'none';
  }
  function recordKey(r) { return [r.body, r.kind, r.product, r.model, r.certNo].map(norm).join('|'); }
  function isSummaryRow(row) { var t = (row || []).map(str).join(' '); return /^(합계|소계|총계|total)\b/i.test(t.trim()); }

  function parseSheet(aoa, opts) {
    opts = opts || {};
    var det = detectColumns(aoa, opts.overrides);
    var out = { det: det, records: [], warnings: [], skipped: 0 };
    if (det.headerRow < 0 || det.missing.length) return out;
    var m = det.map;
    function cell(row, f) { return m[f] == null ? null : row[m[f]]; }
    for (var r = det.headerRow + 1; r < aoa.length; r++) {
      var row = aoa[r] || [], line = r + 1;
      if (!row.some(function (v) { return str(v) !== ''; })) continue;
      if (isSummaryRow(row)) { out.skipped++; continue; }
      var rec = {
        body: str(cell(row, 'body')), kind: str(cell(row, 'kind')), product: str(cell(row, 'product')), model: str(cell(row, 'model')),
        certNo: str(cell(row, 'certNo')), issued: toISO(cell(row, 'issued')), expires: toISO(cell(row, 'expires')),
        stage: parseStage(cell(row, 'stage')), applied: toISO(cell(row, 'applied')), leadDays: null,
        owner: str(cell(row, 'owner')), person: str(cell(row, 'person')), distributed: toISO(cell(row, 'distributed')), note: str(cell(row, 'note')), history: [],
        state: '', stopReason: str(cell(row, 'stopReason')), stopDate: toISO(cell(row, 'stopDate')), pdf: null
      };
      // 운영 상태: 「운영 상태」 열이 있으면 그 값, 없으면 진행 단계 칸의 분명한 말(중지·폐기·갱신됨 …)만 봅니다
      var stRaw = cell(row, 'state'), stv = parseState(stRaw), given = !!stv;
      if (!stv) { var fromStage = parseState(cell(row, 'stage'), true); if (fromStage) { stv = fromStage; given = true; rec.stage = 'none'; } }
      if (str(stRaw) && !stv) out.warnings.push({ row: line, msg: '운영 상태 「' + str(stRaw) + '」을 알아보지 못해 「운영 중」으로 둡니다.' });
      if (!stv && opts.history) stv = 'renewed';
      rec.state = stv && stv !== 'renewed' ? stv : 'active';
      rec.stateGiven = given;
      rec.isHistory = stv === 'renewed' || (!!opts.history && rec.state !== 'active');
      rec.histState = rec.isHistory ? stv : '';
      if (!rec.body && !rec.kind && !rec.product) { out.skipped++; continue; }
      if (!rec.expires) {
        var raw = cell(row, 'expires');
        out.warnings.push({ row: line, msg: str(raw) ? '만료일 「' + str(raw) + '」을 날짜로 읽지 못해 건너뜁니다.' : '만료일이 비어 건너뜁니다.' });
        out.skipped++; continue;
      }
      ['issued', 'expires', 'applied', 'distributed'].forEach(function (f) {
        if (isAmbiguousDate(cell(row, f))) out.warnings.push({ row: line, msg: FIELD_BY_ID[f].label + ' 「' + str(cell(row, f)) + '」은 일/월 순으로 읽었습니다(' + rec[f] + '). 다르면 고쳐 주세요.' });
      });
      var ld = toNum(cell(row, 'leadDays'));
      if (ld != null && !isNaN(ld) && ld > 0 && ld < 2000) rec.leadDays = Math.round(ld);
      else if (ld != null && (isNaN(ld) || ld <= 0)) out.warnings.push({ row: line, msg: '리드타임 「' + str(cell(row, 'leadDays')) + '」을 숫자로 읽지 못해 설정값을 씁니다.' });
      if (rec.issued && rec.issued > rec.expires) out.warnings.push({ row: line, msg: '발급일이 만료일보다 늦습니다. 날짜를 확인해 주세요.' });
      rec.key = recordKey(rec);
      rec.id = 'c' + hash(rec.key);
      out.records.push(rec);
    }
    return out;
  }
  function hash(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function pickSheet(sheets) {
    var best = null, score = -1;
    (sheets || []).forEach(function (s) {
      var d = detectColumns(s.aoa);
      var sc = d.headerRow < 0 ? 0 : Object.keys(d.map).length * 10 + Math.min(9, (s.aoa.length - d.headerRow - 1) / 10);
      if (isHistorySheet(s.name) && sc > 0) sc = 1;   // 이력 시트는 관리대장으로 고르지 않음(따로 읽음)
      if (sc > score) { score = sc; best = s; }
    });
    return best;
  }
  function isHistorySheet(name) { return /이력|history|과거|지난/i.test(String(name || '')); }
  function headerSignature(det) { return det && det.headers ? det.headers.map(norm).join('|') : ''; }

  /* 같은 인증(기관·종류·제품·모델·번호가 같음)은 한 행 — 새 파일 값으로 고치되, 이 도구에서 바꾼 진행 단계·배포일·이력은 지킵니다 */
  function mergeRecords(existing, incoming) {
    var byKey = {}, order = [], stat = { added: 0, updated: 0 };
    (existing || []).forEach(function (r) { var k = r.key || recordKey(r); if (!byKey[k]) order.push(k); byKey[k] = r; });
    (incoming || []).forEach(function (r) {
      var k = r.key || recordKey(r), old = byKey[k];
      if (!old) { byKey[k] = r; order.push(k); stat.added++; return; }
      var nr = {}; Object.keys(r).forEach(function (f) { nr[f] = r[f]; });
      if (stageIndex(old.stage) > stageIndex(r.stage)) nr.stage = old.stage;   // 진행 단계는 뒤로 가지 않음(되돌림은 「다음 주기로」에서)
      if (!r.distributed && old.distributed) nr.distributed = old.distributed;
      if (!r.applied && old.applied) nr.applied = old.applied;
      nr.history = dedupeHistory((old.history || []).concat(r.history || []));
      if (!r.stateGiven) { nr.state = old.state || 'active'; nr.stopReason = old.stopReason || ''; nr.stopDate = old.stopDate || ''; }
      if (old.pdf && !r.pdf) nr.pdf = old.pdf;
      nr.id = old.id;
      byKey[k] = nr; stat.updated++;
    });
    return { records: order.map(function (k) { return byKey[k]; }), stat: stat };
  }
  /* 새 인증서를 받아 다음 주기로 — 이전 번호·날짜는 history 에 남깁니다 */
  function renewRecord(rec, nw, today) {
    var r = JSON.parse(JSON.stringify(rec));
    var e = toISO(nw && nw.expires);
    if (!e) throw new Error('새 만료일을 날짜로 적어 주세요.');
    if (rec.expires && e <= rec.expires) throw new Error('새 만료일이 이전 만료일(' + rec.expires + ')보다 뒤여야 합니다.');
    r.history = sortHistory((r.history || []).concat([cleanHist({ certNo: rec.certNo, issued: rec.issued, expires: rec.expires, applied: rec.applied || '', distributed: rec.distributed || '', closed: today, state: 'renewed', src: 'renew', pdf: rec.pdf || null })]));
    r.pdf = null;
    r.certNo = str(nw.certNo) || rec.certNo;
    r.issued = toISO(nw.issued) || today;
    r.expires = e;
    r.stage = 'none'; r.applied = ''; r.distributed = '';
    r.key = recordKey(r);
    return r;
  }

  /* ── 3-2. 운영 상태 · 모델·형식 묶음 · 이력 (2차, 2026-10-27) ─────────────
     인증 한 건(record)은 「지금의 인증서」이고, 지난 인증서는 record.history 에 둡니다.
     운영 상태: 운영 중(런닝) · 중지 · 만료 종료(갱신하지 않음) · 폐기 — 운영 중이 아니면 갱신 알림·일정에서 빠지고 이력에는 남습니다.
     이력 한 줄의 상태에는 「갱신됨」(다음 인증서로 이어짐)이 더 있습니다. */
  var STATES = [
    { id: 'active', label: '운영 중' },
    { id: 'stopped', label: '중지' },
    { id: 'lapsed', label: '만료 종료' },
    { id: 'withdrawn', label: '폐기' }
  ];
  var HIST_STATES = [{ id: 'renewed', label: '갱신됨' }].concat(STATES.slice(1)).concat([{ id: 'active', label: '운영 중' }]);
  function stateLabel(id) { var all = STATES.concat(HIST_STATES); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i].label; return '운영 중'; }
  function isRunning(rec) { return !rec || !rec.state || rec.state === 'active'; }
  /* strict: 진행 단계 칸에서 읽을 때 — 「만료」「종료」처럼 갱신 진행과 헷갈리는 말은 운영 상태로 보지 않음 */
  function parseState(v, strict) {
    var n = norm(v);
    if (!n || n === '-') return '';
    if (/갱신됨|갱신완료됨|이전인증서|구인증서|대체됨|교체됨|superseded|^renewed$|^replaced$|^history$|^이력$|^과거$/.test(n)) return 'renewed';
    if (/폐기|철회|취소|단종|withdrawn|withdraw|cancel|revoked|discontinued|obsolete/.test(n)) return 'withdrawn';
    if (/중지|중단|정지|보류|휴지|suspend|stopped|^stop$|onhold|^hold$|inactive|비운영|미운영/.test(n)) return 'stopped';
    if (/미갱신|갱신안함|갱신하지않음|갱신포기|notrenewed/.test(n)) return 'lapsed';
    if (strict) return '';
    if (/만료종료|만료|종료|lapsed|^expired$|ended/.test(n)) return 'lapsed';
    if (/운영|런닝|러닝|유효|사용|현행|진행중|^active$|running|^valid$|^live$|^y$|^o$/.test(n)) return 'active';
    return '';
  }
  /* 모델·형식 묶음 키 — 띄어쓰기·대소문자·하이픈 모양(- ‐ – — − － _ ·)이 달라도 같은 키
     「HC-100 계열」「hc100계열」「HC–100 계열」 → HC100계열. 빈칸·「-」·「없음」 은 키 없음('') */
  function modelKey(model) {
    var s = String(model == null ? '' : model);
    if (s.normalize) s = s.normalize('NFKC');
    s = s.toUpperCase().replace(/[\s\u00A0\u3000]+/g, '').replace(/[\-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D_\u00B7\u30FB\u318D]/g, '');
    return /^(|N\/?A|없음|해당없음|미정|미기재)$/.test(s) ? '' : s;
  }
  /* 같은 인증 줄 = 모델·형식 + 기관 + 종류(모델이 없으면 제품). 이력을 어느 인증에 붙일지 찾을 때 씁니다 */
  function lineKey(r) { return (modelKey(r.model) || 'P:' + norm(r.product)) + '|' + norm(r.body) + '|' + norm(r.kind); }
  function histKey(x) { return norm(x.certNo) + '|' + (x.expires || '') + '|' + (x.issued || ''); }
  function cleanPdf(p) {
    if (!p || typeof p !== 'object' || !str(p.id)) return null;
    return { id: str(p.id), name: str(p.name) || '인증서.pdf', size: Math.max(0, Number(p.size) || 0), at: str(p.at) };
  }
  function cleanHist(x) {
    x = x && typeof x === 'object' ? x : {};
    var o = {
      certNo: str(x.certNo), issued: toISO(x.issued), expires: toISO(x.expires), applied: toISO(x.applied), distributed: toISO(x.distributed), closed: toISO(x.closed),
      state: HIST_STATES.some(function (h) { return h.id === x.state; }) ? x.state : 'renewed',
      reason: str(x.reason), stopDate: toISO(x.stopDate), note: str(x.note), src: str(x.src) || 'manual', pdf: cleanPdf(x.pdf)
    };
    if (x.body) o.body = str(x.body);
    o.id = str(x.id) || 'h' + hash(histKey(o) + '|' + o.state);
    return o;
  }
  function sortHistory(list) {
    return (list || []).slice().sort(function (a, b) { var x = a.expires || a.issued || '', y = b.expires || b.issued || ''; return x < y ? -1 : x > y ? 1 : 0; });
  }
  function dedupeHistory(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (x) { var c = cleanHist(x), k = histKey(c); if (seen[k] != null) { if (c.pdf && !out[seen[k]].pdf) out[seen[k]].pdf = c.pdf; return; } seen[k] = out.length; out.push(c); });
    return sortHistory(out);
  }
  /* 지난 인증서 한 줄 더하기 — 같은 번호·날짜가 이미 있거나 지금 인증서와 같으면 막습니다 */
  function addHistory(rec, entry) {
    var e = cleanHist(entry);
    if (!e.expires && !e.issued) throw new Error('발급일이나 만료일 중 하나는 적어 주세요.');
    if (e.issued && e.expires && e.issued > e.expires) throw new Error('발급일이 만료일보다 늦습니다.');
    if (!e.certNo && !e.expires) throw new Error('인증서 번호나 만료일 중 하나는 적어 주세요.');
    if (histKey(e) === histKey(rec)) throw new Error('지금 인증서와 같은 번호·날짜입니다.');
    if ((rec.history || []).some(function (x) { return histKey(x) === histKey(e); })) throw new Error('같은 번호·날짜의 이력이 이미 있습니다.');
    var r = JSON.parse(JSON.stringify(rec));
    r.history = sortHistory((r.history || []).concat([e]));
    return r;
  }
  /* 운영 상태 바꾸기 — 중지·만료 종료·폐기는 사유와 날짜(비우면 기준일)를 함께 남깁니다 */
  function setState(rec, state, reason, date, today) {
    if (!STATES.some(function (x) { return x.id === state; })) throw new Error('알 수 없는 운영 상태입니다.');
    var r = JSON.parse(JSON.stringify(rec));
    r.state = state;
    if (state === 'active') { r.stopReason = ''; r.stopDate = ''; }
    else { r.stopReason = str(reason); r.stopDate = toISO(date) || today; }
    return r;
  }
  function stripImport(r) { delete r.isHistory; delete r.histState; delete r.stateGiven; return r; }
  /* 이력 줄(이력 시트의 줄, 관리대장에서 「갱신됨」 등으로 적힌 줄)을 같은 인증 줄에 붙입니다.
     붙일 인증이 없으면 그 줄들 가운데 가장 늦은 것을 인증 한 건으로 세우고(운영 상태는 그 줄의 상태, 「갱신됨」 이면 만료 종료) 나머지는 그 이력으로. */
  function attachHistory(records, histRows) {
    var recs = (records || []).slice(), stat = { attached: 0, created: 0, dup: 0 };
    var byLine = {};
    recs.forEach(function (r) { var k = lineKey(r); if (!byLine[k] || (r.expires || '') > (byLine[k].expires || '')) byLine[k] = r; });
    var orphan = {}, order = [];
    (histRows || []).forEach(function (h) {
      var k = lineKey(h), t = byLine[k];
      var e = cleanHist({ certNo: h.certNo, issued: h.issued, expires: h.expires, applied: h.applied, distributed: h.distributed, state: h.histState || 'renewed', reason: h.stopReason, stopDate: h.stopDate, note: h.note, src: 'import', pdf: h.pdf });
      if (t) {
        if (histKey(e) === histKey(t) || (t.history || []).some(function (x) { return histKey(x) === histKey(e); })) { stat.dup++; return; }
        var i = recs.indexOf(t), n = JSON.parse(JSON.stringify(t));
        n.history = sortHistory((n.history || []).concat([e]));
        recs[i] = n; byLine[k] = n; stat.attached++;
        return;
      }
      if (!orphan[k]) { orphan[k] = []; order.push(k); }
      orphan[k].push(h);
    });
    order.forEach(function (k) {
      var rows = orphan[k].slice().sort(function (a, b) { return (a.expires || '') < (b.expires || '') ? -1 : 1; });
      var top = JSON.parse(JSON.stringify(rows[rows.length - 1]));
      top.state = top.histState && top.histState !== 'renewed' ? top.histState : 'lapsed';
      if (top.state === 'active') top.state = 'lapsed';
      top.history = [];
      stripImport(top);
      top.key = recordKey(top); top.id = 'c' + hash(top.key);
      var made = top;
      rows.slice(0, -1).forEach(function (h) {
        try { made = addHistory(made, { certNo: h.certNo, issued: h.issued, expires: h.expires, state: h.histState || 'renewed', reason: h.stopReason, stopDate: h.stopDate, note: h.note, src: 'import' }); stat.attached++; }
        catch (e) { stat.dup++; }
      });
      recs.push(made); byLine[k] = made; stat.created++;
    });
    return { records: recs, stat: stat };
  }
  /* 모델·형식으로 묶기 — 묶음마다 인증(기관·종류별)과, 지금 인증서 + 지난 인증서를 한 줄로 늘어놓은 이력(최근 것이 위) */
  function groupByModel(records, S, today) {
    var map = {}, order = [];
    (records || []).forEach(function (r) {
      var k = modelKey(r.model) || '';
      if (!map[k]) { map[k] = { key: k, names: {}, records: [] }; order.push(k); }
      var nm = str(r.model) || '(모델·형식 없음)';
      map[k].names[nm] = (map[k].names[nm] || 0) + 1;
      map[k].records.push(r);
    });
    var out = order.map(function (k) {
      var g = map[k], names = Object.keys(g.names).sort(function (a, b) { return g.names[b] - g.names[a] || (a < b ? -1 : 1); });
      var ev = g.records.map(function (r) { return { rec: r, st: status(r, S, today) }; });
      var entries = [];
      g.records.forEach(function (r) {
        entries.push({ rec: r, current: true, certNo: r.certNo, issued: r.issued, expires: r.expires, state: r.state || 'active', reason: r.stopReason || '', stopDate: r.stopDate || '', note: r.note || '', pdf: r.pdf || null });
        (r.history || []).forEach(function (x) { entries.push({ rec: r, current: false, hist: x, certNo: x.certNo, issued: x.issued, expires: x.expires, state: x.state || 'renewed', reason: x.reason || '', stopDate: x.stopDate || '', note: x.note || '', pdf: x.pdf || null }); });
      });
      entries.sort(function (a, b) { var x = a.expires || a.issued || '', y = b.expires || b.issued || ''; return x > y ? -1 : x < y ? 1 : (a.current ? -1 : 1); });
      var running = ev.filter(function (x) { return isRunning(x.rec); });
      var worst = running.slice().sort(function (a, b) { return b.st.level - a.st.level; })[0] || null;
      return {
        key: k, label: k ? names[0] : '모델·형식 미기재', names: names, records: g.records, evaluated: ev, entries: entries,
        running: running.length, stopped: g.records.length - running.length, histCount: entries.length - g.records.length,
        pdfs: entries.filter(function (e) { return e.pdf; }).length, worst: worst ? worst.st : null
      };
    });
    out.sort(function (a, b) { if (!a.key !== !b.key) return a.key ? -1 : 1; var la = a.worst ? a.worst.level : -2, lb = b.worst ? b.worst.level : -2; return lb - la || (a.label < b.label ? -1 : 1); });
    return out;
  }
  var HISTORY_HEAD = ['모델·형식', '묶음 키', '인증기관', '인증 종류', '제품(군)', '인증서 번호', '발급일', '만료일', '이력 상태', '중지 사유', '중지일', '비고', '인증서 PDF'];
  function historyRows(records) {
    var rows = [];
    (records || []).forEach(function (r) {
      (r.history || []).forEach(function (x) { rows.push([r.model, modelKey(r.model), r.body, r.kind, r.product, x.certNo, x.issued, x.expires, stateLabel(x.state), x.reason, x.stopDate, x.note, x.pdf ? x.pdf.name : '']); });
    });
    return rows;
  }

  /* ── 4. 설정 ─────────────────────────────────────────────── */
  var PHASES = [
    { id: 'prep', label: '준비' },
    { id: 'review', label: '기관 심사' },
    { id: 'feedback', label: '피드백 대응' },
    { id: 'issue', label: '발급 처리' },
    { id: 'buffer', label: '여유' }
  ];
  var EVENTS = {
    notice: '갱신 준비 예정 안내',
    prep: '갱신 준비 시작',
    apply: '인증기관 신청 기한',
    feedback: '기관 피드백 대응 마감',
    urgent: '만료 임박',
    expire: '인증 만료',
    distribute: '신규 인증서 배포'
  };
  function defaultSettings() {
    return {
      today: '',
      noticeDays: 30, urgentDays: 60, graceDays: 7, lookahead: 7,
      kinds: [
        { name: 'Type Approval(형식승인)', match: 'type approval, 형식승인, 형식 승인, TA', prep: 60, review: 45, feedback: 30, issue: 14, buffer: 30 },
        { name: 'Works Approval(공장승인)', match: 'works approval, 공장승인, 공장 승인, 제조자 승인, manufacturer approval, MWA', prep: 45, review: 30, feedback: 20, issue: 14, buffer: 30 },
        { name: 'ISO 경영시스템', match: 'iso 9001, iso 14001, iso 45001, iso', prep: 30, review: 21, feedback: 14, issue: 14, buffer: 14 },
        { name: '기타(기본값)', match: '', prep: 45, review: 30, feedback: 21, issue: 14, buffer: 30 }
      ],
      bodyExtra: [],
      depts: [
        { id: 'quality', name: '품질', email: '' },
        { id: 'sales', name: '영업', email: '' },
        { id: 'dev', name: '개발', email: '' }
      ],
      rules: {
        notice: ['quality', 'dev'], prep: ['quality', 'dev'], apply: ['quality'], feedback: ['quality', 'dev'],
        urgent: ['quality', 'sales', 'dev'], expire: ['quality', 'sales', 'dev'], distribute: ['quality', 'sales', 'dev']
      },
      maskWords: []
    };
  }
  function intOr(v, d, lo, hi) { var n = Number(v); return v === '' || v == null || !isFinite(n) ? d : Math.max(lo, Math.min(hi, Math.round(n))); }
  function cleanSettings(p) {
    var d = defaultSettings(), s = {};
    p = p && typeof p === 'object' ? p : {};
    s.today = toISO(p.today) || '';
    s.noticeDays = intOr(p.noticeDays, d.noticeDays, 0, 365);
    s.urgentDays = intOr(p.urgentDays, d.urgentDays, 0, 730);
    s.graceDays = intOr(p.graceDays, d.graceDays, 0, 90);
    s.lookahead = intOr(p.lookahead, d.lookahead, 0, 60);
    s.kinds = (Array.isArray(p.kinds) && p.kinds.length ? p.kinds : d.kinds).map(function (k) {
      var o = { name: str(k.name) || '이름 없음', match: str(k.match) };
      PHASES.forEach(function (ph) { o[ph.id] = intOr(k[ph.id], 0, 0, 999); });
      return o;
    });
    s.bodyExtra = (Array.isArray(p.bodyExtra) ? p.bodyExtra : []).filter(function (b) { return b && str(b.body); }).map(function (b) { return { body: str(b.body), days: intOr(b.days, 0, -365, 365) }; });
    s.depts = (Array.isArray(p.depts) && p.depts.length ? p.depts : d.depts).map(function (x, i) {
      return { id: str(x.id) || 'd' + i, name: str(x.name) || '부서' + (i + 1), email: str(x.email) };
    });
    s.rules = {};
    Object.keys(EVENTS).forEach(function (ev) {
      var list = p.rules && Array.isArray(p.rules[ev]) ? p.rules[ev] : d.rules[ev];
      s.rules[ev] = list.filter(function (id) { return s.depts.some(function (x) { return x.id === id; }); });
    });
    s.maskWords = uniq((Array.isArray(p.maskWords) ? p.maskWords : []).map(str).filter(Boolean));
    return s;
  }
  function kindRule(S, kind) {
    var n = norm(kind), fallback = null;
    for (var i = 0; i < S.kinds.length; i++) {
      var k = S.kinds[i];
      if (!k.match) { if (!fallback) fallback = k; continue; }
      var words = k.match.split(/[,\n]/).map(norm).filter(Boolean);
      for (var j = 0; j < words.length; j++) {
        var w = words[j];
        // 짧은 약어(TA·MWA·ISO)는 낱말로 따로 있을 때만, 긴 말은 들어 있기만 하면
        var hit = w.length <= 3 ? String(kind).toLowerCase().split(/[^a-z0-9가-힣]+/).indexOf(w) >= 0 : n.indexOf(w) >= 0;
        if (hit) return k;
      }
    }
    return fallback || defaultSettings().kinds[3];
  }
  function bodyExtraDays(S, body) {
    var n = norm(body), d = 0;
    (S.bodyExtra || []).forEach(function (b) { if (norm(b.body) === n) d = b.days; });
    return d;
  }

  /* ── 5. 갱신 계획 — 만료일에서 거꾸로 ─────────────────────── */
  /* 준비 → (신청) → 기관 심사 → 피드백 대응 → 발급 처리 → 여유 → 만료.
     레코드에 리드타임(일)이 적혀 있으면 단계 비율은 그대로 두고 전체 길이만 맞춥니다. */
  function plan(rec, S) {
    if (!rec || !rec.expires) return null;
    var rule = kindRule(S, rec.kind), extra = bodyExtraDays(S, rec.body);
    var parts = { prep: rule.prep, review: Math.max(0, rule.review + extra), feedback: rule.feedback, issue: rule.issue, buffer: rule.buffer };
    var total = PHASES.reduce(function (a, p) { return a + parts[p.id]; }, 0);
    var custom = rec.leadDays > 0 && total > 0 && rec.leadDays !== total;
    if (custom) {
      var f = rec.leadDays / total, sum = 0;
      PHASES.forEach(function (p) { if (p.id !== 'prep') { parts[p.id] = Math.round(parts[p.id] * f); sum += parts[p.id]; } });
      parts.prep = Math.max(0, rec.leadDays - sum);
      total = rec.leadDays;
    }
    var targetIssue = addDays(rec.expires, -parts.buffer);
    var issueStart = addDays(targetIssue, -parts.issue);
    var feedbackStart = addDays(issueStart, -parts.feedback);
    var applyDate = addDays(feedbackStart, -parts.review);
    var prepStart = addDays(applyDate, -parts.prep);
    return {
      rule: rule.name, extra: extra, custom: custom, parts: parts, lead: total,
      noticeDate: addDays(prepStart, -S.noticeDays), prepStart: prepStart, applyDate: applyDate, feedbackStart: feedbackStart,
      issueStart: issueStart, targetIssue: targetIssue, urgentDate: addDays(rec.expires, -S.urgentDays), expires: rec.expires,
      phases: [
        { id: 'prep', label: '준비', from: prepStart, to: applyDate },
        { id: 'review', label: '기관 심사', from: applyDate, to: feedbackStart },
        { id: 'feedback', label: '피드백 대응', from: feedbackStart, to: issueStart },
        { id: 'issue', label: '발급 처리', from: issueStart, to: targetIssue },
        { id: 'buffer', label: '여유', from: targetIssue, to: rec.expires }
      ]
    };
  }

  /* ── 6. 상태 신호 ─────────────────────────────────────────── */
  var STATUS = {
    expired: { label: '만료', level: 6 },
    late: { label: '지연', level: 5 },
    urgent: { label: '임박', level: 4 },
    distribute: { label: '배포 필요', level: 3 },
    active: { label: '준비 시작', level: 2 },
    soon: { label: '준비 예정', level: 1 },
    ok: { label: '정상', level: 0 },
    done: { label: '완료', level: 0 },
    nodate: { label: '날짜 확인', level: 4 },
    inactive: { label: '중지·종료', level: -1 }
  };
  var STATUS_ORDER = ['expired', 'late', 'urgent', 'nodate', 'distribute', 'active', 'soon', 'ok', 'done', 'inactive'];
  /* 단계별 기한: 준비 시작일까지 「준비 중」, 신청 기한까지 「신청 완료」, 피드백 시작일까지 「기관 심사·피드백」, 발급 목표일까지 「발급 완료」 */
  function milestones(p) {
    return [
      { stage: 1, date: p.prepStart, label: '준비 시작' },
      { stage: 2, date: p.applyDate, label: '인증기관 신청' },
      { stage: 3, date: p.feedbackStart, label: '기관 심사 진행' },
      { stage: 4, date: p.targetIssue, label: '신규 인증서 발급' }
    ];
  }
  function status(rec, S, today) {
    var mk = function (code, extra) { var o = { code: code, label: STATUS[code].label, level: STATUS[code].level }; Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); return o; };
    if (rec && !isRunning(rec)) {
      var o0 = mk('inactive', { daysLeft: rec.expires ? daysBetween(today, rec.expires) : null, stage: stageIndex(rec.stage), next: null,
        msg: stateLabel(rec.state) + (rec.stopDate ? ' (' + rec.stopDate + ')' : '') + (rec.stopReason ? ' — ' + rec.stopReason : '') + ' · 갱신 알림·일정에서 뺍니다.' });
      o0.label = stateLabel(rec.state); o0.state = rec.state;
      return o0;
    }
    if (!rec || !rec.expires) return mk('nodate', { msg: '만료일이 없어 일정을 세울 수 없습니다.' });
    var p = plan(rec, S), si = stageIndex(rec.stage), left = daysBetween(today, rec.expires);
    var base = { plan: p, daysLeft: left, stage: si };
    var ms = milestones(p), next = null;
    for (var i = 0; i < ms.length; i++) if (ms[i].stage > si) { next = ms[i]; break; }
    base.next = next ? { label: next.label, date: next.date, days: daysBetween(today, next.date) } : null;
    if (si === 4) {
      base.next = null;
      return rec.distributed ? mk('done', Object.assign(base, { msg: '신규 인증서 발급·배포 완료(' + rec.distributed + ')' }))
        : mk('distribute', Object.assign(base, { msg: '신규 인증서를 받았습니다. 영업·품질·개발에 배포하고 배포일을 적어 주세요.' }));
    }
    if (left < 0) return mk('expired', Object.assign(base, { msg: '만료일(' + rec.expires + ')이 ' + (-left) + '일 지났습니다. 신규 인증서 발급 여부를 확인해 주세요.' }));
    var miss = null;
    for (var j = 0; j < ms.length; j++) if (ms[j].stage > si && daysBetween(ms[j].date, today) > S.graceDays) { miss = ms[j]; break; }
    if (miss) return mk('late', Object.assign(base, { overdue: daysBetween(miss.date, today), msg: miss.label + ' 기한(' + miss.date + ')이 ' + daysBetween(miss.date, today) + '일 지났습니다.' }));
    if (left <= S.urgentDays) return mk('urgent', Object.assign(base, { msg: '만료까지 ' + left + '일 남았습니다.' }));
    if (today >= p.prepStart) {
      var o = mk('active', Object.assign(base, { msg: si === 0 ? '갱신 준비를 시작할 때입니다(준비 시작일 ' + p.prepStart + ').' : stageLabel(rec.stage) + ' — 일정대로 진행 중입니다.' }));
      if (si > 0) o.label = '진행 중';
      return o;
    }
    if (today >= p.noticeDate) return mk('soon', Object.assign(base, { msg: '준비 시작일(' + p.prepStart + ')까지 ' + daysBetween(today, p.prepStart) + '일 남았습니다.' }));
    return mk('ok', Object.assign(base, { msg: '준비 시작일 ' + p.prepStart + ' (' + dLabel(daysBetween(today, p.prepStart)) + ')' }));
  }
  function statusLabel(code) { return STATUS[code] ? STATUS[code].label : code; }

  /* ── 7. 알림 · 메일 초안 ──────────────────────────────────── */
  /* 아직 끝나지 않은 일 가운데 「오늘 + 미리 보기 일수」 안에 날짜가 온 가장 최근 일 하나를 인증마다 고릅니다.
     같은 인증에 지난 일이 여럿이면 가장 최근 것만(메일이 같은 인증으로 넘치지 않게). */
  function pendingEvents(rec, S, today) {
    if (!isRunning(rec)) return [];   // 중지·만료 종료·폐기는 갱신 알림 대상이 아님
    var p = plan(rec, S); if (!p) return [];
    var si = stageIndex(rec.stage), out = [];
    if (si === 4) {
      if (!rec.distributed) out.push({ key: 'distribute', date: today });
      return out;
    }
    if (si < 1) out.push({ key: 'notice', date: p.noticeDate }, { key: 'prep', date: p.prepStart });
    if (si < 2) out.push({ key: 'apply', date: p.applyDate });
    out.push({ key: 'feedback', date: p.issueStart }, { key: 'urgent', date: p.urgentDate }, { key: 'expire', date: rec.expires });
    return out;
  }
  function deptsFor(rec, S, key) {
    var ids = (S.rules[key] || []).slice();
    var own = norm(rec.owner);
    if (own) S.depts.forEach(function (d) { if (norm(d.name) && (own === norm(d.name) || own.indexOf(norm(d.name)) >= 0) && ids.indexOf(d.id) < 0) ids.push(d.id); });
    return ids;
  }
  function alerts(records, S, today) {
    var horizon = addDays(today, S.lookahead), out = [];
    (records || []).forEach(function (rec) {
      var evs = pendingEvents(rec, S, today).filter(function (e) { return e.date <= horizon; });
      if (!evs.length) return;
      evs.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      var e = evs[evs.length - 1], st = status(rec, S, today);
      out.push({ rec: rec, key: e.key, label: EVENTS[e.key], date: e.date, days: daysBetween(today, e.date), status: st, depts: deptsFor(rec, S, e.key) });
    });
    out.sort(function (a, b) { return b.status.level - a.status.level || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0); });
    return out;
  }
  function certTitle(rec) {
    return '[' + (rec.body || '기관 미상') + '] ' + (rec.kind || '') + (rec.product ? ' · ' + rec.product : '') + (rec.model ? ' ' + rec.model : '');
  }
  function whenText(days) { return days === 0 ? '오늘' : days > 0 ? days + '일 뒤' : (-days) + '일 지남'; }
  function mailDrafts(list, S, today) {
    var MAX = 1600;
    return S.depts.map(function (d) {
      var items = (list || []).filter(function (a) { return a.depts.indexOf(d.id) >= 0; });
      if (!items.length) return null;
      var subject = '[인증 갱신 알림] ' + today + ' · ' + items.length + '건 (' + d.name + ')';
      var lines = [d.name + ' 담당자님께,', '', '인증 갱신 일정 알림입니다(기준일 ' + today + '). 아래 ' + items.length + '건을 확인해 주세요.', ''];
      items.forEach(function (a, i) {
        lines.push((i + 1) + '. ' + certTitle(a.rec) + (a.rec.certNo ? ' (인증서 ' + a.rec.certNo + ')' : ''));
        lines.push('   - 만료일 ' + a.rec.expires + ' (' + dLabel(daysBetween(today, a.rec.expires)) + ') · 상태: ' + a.status.label);
        lines.push('   - 할 일: ' + a.label + ' ' + a.date + ' (' + whenText(a.days) + ')');
      });
      lines.push('', '진행 상황이 바뀌면 관리대장 담당(품질)에 알려 주세요.', '감사합니다.');
      var body = lines.join('\n');
      var mbody = body.length > MAX ? body.slice(0, MAX) + '\n…(길어서 줄였습니다. 화면의 「본문 복사」로 전체를 붙여 넣어 주세요.)' : body;
      var to = d.email.split(/[;,\s]+/).filter(Boolean).join(',');
      return { dept: d, items: items, subject: subject, body: body, mailto: 'mailto:' + to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(mbody), cut: body.length > MAX };
    }).filter(Boolean);
  }

  /* ── 8. 업무흐름 · R/R(RACI) ──────────────────────────────── */
  var ROLES = ['', 'R', 'A', 'R/A', 'C', 'I'];
  function defaultFlow() {
    return {
      lanes: ['영업', '품질', '개발', '생산', '인증기관'],
      steps: [
        { name: '만료 일정 점검·갱신 착수', days: 3, roles: { '품질': 'R/A', '영업': 'C', '개발': 'I' } },
        { name: '변경 사항 확인(설계·사양·규칙 개정)', days: 10, roles: { '개발': 'R', '품질': 'A', '영업': 'C' } },
        { name: '신청서·기술 문서 준비', days: 30, roles: { '품질': 'R/A', '개발': 'C', '생산': 'C' } },
        { name: '인증기관 신청·접수', days: 5, roles: { '품질': 'R/A', '인증기관': 'I' } },
        { name: '기관 심사(도면 검토·시험 입회·공장 심사)', days: 45, roles: { '인증기관': 'R', '품질': 'A', '개발': 'C', '생산': 'C' } },
        { name: '피드백(보완 요청) 대응', days: 20, roles: { '개발': 'R', '품질': 'A', '인증기관': 'C' } },
        { name: '신규 인증서 발급', days: 14, roles: { '인증기관': 'R', '품질': 'A' } },
        { name: '변경 내용 확인·요약(이전/신규 비교)', days: 5, roles: { '품질': 'R/A', '개발': 'C', '영업': 'I' } },
        { name: '내외부 배포·관리대장 갱신', days: 3, roles: { '품질': 'R/A', '영업': 'I', '개발': 'I', '생산': 'I' } }
      ]
    };
  }
  function cleanFlow(f) {
    var d = defaultFlow();
    f = f && typeof f === 'object' ? f : d;
    var lanes = uniq((Array.isArray(f.lanes) && f.lanes.length ? f.lanes : d.lanes).map(str).filter(Boolean));
    var steps = (Array.isArray(f.steps) ? f.steps : d.steps).map(function (s) {
      var roles = {};
      lanes.forEach(function (l) { var v = s && s.roles ? str(s.roles[l]).toUpperCase().replace(/\s/g, '') : ''; if (v === 'A/R') v = 'R/A'; if (ROLES.indexOf(v) > 0) roles[l] = v; });
      return { name: str(s && s.name) || '이름 없는 단계', days: intOr(s && s.days, 0, 0, 999), roles: roles };
    });
    return { lanes: lanes, steps: steps };
  }
  function hasR(v) { return v === 'R' || v === 'R/A'; }
  function hasA(v) { return v === 'A' || v === 'R/A'; }
  /* RACI 규칙: 단계마다 R(실행)이 하나 이상, A(최종 책임)는 꼭 하나 */
  function checkFlow(flow) {
    var out = [];
    flow.steps.forEach(function (s, i) {
      var r = flow.lanes.filter(function (l) { return hasR(s.roles[l]); }), a = flow.lanes.filter(function (l) { return hasA(s.roles[l]); });
      if (!r.length) out.push({ step: i, msg: (i + 1) + '단계 「' + s.name + '」에 R(실행)이 없습니다.' });
      if (a.length !== 1) out.push({ step: i, msg: (i + 1) + '단계 「' + s.name + '」에 A(최종 책임)가 ' + (a.length ? a.length + '개(' + a.join('·') + ')' : '없습니다') + (a.length ? '입니다. 하나만 두어 주세요.' : '.') });
    });
    return out;
  }
  function laneOf(flow, s) {
    for (var i = 0; i < flow.lanes.length; i++) if (hasR(s.roles[flow.lanes[i]])) return i;
    for (var j = 0; j < flow.lanes.length; j++) if (hasA(s.roles[flow.lanes[j]])) return j;
    return 0;
  }
  function wrapText(t, n, maxLines) {
    var words = String(t).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      while (w.length > n) { if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, n)); w = w.slice(n); }
      if (!cur) cur = w; else if ((cur + ' ' + w).length <= n) cur += ' ' + w; else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].slice(0, n - 1) + '…'; }
    return lines;
  }
  /* 수영 레인 흐름도 좌표 — 부서가 줄(레인), 단계가 왼쪽에서 오른쪽으로. 상자는 R(실행) 부서 줄에 놓습니다 */
  function flowLayout(flow) {
    var G = { labelW: 92, colW: 172, boxW: 150, boxH: 78, laneH: 104, top: 30 };
    var n = flow.steps.length, cum = 0;
    var boxes = flow.steps.map(function (s, i) {
      var lane = laneOf(flow, s);
      var from = cum; cum += s.days;
      return {
        i: i, lane: lane, x: G.labelW + 12 + i * G.colW, y: G.top + lane * G.laneH + (G.laneH - G.boxH) / 2, w: G.boxW, h: G.boxH,
        lines: wrapText(s.name, 11, 2), days: s.days, from: from, to: cum,
        a: flow.lanes.filter(function (l) { return hasA(s.roles[l]); }), noR: !flow.lanes.some(function (l) { return hasR(s.roles[l]); })
      };
    });
    var arrows = [];
    for (var i = 1; i < boxes.length; i++) {
      var a = boxes[i - 1], b = boxes[i];
      var x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = Math.round((x1 + x2) / 2);
      arrows.push({ from: i - 1, to: i, d: y1 === y2 ? 'M' + x1 + ' ' + y1 + 'H' + (x2 - 2) : 'M' + x1 + ' ' + y1 + 'H' + mx + 'V' + y2 + 'H' + (x2 - 2) });
    }
    return {
      width: G.labelW + 12 + Math.max(1, n) * G.colW, height: G.top + flow.lanes.length * G.laneH + 8, G: G, boxes: boxes, arrows: arrows, total: cum,
      lanes: flow.lanes.map(function (l, i) { return { name: l, y: G.top + i * G.laneH, h: G.laneH }; })
    };
  }

  /* ── 9. 인증서 비교 ───────────────────────────────────────── */
  function normLine(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function keyNorm(k) { return String(k).toLowerCase().replace(/[^a-z0-9가-힣]/g, ''); }
  /* 「항목: 값」 줄과 PDF 에서 칸이 벌어진 「항목   값」 줄을 항목으로 읽습니다. 같은 항목 이름이 또 나오면 「#2」를 붙입니다 */
  function parseKV(text) {
    var out = [], seen = {};
    String(text || '').split(/\r?\n/).forEach(function (raw, i) {
      var line = raw.replace(/\t/g, '   ');
      var m = /^\s*([^:：]{1,60}?)\s*[:：]\s*(.*)$/.exec(line);
      if (!m || !/[A-Za-z가-힣]/.test(m[1]) || /^\s*\d+[.)]\s/.test(m[1]) || /^https?$/i.test(m[1].trim())) m = /^\s*(\S.{0,58}?\S)\s{3,}(\S.*)$/.exec(line);
      if (!m || !/[A-Za-z가-힣]/.test(m[1]) || /^\s*\d+[.)]\s/.test(m[1])) return;
      var key = normLine(m[1]), k = keyNorm(key);
      if (!k) return;
      seen[k] = (seen[k] || 0) + 1;
      out.push({ key: key, k: seen[k] > 1 ? k + '#' + seen[k] : k, value: normLine(m[2]), line: i + 1 });
    });
    return out;
  }
  var ROUTINE_RE = /^(certificate(no|number)?|certno|certnumber|인증서?번호|증서번호|dateofissue|issuedate|issued(on)?|발급일(자)?|발행일|validuntil|valid(to|ity)?|expir\w*|만료일?|유효기간|유효기한|revision|rev|page|발급번호|문서번호|documentno)(#\d+)?$/;
  function isRoutineKey(k) { return ROUTINE_RE.test(String(k)); }
  function sameValue(a, b) { return normLine(a).toLowerCase() === normLine(b).toLowerCase(); }
  /* LCS 줄 비교. 줄이 아주 많으면(곱이 400만 넘음) 순서를 보지 않는 비교로 대신합니다 */
  function lcsOps(a, b, eq) {
    var n = a.length, m = b.length, ops = [];
    if (n * m > 4e6) {
      var cb = {}; b.forEach(function (x) { cb[x] = (cb[x] || 0) + 1; });
      var ca = {}; a.forEach(function (x) { ca[x] = (ca[x] || 0) + 1; });
      a.forEach(function (x) { if (cb[x]) { cb[x]--; ops.push({ op: '=', a: x, b: x }); } else ops.push({ op: '-', a: x }); });
      b.forEach(function (x) { if (ca[x]) ca[x]--; else ops.push({ op: '+', b: x }); });
      return ops;
    }
    var t = []; for (var i = 0; i <= n; i++) { t.push(new Int32Array(m + 1)); }
    for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) t[i][j] = eq(a[i], b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    i = 0; j = 0;
    while (i < n && j < m) {
      if (eq(a[i], b[j])) { ops.push({ op: '=', a: a[i], b: b[j] }); i++; j++; }
      else if (t[i + 1][j] >= t[i][j + 1]) { ops.push({ op: '-', a: a[i] }); i++; }
      else { ops.push({ op: '+', b: b[j] }); j++; }
    }
    while (i < n) ops.push({ op: '-', a: a[i++] });
    while (j < m) ops.push({ op: '+', b: b[j++] });
    return ops;
  }
  function lineDiff(oldText, newText) {
    var a = String(oldText || '').split(/\r?\n/).map(normLine).filter(Boolean), b = String(newText || '').split(/\r?\n/).map(normLine).filter(Boolean);
    var ops = lcsOps(a, b, function (x, y) { return x.toLowerCase() === y.toLowerCase(); });
    return { ops: ops, added: ops.filter(function (o) { return o.op === '+'; }).length, removed: ops.filter(function (o) { return o.op === '-'; }).length, same: ops.filter(function (o) { return o.op === '='; }).length };
  }
  /* 낱말 단위 차이(값 안에서 바뀐 곳 표시용): [{op:'='|'-'|'+', t}] */
  function wordDiff(a, b) {
    var ta = normLine(a).split(/(\s+)/).filter(function (x) { return x !== ''; }), tb = normLine(b).split(/(\s+)/).filter(function (x) { return x !== ''; });
    return lcsOps(ta, tb, function (x, y) { return x === y; }).map(function (o) { return { op: o.op, t: o.op === '+' ? o.b : o.a }; });
  }
  function compareCerts(oldText, newText) {
    var A = parseKV(oldText), B = parseKV(newText), byB = {}, items = [], usedB = {};
    B.forEach(function (x) { byB[x.k] = x; });
    A.forEach(function (x) {
      var y = byB[x.k];
      if (y) usedB[x.k] = 1;
      var kind = !y ? '삭제' : sameValue(x.value, y.value) ? '같음' : '변경';
      items.push({ key: x.key, k: x.k, old: x.value, new: y ? y.value : '', kind: kind, routine: isRoutineKey(x.k) });
    });
    B.forEach(function (y) { if (!usedB[y.k]) items.push({ key: y.key, k: y.k, old: '', new: y.value, kind: '추가', routine: isRoutineKey(y.k) }); });
    var lines = lineDiff(oldText, newText);
    // 항목으로 읽은 줄이 아닌 줄의 차이(조건 문장·목록 등)
    var kvLine = function (t) { return /^\s*([^:：]{1,60}?)\s*[:：]/.test(t) && parseKV(t).length > 0; };
    var free = lines.ops.filter(function (o) { return o.op !== '=' && !kvLine(o.op === '-' ? o.a : o.b); });
    var count = { '변경': 0, '추가': 0, '삭제': 0, '같음': 0 };
    items.forEach(function (it) { count[it.kind]++; });
    return {
      items: items, count: count, lines: lines, free: free,
      content: items.filter(function (it) { return it.kind !== '같음' && !it.routine; }),
      routine: items.filter(function (it) { return it.kind !== '같음' && it.routine; }),
      empty: !String(oldText || '').trim() || !String(newText || '').trim()
    };
  }
  /* PDF 글 조각 → 줄 (pdf.js getTextContent 의 items, data09-12 에서 옮겨 옴).
     같은 높이(y ±2)끼리 한 줄, 왼쪽부터. 조각 사이가 넓게 벌어지면 공백 세 칸을 넣어 칸을 살립니다 */
  function itemsToLines(items) {
    var rows = [];
    (items || []).forEach(function (it) {
      if (!it || !it.str || !it.transform) return;
      var y = it.transform[5], x = it.transform[4], size = Math.abs(it.transform[0]) || Math.abs(it.transform[3]) || 10;
      var w = it.width != null ? it.width : it.str.length * size * 0.5;
      var row = null;
      for (var i = 0; i < rows.length; i++) if (Math.abs(rows[i].y - y) <= 2) { row = rows[i]; break; }
      if (!row) { row = { y: y, parts: [] }; rows.push(row); }
      row.parts.push({ x: x, end: x + w, s: it.str, size: size });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) {
      r.parts.sort(function (a, b) { return a.x - b.x; });
      var out = '', prev = null;
      r.parts.forEach(function (p) {
        if (prev) {
          var gap = p.x - prev.end;
          if (gap > p.size * 1.2) out += '   ';
          else if (gap > p.size * 0.15 && !/\s$/.test(out) && !/^\s/.test(p.s)) out += ' ';
        }
        out += p.s; prev = p;
      });
      return out.replace(/\s+$/, '');
    }).join('\n');
  }

  /* ── 10. 이름 가리기 · AI 프롬프트 ────────────────────────── */
  var EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  var PHONE_RE = /(?:\+?\d{1,3}[-\s.]?)?(?:0\d{1,2}|\(\d{2,3}\))[-\s.]?\d{3,4}[-\s.]?\d{4}/g;
  /* 가릴 것: 사용자가 적은 낱말(회사명·사람 이름 등) · 메일 주소 · 전화번호 · (선택) 인증서 번호.
     반환 { text, map:{별칭:원래} } — map 은 이 PC 에만 두고, AI 답을 되돌릴 때 씁니다 */
  function maskText(text, opts) {
    opts = opts || {};
    var map = {}, back = {}, n = { w: 0, m: 0, p: 0, c: 0 };
    function alias(orig, kind) {
      if (back[orig]) return back[orig];
      n[kind]++;
      var a = { w: '가린말', m: '메일', p: '전화', c: '인증번호' }[kind] + n[kind];
      map[a] = orig; back[orig] = a; return a;
    }
    var s = String(text == null ? '' : text);
    var words = uniq((opts.words || []).map(str).filter(function (w) { return w.length >= 2; })).sort(function (a, b) { return b.length - a.length; });
    var certNos = uniq((opts.certNos || []).map(str).filter(function (w) { return w.length >= 3; })).sort(function (a, b) { return b.length - a.length; });
    s = s.replace(EMAIL_RE, function (m) { return alias(m, 'm'); });
    certNos.forEach(function (c) { s = s.replace(new RegExp('(^|[^0-9A-Za-z])' + escRe(c) + '(?![0-9A-Za-z])', 'g'), function (all, pre) { return pre + alias(c, 'c'); }); });
    s = s.replace(PHONE_RE, function (m) { return /^\d{4}-\d{2}-\d{2}$/.test(m.trim()) ? m : alias(m, 'p'); });
    words.forEach(function (w) { s = s.replace(new RegExp(escRe(w), 'gi'), function (m) { return alias(w, 'w'); }); });
    return { text: s, map: map };
  }
  function unmaskText(text, map) {
    var keys = Object.keys(map || {}).sort(function (a, b) { return b.length - a.length; });
    var s = String(text == null ? '' : text);
    keys.forEach(function (k) { s = s.replace(new RegExp(escRe(k) + '(?![0-9])', 'g'), map[k]); });
    return s;
  }
  function findLeaks(text, map) {
    var s = String(text || '').toLowerCase();
    return Object.keys(map || {}).map(function (k) { return map[k]; }).filter(function (v) { return s.indexOf(String(v).toLowerCase()) >= 0; });
  }
  function compareFacts(cmp, meta) {
    meta = meta || {};
    var L = [];
    L.push('[인증 정보] ' + ['인증기관: ' + (meta.body || '미상'), '인증 종류: ' + (meta.kind || '미상'), meta.product ? '제품: ' + meta.product : ''].filter(Boolean).join(' · '));
    L.push('[항목 비교] 변경 ' + cmp.count['변경'] + '건 · 추가 ' + cmp.count['추가'] + '건 · 삭제 ' + cmp.count['삭제'] + '건 · 같음 ' + cmp.count['같음'] + '건');
    var list = cmp.content.concat(cmp.routine);
    list.forEach(function (it, i) {
      L.push((i + 1) + '. (' + it.kind + ' · ' + (it.routine ? '번호·날짜' : '내용') + ') ' + it.key + ' / 이전: ' + (it.old || '(없음)') + ' / 신규: ' + (it.new || '(없음)'));
    });
    if (cmp.free.length) {
      L.push('[항목으로 나누지 못한 줄의 차이] (- 이전에만 있음, + 신규에만 있음)');
      cmp.free.slice(0, 40).forEach(function (o) { L.push(o.op === '-' ? '- ' + o.a : '+ ' + o.b); });
      if (cmp.free.length > 40) L.push('… 그 밖에 ' + (cmp.free.length - 40) + '줄');
    }
    return L.join('\n');
  }
  function aiComparePrompt(cmp, meta, opts) {
    opts = opts || {};
    var p = [
      '아래는 같은 제품의 이전 인증서와 새로 발급된 인증서를 항목별로 비교한 결과야. 이 사실만 근거로 변경 내용 요약을 써줘.',
      '',
      compareFacts(cmp, meta),
      '',
      '요청:',
      '1. 변경 내용을 「번호·날짜(정기 갱신으로 바뀌는 것)」와 「내용 변경(적용 범위·사양·조건·적용 규칙)」으로 나눠 표로 정리해줘.',
      '2. 내용 변경마다 영업·품질·개발 부서가 확인할 점을 한 줄씩 적어줘. 비교 결과만으로 알 수 없는 것은 「추정」이라고 밝혀줘.',
      '3. 비교 결과에 없는 내용은 지어내지 말아줘. 「가린말1」「메일1」「인증번호1」 같은 별칭은 그대로 써줘.',
      '4. 마지막에 내외부 배포용 3~5줄 요약을 써줘.'
    ].join('\n');
    if (opts.mask === false) return { prompt: p, map: {} };
    var r = maskText(p, { words: opts.words, certNos: opts.certNos });
    return { prompt: r.text, map: r.map };
  }

  /* ── 11. 집계·내보내기 표 ─────────────────────────────────── */
  function evaluate(records, S, today) {
    return (records || []).map(function (r) { return { rec: r, st: status(r, S, today) }; });
  }
  function summary(records, S, today) {
    var ev = evaluate(records, S, today), count = {};
    STATUS_ORDER.forEach(function (c) { count[c] = 0; });
    ev.forEach(function (x) { count[x.st.code]++; });
    var bodies = {}, order = [];
    ev.forEach(function (x) {
      if (x.st.code === 'inactive') return;
      var b = x.rec.body || '기관 미상';
      if (!bodies[b]) { bodies[b] = { body: b, total: 0, attention: 0 }; order.push(b); }
      bodies[b].total++; if (x.st.level >= 3) bodies[b].attention++;
    });
    var months = [], ym0 = today.slice(0, 7);
    for (var i = 0; i < 12; i++) {
      var y = +ym0.slice(0, 4), m = +ym0.slice(5, 7) + i; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12) + 1;
      months.push({ key: y + '-' + pad(m), label: String(y).slice(2) + '.' + pad(m), expire: 0, prep: 0 });
    }
    var idx = {}; months.forEach(function (x, i) { idx[x.key] = i; });
    ev.forEach(function (x) {
      if (x.st.code === 'done' || !x.st.plan) return;
      var e = idx[x.rec.expires.slice(0, 7)]; if (e != null) months[e].expire++;
      var p = idx[x.st.plan.prepStart.slice(0, 7)]; if (p != null && stageIndex(x.rec.stage) < 1) months[p].prep++;
    });
    var sorted = ev.slice().sort(function (a, b) { return b.st.level - a.st.level || (a.rec.expires < b.rec.expires ? -1 : 1); });
    return { running: ev.length - count.inactive, list: sorted, count: count, bodies: order.map(function (b) { return bodies[b]; }), months: months, attention: sorted.filter(function (x) { return x.st.level >= 3; }) };
  }
  /* 내보낸 엑셀을 그대로 다시 넣어도 읽히게: 「상태」 → 「상태 신호」(진행 단계와 겹치지 않게), 계획 날짜는 별칭이 아닌 이름 */
  var LEDGER_HEAD = ['인증기관', '인증 종류', '제품(군)', '모델·형식', '인증서 번호', '발급일', '만료일', '남은 날', '상태 신호', '상태 설명', '진행 단계', '적용 일정 기준', '리드타임(일)', '준비 시작', '신청 기한', '피드백 시작', '발급 목표', '주관 부서', '담당자', '신청일', '배포일', '운영 상태', '중지 사유', '중지일', '묶음 키', '이력(건)', '인증서 PDF', '비고'];
  function ledgerRows(records, S, today) {
    return evaluate(records, S, today).map(function (x) {
      var r = x.rec, p = x.st.plan || {};
      return [r.body, r.kind, r.product, r.model, r.certNo, r.issued, r.expires, x.st.daysLeft == null ? '' : x.st.daysLeft, x.st.label, x.st.msg || '', stageLabel(r.stage),
        (p.rule || '') + (p.custom ? ' (대장 값으로 맞춤)' : ''), p.lead || '', p.prepStart || '', p.applyDate || '', p.feedbackStart || '', p.targetIssue || '', r.owner, r.person, r.applied || '', r.distributed || '',
        stateLabel(r.state || 'active'), r.stopReason || '', r.stopDate || '', modelKey(r.model), (r.history || []).length, r.pdf ? r.pdf.name : '', r.note];
    });
  }
  /* 간트 창: 오늘 기준 앞 back 일, 뒤 months 개월 */
  function ganttWindow(today, months, back) {
    var from = addDays(today, -(back == null ? 30 : back)), to = addDays(today, Math.round(months * 30.44));
    return { from: from, to: to, days: daysBetween(from, to) };
  }
  function overlaps(a1, a2, b1, b2) { return a1 <= b2 && b1 <= a2; }

  /* ── 12. 저장 모양 ────────────────────────────────────────── */
  function emptyDb() { return { v: 2, records: [], files: [], settings: defaultSettings(), flow: defaultFlow(), compare: { oldText: '', newText: '', oldName: '', newName: '', recId: '', answer: '' }, mask: true, maskCertNo: true, sample: false }; }
  function restoreDb(o) {
    var d = emptyDb();
    if (!o || typeof o !== 'object') return d;
    /* v1(1단계) → v2: 인증마다 운영 상태(없으면 운영 중)·중지 사유·중지일·PDF 칸을 더하고, 이력 줄에 id·상태(갱신됨)를 붙입니다. 값은 지우지 않습니다 */
    d.records = Array.isArray(o.records) ? o.records.filter(function (r) { return r && r.expires; }).map(function (r) {
      r.history = Array.isArray(r.history) ? sortHistory(r.history.filter(Boolean).map(cleanHist)) : [];
      r.stage = STAGES.some(function (s) { return s.id === r.stage; }) ? r.stage : 'none';
      r.state = STATES.some(function (s) { return s.id === r.state; }) ? r.state : 'active';
      r.stopReason = str(r.stopReason); r.stopDate = toISO(r.stopDate); r.pdf = cleanPdf(r.pdf);
      stripImport(r);
      r.key = r.key || recordKey(r); r.id = r.id || 'c' + hash(r.key); return r;
    }) : [];
    d.files = Array.isArray(o.files) ? o.files : [];
    d.settings = cleanSettings(o.settings);
    d.flow = cleanFlow(o.flow);
    if (o.compare && typeof o.compare === 'object') Object.keys(d.compare).forEach(function (k) { if (o.compare[k] != null) d.compare[k] = String(o.compare[k]); });
    d.mask = o.mask !== false; d.maskCertNo = o.maskCertNo !== false; d.sample = !!o.sample;
    return d;
  }

  return {
    VERSION: VERSION,
    str: str, norm: norm, toISO: toISO, isAmbiguousDate: isAmbiguousDate, addDays: addDays, addYears: addYears, daysBetween: daysBetween, localToday: localToday, dLabel: dLabel, colName: colName,
    FIELDS: FIELDS, FIELD_BY_ID: FIELD_BY_ID, matchField: matchField, detectColumns: detectColumns, parseSheet: parseSheet, pickSheet: pickSheet, headerSignature: headerSignature,
    STATES: STATES, HIST_STATES: HIST_STATES, stateLabel: stateLabel, isRunning: isRunning, parseState: parseState, modelKey: modelKey, lineKey: lineKey, histKey: histKey,
    cleanHist: cleanHist, cleanPdf: cleanPdf, sortHistory: sortHistory, dedupeHistory: dedupeHistory, addHistory: addHistory, setState: setState, attachHistory: attachHistory, stripImport: stripImport,
    groupByModel: groupByModel, HISTORY_HEAD: HISTORY_HEAD, historyRows: historyRows, isHistorySheet: isHistorySheet,
    STAGES: STAGES, stageIndex: stageIndex, stageLabel: stageLabel, parseStage: parseStage, recordKey: recordKey, mergeRecords: mergeRecords, renewRecord: renewRecord,
    PHASES: PHASES, EVENTS: EVENTS, defaultSettings: defaultSettings, cleanSettings: cleanSettings, kindRule: kindRule, bodyExtraDays: bodyExtraDays,
    plan: plan, STATUS: STATUS, STATUS_ORDER: STATUS_ORDER, status: status, statusLabel: statusLabel,
    pendingEvents: pendingEvents, alerts: alerts, mailDrafts: mailDrafts, certTitle: certTitle, whenText: whenText,
    ROLES: ROLES, defaultFlow: defaultFlow, cleanFlow: cleanFlow, checkFlow: checkFlow, flowLayout: flowLayout, wrapText: wrapText,
    parseKV: parseKV, isRoutineKey: isRoutineKey, lineDiff: lineDiff, wordDiff: wordDiff, compareCerts: compareCerts, itemsToLines: itemsToLines,
    maskText: maskText, unmaskText: unmaskText, findLeaks: findLeaks, compareFacts: compareFacts, aiComparePrompt: aiComparePrompt,
    evaluate: evaluate, summary: summary, LEDGER_HEAD: LEDGER_HEAD, ledgerRows: ledgerRows, ganttWindow: ganttWindow, overlaps: overlaps,
    emptyDb: emptyDb, restoreDb: restoreDb
  };
});

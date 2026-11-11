/* 인증 갱신 관리 — 화면
   계산은 js/logic.js(CTLogic), 그래프는 js/charts.js, 저장은 js/store.js, AI 연결은 js/ai-endpoint.js·ai-panel.js.
   뼈대(가져오기·열 연결·AI 패널·보고서 내보내기)는 data10-11 에서 가져왔습니다. */
(function () {
  'use strict';
  var L = window.CTLogic, S = window.CTStore, C = window.CTCharts, AIP = window.AIPanel, Sample = window.CTSample, P = window.CTPdfs;
  /* 판 맞추기 — 브라우저가 옛 logic.js 와 새 app.js 를 섞어 쓰면(Pages 캐시) 버튼과 결과가 어긋날 수 있어, 섞였으면 계산하지 않고 새로고침을 안내합니다.
     판은 scripts/bump-version.mjs 로 index.html(?v=) · logic.js 와 함께 올립니다. */
  var APP_VERSION = '2026-11-11.6';
  if (!L || L.VERSION !== APP_VERSION) {
    var m0 = document.getElementById('main') || document.body;
    m0.innerHTML = '<section class="card" id="versionMismatch"><h1>새 판이 나왔습니다 — 새로고침(Ctrl+F5)해 주세요</h1><p class="alert warn">이 브라우저가 옛 파일과 새 파일을 섞어 불러왔습니다(js/logic.js ' +
      (L && L.VERSION ? L.VERSION : '옛 판') + ' · 화면 ' + APP_VERSION + '). 이대로 계산하면 버튼과 결과가 어긋날 수 있어 멈췄습니다.</p>' +
      '<p>Windows 는 <b>Ctrl+F5</b>, Mac 은 <b>Cmd+Shift+R</b> 을 한 번 눌러 주세요. 쌓아 둔 자료는 지워지지 않습니다.</p></section>';
    return;
  }
  (function () { var ft = document.querySelector('.site-footer .inner') || document.querySelector('.site-footer'); if (!ft) return; var s = document.createElement('span'); s.className = 'ver'; s.textContent = ' · 판 ' + APP_VERSION; ft.appendChild(s); })();
  var db = S.loadDb();
  var ui = { pending: [], errors: [], editId: '', renewId: '', gStatus: 'all', gBody: 'all', gMonths: 12, lStatus: 'all', lBody: 'all', report: 'status',
    mState: 'all', mQuery: '', histFor: '', stateId: '', viewer: null, open: {} };
  var main = document.getElementById('main');
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

  /* ── 작은 도구 ───────────────────────────── */
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(e, x); }); return; }
    e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  var NS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }
  function fld(label, control, hint) {
    return h('label', { class: 'field' }, h('span', null, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
  }
  var toastTimer = null;
  function toast(msg, err) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast' + (err ? ' error' : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function save() {
    var ok = S.saveDb(db);
    document.getElementById('storeNote').textContent = ok ? '이 브라우저에 저장됨 · ' + S.sizeKb() + 'KB' : '저장 안 됨(브라우저 저장소가 막혔거나 가득 참) — JSON 백업을 받아 두세요';
    return ok;
  }
  function download(name, blob) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function copyText(t, msg) {
    function fallback() { var ta = h('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(msg || '복사했습니다.'); } catch (e) { toast('복사하지 못했습니다. 직접 선택해 복사해 주세요.', true); } ta.remove(); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast(msg || '복사했습니다.'); }, fallback); else fallback();
  }
  function pageHead(stage, title, lead, right) {
    return h('div', { class: 'page-head' }, h('div', { class: 'titles' }, h('div', { class: 'stage' }, stage), h('h1', null, title), lead ? h('p', { class: 'lead' }, lead) : null), right || null);
  }
  /* 시작 화면 그림(수강생 제공, 10-28) — 대시보드 · (데이터가 없을 때의) 가져오기 화면 맨 위.
     글자는 그림 안에 있으므로 제목(h1)은 그대로 두고 그림은 alt 로만 설명합니다.
     높이는 화면 높이의 34% 까지(CSS) — 노트북 화면에서도 아래 단추·타일이 첫 화면에 보이게. */
  function startHero() {
    return h('figure', { class: 'start-hero no-print' },
      h('picture', null,
        h('source', { type: 'image/webp', srcset: 'images/start-hero.webp' }),
        h('img', { src: 'images/start-hero.jpg', width: '1600', height: '901', decoding: 'async', fetchpriority: 'high',
          alt: '인증서 관리 — 밤 항구에 정박한 컨테이너선과 크레인 그림' })));
  }
  function emptyNotice() {
    return h('section', { class: 'card empty' },
      h('p', null, '아직 가져온 인증 관리대장이 없습니다.'),
      h('p', null, '관리대장 엑셀을 가져오거나, 가상 샘플로 먼저 둘러봐 주세요.'),
      h('div', { class: 'btn-row', style: 'justify-content:center' },
        h('a', { class: 'btn btn-primary', href: '#/import' }, '데이터 가져오기로'),
        h('button', { type: 'button', class: 'btn', onclick: loadSample }, '샘플로 시작')));
  }
  function tile(k, v, sub, cls) { return h('div', { class: 'tile' + (cls ? ' ' + cls : '') }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), sub ? h('div', { class: 'note' }, sub) : null); }
  function table(head, rows, opts) {
    opts = opts || {};
    var t = h('table', { class: 'list' + (opts.cls ? ' ' + opts.cls : '') });
    var tr = h('tr');
    head.forEach(function (x, i) { tr.appendChild(h('th', { class: opts.num && opts.num[i] ? 'num' : null, scope: 'col' }, x)); });
    t.appendChild(h('thead', null, tr));
    var tb = h('tbody');
    rows.forEach(function (r) {
      var row = h('tr', { class: r.cls || null });
      (r.cells || r).forEach(function (x, i) { row.appendChild(h('td', { class: ((opts.num && opts.num[i] ? 'num' : '') + (r.tdCls && r.tdCls[i] ? ' ' + r.tdCls[i] : '')) || null }, x)); });
      tb.appendChild(row);
    });
    t.appendChild(tb);
    return h('div', { class: 'table-wrap' }, t);
  }
  function stPill(st) { return h('span', { class: 'st st-' + st.code }, st.label); }
  function lvCls(level) { return level >= 5 ? 'lv-hi' : level >= 3 ? 'lv-mid' : null; }

  /* ── 기준일 · 설정 ───────────────────────── */
  function settings() { return L.cleanSettings(db.settings); }
  function today() { return settings().today || L.localToday(); }
  function evaluated() { var Sx = settings(), t = today(); return L.evaluate(db.records, Sx, t); }
  function recById(id) { return db.records.filter(function (r) { return r.id === id; })[0]; }
  function bodies() { var s = []; db.records.forEach(function (r) { if (r.body && s.indexOf(r.body) < 0) s.push(r.body); }); return s.sort(); }

  /* ── 가져오기 ───────────────────────────── */
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        try { resolve(prepare(file.name, XLSX.read(new Uint8Array(fr.result), { type: 'array', cellDates: true }))); }
        catch (e) { reject(new Error(file.name + ': 엑셀로 읽지 못했습니다(' + e.message + '). 문서보안(DRM)이 걸린 파일이면 CSV 로 저장해 넣어 주세요.')); }
      };
      fr.onerror = function () { reject(new Error(file.name + ': 파일을 읽지 못했습니다.')); };
      fr.readAsArrayBuffer(file);
    });
  }
  function prepare(name, wb) {
    var sheets = wb.SheetNames.map(function (n) { return { name: n, aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) }; });
    var pick = L.pickSheet(sheets) || sheets[0];
    var it = { name: name, sheets: sheets, sheet: pick.name, overrides: {} };
    reparse(it);
    return it;
  }
  function reparse(it) {
    var sh = it.sheets.filter(function (s) { return s.name === it.sheet; })[0];
    it.result = L.parseSheet(sh.aoa, { overrides: Object.keys(it.overrides).length ? it.overrides : null });
    // 이름에 「이력」이 든 다른 시트는 지난 인증서·중지된 인증 목록으로 함께 읽습니다(2차)
    it.hist = it.sheets.filter(function (x) { return x.name !== it.sheet && L.isHistorySheet(x.name); }).map(function (x) {
      return { name: x.name, result: L.parseSheet(x.aoa, { history: true }) };
    }).filter(function (x) { return x.result.det.headerRow >= 0 && !x.result.det.missing.length; });
  }
  /* 가져온 파일들 → { records(인증), hist(이력 줄) } — 관리대장에서 「갱신됨」으로 적힌 줄과 이력 시트의 줄은 이력으로 */
  function splitImport(items) {
    var recs = [], hist = [];
    items.forEach(function (it) {
      it.result.records.forEach(function (r) { (r.isHistory ? hist : recs).push(r); });
      (it.hist || []).forEach(function (x) { x.result.records.forEach(function (r) { (r.isHistory ? hist : recs).push(r); }); });
    });
    return { records: recs, hist: hist };
  }
  function combine(existing, items) {
    var sp = splitImport(items);
    var m = L.mergeRecords(existing, sp.records);
    var a = L.attachHistory(m.records, sp.hist);
    a.records.forEach(L.stripImport);
    return { records: a.records, stat: { added: m.stat.added, updated: m.stat.updated, attached: a.stat.attached, created: a.stat.created, dup: a.stat.dup } };
  }
  function pdfIdsOf(rec) { var o = []; if (rec.pdf) o.push(rec.pdf.id); (rec.history || []).forEach(function (x) { if (x.pdf) o.push(x.pdf.id); }); return o; }
  function allPdfIds() { var o = []; db.records.forEach(function (r) { o = o.concat(pdfIdsOf(r)); }); return o; }
  function handleFiles(list) {
    var files = Array.prototype.slice.call(list || []).filter(function (f) { return /\.(xlsx|xlsm|xls|csv)$/i.test(f.name); });
    if (!files.length) { toast('엑셀 파일(.xlsx·.xls·.csv)을 골라 주세요.', true); return; }
    ui.errors = [];
    Promise.all(files.map(function (f) { return readFile(f).then(function (it) { ui.pending.push(it); }, function (e) { ui.errors.push(e.message); }); }))
      .then(function () { render(); });
  }
  function commit(items) {
    items.forEach(function (it) {
      db.files.push({ name: it.name, sheet: it.sheet, rows: it.result.records.length, at: new Date().toISOString().slice(0, 16).replace('T', ' ') });
    });
    if (db.sample) { P.del(allPdfIds()); db.records = []; db.sample = false; }
    var m = combine(db.records, items);
    db.records = m.records;
    ui.pending = ui.pending.filter(function (p) { return items.indexOf(p) < 0; });
    save();
    toast('반영했습니다 — 새 인증 ' + (m.stat.added + m.stat.created) + '건, 고친 인증 ' + m.stat.updated + '건' + (m.stat.attached ? ', 붙인 이력 ' + m.stat.attached + '줄' : '') + (m.stat.dup ? ' (이미 있는 이력 ' + m.stat.dup + '줄은 건너뜀)' : '') + '.');
    location.hash = '#/dash';
    render();
  }
  function sampleWorkbookAoa(aoa, haoa) {
    // 앱이 실제 파일을 읽는 길과 같게: 엑셀로 썼다가 다시 읽습니다(날짜 칸 포함)
    var conv = aoa.map(function (row, i) { return i < 3 ? row : row.map(function (v, c) { return (c === 6 || c === 7) && typeof v === 'string' && v ? new Date(v + 'T00:00:00') : v; }); });
    var hconv = (haoa || []).map(function (row, i) { return i < 2 ? row : row.map(function (v, c) { return [5, 6, 9].indexOf(c) >= 0 && typeof v === 'string' && v ? new Date(v + 'T00:00:00') : v; }); });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(conv, { cellDates: true }), '관리대장');
    if (hconv.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hconv, { cellDates: true }), '인증 이력');
    return XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array', cellDates: true });
  }
  function loadSample() {
    var b = Sample.build(L.localToday());
    var it = prepare('가상 샘플 관리대장(기준일 ' + L.localToday() + ')', sampleWorkbookAoa(b.aoa, b.histAoa));
    P.del(allPdfIds());
    db = L.emptyDb();
    db.records = combine([], [it]).records;
    db.files = [{ name: it.name, sheet: it.sheet, rows: db.records.length, at: new Date().toISOString().slice(0, 16).replace('T', ' ') }];
    var c = b.compare;
    db.compare = { oldText: c.oldText, newText: c.newText, oldName: c.oldName, newName: c.newName, recId: db.records[0] ? db.records[0].id : '', answer: '' };
    db.settings.maskWords = c.maskWords.slice();
    db.sample = true;
    ui.pending = [];
    save();
    var nRun = db.records.filter(L.isRunning).length;
    toast('가상 샘플(운영 중 ' + nRun + '건 · 중지·종료 ' + (db.records.length - nRun) + '건 · 지난 인증서 이력)과 비교용 인증서 2장을 불러왔습니다.');
    location.hash = '#/dash';
    render();
    attachSamplePdfs(b.pdfs);
  }
  /* 가상 인증서 PDF(글자층 있는 1쪽)를 만들어 해당 인증·이력 줄에 붙입니다 */
  function attachSamplePdfs(list) {
    var jobs = (list || []).map(function (x) {
      var rec = db.records.filter(function (r) { return L.lineKey(r) === L.lineKey(x) || (L.modelKey(r.model) === L.modelKey(x.model) && r.body === x.body && r.kind === x.kind); })[0];
      if (!rec) return null;
      var target = rec.certNo === x.certNo ? rec : (rec.history || []).filter(function (hh) { return hh.certNo === x.certNo; })[0];
      if (!target) return null;
      return P.putBytes(Sample.pdfBytes(x.text), x.name, L.localToday()).then(function (meta) { target.pdf = meta; });
    }).filter(Boolean);
    return Promise.all(jobs).then(function () { if (db.sample) { save(); render(); } }, function (e) { toast('샘플 PDF 를 저장하지 못했습니다: ' + e.message, true); });
  }
  function pageImport() {
    var input = h('input', { type: 'file', multiple: true, accept: '.xlsx,.xlsm,.xls,.csv' });
    input.addEventListener('change', function () { handleFiles(input.files); input.value = ''; });
    var drop = h('div', { class: 'drop' },
      h('label', { class: 'btn btn-primary' }, '관리대장 엑셀 고르기', input),
      h('span', { class: 'note' }, '또는 파일을 여기에 끌어다 놓아 주세요. 여러 개를 함께 넣어도 됩니다.'));
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); handleFiles(e.dataTransfer.files); });
    var out = [db.records.length ? null : startHero(), pageHead('0', '데이터 가져오기', '인증 관리대장 엑셀을 넣으면 열을 찾아 연결하고, 만료일에서 거꾸로 갱신 일정을 세웁니다.'),
      h('section', { class: 'card' },
        drop,
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn', onclick: function () { if (!db.records.length || confirm('지금 데이터를 지우고 가상 샘플을 불러올까요?')) loadSample(); } }, '샘플로 시작'),
          h('a', { class: 'btn', href: 'samples/' + encodeURIComponent('인증_관리대장_샘플.xlsx'), download: '' }, '샘플 관리대장 내려받기')),
        h('ul', { class: 'note', style: 'margin-top:10px' },
          h('li', null, '꼭 필요한 열: 인증기관(선급) · 인증 종류 · 만료일. 있으면 쓰는 열: 제품(군) · 모델-형식 · 인증서 번호 · 발급일 · 진행 단계 · 신청일 · 갱신 리드타임(일) · 주관 부서 · 담당자 · 배포일 · 운영 상태 · 중지 사유 · 중지일 · 비고.'),
          h('li', null, '지난 인증서·중지된 인증은 이름에 「이력」이 든 시트(예: 「인증 이력」)에 같은 열로 적거나, 관리대장 줄의 운영 상태에 「갱신됨」(지난 인증서) · 「중지」 · 「만료 종료」 · 「폐기」로 적어 주세요. 같은 모델-형식 · 기관 · 종류의 인증에 이력으로 붙습니다.'),
          h('li', null, '열 이름이 조금 달라도(「선급」「유효기간」「Valid until」 …) 찾고, 못 찾은 열은 아래에서 골라 연결합니다.'),
          h('li', null, '같은 인증(기관·종류·제품·모델·번호가 같음)은 다시 넣어도 한 행입니다. 이 도구에서 바꾼 진행 단계·배포일은 지킵니다.')),
        ui.errors.length ? h('div', { class: 'alert warn' }, h('ul', null, ui.errors.map(function (e) { return h('li', null, e); }))) : null)];
    if (ui.pending.length) {
      var ready = ui.pending.filter(function (it) { return !it.result.det.missing.length && it.result.records.length; });
      var box = h('section', { class: 'card' }, h('h2', null, '확인 후 반영'));
      ui.pending.forEach(function (it) { box.appendChild(pendingCard(it)); });
      box.appendChild(h('div', { class: 'btn-row', style: 'margin-top:12px' },
        h('button', { type: 'button', class: 'btn btn-primary', disabled: !ready.length, onclick: function () { commit(ready); } }, '확인한 ' + ready.length + '개 파일 반영'),
        h('button', { type: 'button', class: 'btn', onclick: function () { ui.pending = []; render(); } }, '취소')));
      out.push(box);
    }
    if (db.files.length) out.push(h('section', { class: 'card' }, h('h2', null, '가져온 파일'),
      table(['파일', '시트', '인증 수', '가져온 때'], db.files.slice().reverse().map(function (f) { return [f.name, f.sheet, f.rows, f.at]; }), { num: [0, 0, 1, 0] }),
      h('div', { class: 'btn-row', style: 'margin-top:10px' }, h('button', { type: 'button', class: 'btn btn-danger', onclick: function () {
        if (confirm('관리대장·이력·인증서 PDF·비교 글·설정을 모두 지울까요? 되돌릴 수 없습니다(JSON 백업을 먼저 받아 두세요).')) { S.clearDb(); P.clear(); db = L.emptyDb(); save(); render(); }
      } }, '모든 데이터 지우기'))));
    return out;
  }
  function pendingCard(it) {
    var r = it.result, det = r.det;
    var sheetSel = h('select', { 'aria-label': '시트' });
    it.sheets.forEach(function (s) { var o = h('option', { value: s.name }, s.name); if (s.name === it.sheet) o.selected = true; sheetSel.appendChild(o); });
    sheetSel.addEventListener('change', function () { it.sheet = sheetSel.value; it.overrides = {}; reparse(it); render(); });
    var hdr = det.headers || [];
    var grid = h('div', { class: 'map-grid' });
    L.FIELDS.forEach(function (f) {
      var sel = h('select', { 'aria-label': f.label + ' 열' });
      sel.appendChild(h('option', { value: '-1' }, '(없음)'));
      hdr.forEach(function (t, i) { var o = h('option', { value: String(i) }, L.colName(i) + ' · ' + (t || '(빈 머리)')); if (det.map[f.id] === i) o.selected = true; sel.appendChild(o); });
      if (det.map[f.id] == null) sel.value = '-1';
      sel.addEventListener('change', function () { it.overrides[f.id] = Number(sel.value); reparse(it); render(); });
      grid.appendChild(h('div', { class: 'map-row' + (f.req && det.map[f.id] == null ? ' missing' : '') }, h('span', { class: 'col' }, f.label, f.req ? h('span', { class: 'req' }, ' 꼭 필요') : null), sel));
    });
    return h('details', { class: 'block', open: true },
      h('summary', null, it.name + ' — 인증 ' + r.records.length + '건' + (r.skipped ? ' · 건너뜀 ' + r.skipped : '') + (det.missing.length ? ' · 열 연결 필요' : '')),
      h('div', { class: 'form-grid', style: 'margin:8px 0' }, fld('시트', sheetSel, det.headerRow >= 0 ? '머리행: ' + (det.headerRow + 1) + '행' : '')),
      det.warnings.map(function (w) { return h('p', { class: 'alert warn' }, w); }),
      grid,
      r.warnings.length ? h('details', { class: 'warn-list' }, h('summary', null, '행 알림 ' + r.warnings.length + '건'), h('ul', null, r.warnings.slice(0, 80).map(function (w) { return h('li', null, w.row + '행: ' + w.msg); }))) : null,
      (function () {
        var nh = r.records.filter(function (x) { return x.isHistory; }).length, ns = r.records.filter(function (x) { return !x.isHistory && x.state !== 'active'; }).length;
        var lines = [];
        if (nh || ns) lines.push(h('li', null, '이 시트에서: 지난 인증서(갱신됨 등) ' + nh + '줄 · 중지·종료 인증 ' + ns + '건'));
        (it.hist || []).forEach(function (x) { lines.push(h('li', null, '이력 시트 「' + x.name + '」 ' + x.result.records.length + '줄도 함께 읽습니다' + (x.result.warnings.length ? ' (행 알림 ' + x.result.warnings.length + '건)' : '') + '.')); });
        return lines.length ? h('ul', { class: 'note' }, lines) : null;
      })());
  }

  /* ── ① 대시보드 ─────────────────────────── */
  function pageDash() {
    if (!db.records.length) return [startHero(), pageHead('①', '대시보드', '인증별 상태 신호와 지금 할 일'), emptyNotice()];
    var Sx = settings(), t = today(), sm = L.summary(db.records, Sx, t);
    var c = sm.count;
    var tiles = h('div', { class: 'tiles status-tiles' },
      tile('운영 중 인증', sm.running + '건', '기준일 ' + t + (c.inactive ? ' · 중지·종료 ' + c.inactive + '건은 이력에만' : '')),
      tile('만료', c.expired + '건', '만료일이 지남', 'st-tile ' + (c.expired ? 'lv-hi' : 'lv-ok')),
      tile('지연', c.late + '건', '단계 기한이 ' + Sx.graceDays + '일 넘게 지남', 'st-tile ' + (c.late ? 'lv-hi' : 'lv-ok')),
      tile('임박', c.urgent + '건', '만료 ' + Sx.urgentDays + '일 안', 'st-tile ' + (c.urgent ? 'lv-mid' : 'lv-ok')),
      tile('배포 필요', c.distribute + '건', '신규 인증서 받고 배포 전', 'st-tile ' + (c.distribute ? 'lv-mid' : 'lv-ok')),
      tile('준비 시작·진행', c.active + '건', '일정대로', 'st-tile lv-lo'),
      tile('준비 예정', c.soon + '건', Sx.noticeDays + '일 안에 준비 시작', 'st-tile lv-lo'),
      tile('정상·완료', (c.ok + c.done) + '건', '', 'st-tile lv-ok'));
    var todo = sm.attention.concat(sm.list.filter(function (x) { return x.st.code === 'active' && x.st.stage === 0; }));
    var al = L.alerts(db.records, Sx, t);
    return [
      startHero(),
      pageHead('①', '대시보드', '관리대장의 만료일과 인증 종류별 리드타임으로 지금 상태를 봅니다. 날짜는 기준일 ' + t + ' 기준입니다.',
        h('div', { class: 'btn-row no-print' }, h('a', { class: 'btn btn-primary', href: '#/alert' }, '오늘 알림 ' + al.length + '건 보기'), h('a', { class: 'btn', href: '#/gantt' }, '갱신 타임라인'))),
      tiles,
      h('section', { class: 'card' }, h('h2', null, '지금 할 일 (' + todo.length + '건)'),
        todo.length ? h('div', { class: 'todo' }, todo.map(function (x) {
          return h('div', { class: 'todo-item' },
            h('div', null, h('div', { class: 'what' }, L.certTitle(x.rec)), h('div', { class: 'note' }, (x.rec.certNo ? '인증서 ' + x.rec.certNo + ' · ' : '') + '만료 ' + x.rec.expires + ' (' + (x.st.daysLeft == null ? '-' : L.dLabel(x.st.daysLeft)) + ') · ' + L.stageLabel(x.rec.stage))),
            stPill(x.st), h('div', { class: 'why' }, x.st.msg));
        })) : h('p', { class: 'note' }, '만료·지연·임박·배포 필요인 인증이 없습니다.')),
      h('div', { class: 'charts' },
        C.figure('앞으로 12개월 — 달마다 만료되는 인증과 준비를 시작할 인증', { type: 'bar', labels: sm.months.map(function (m) { return m.label; }), unit: '건',
          series: [{ name: '만료', values: sm.months.map(function (m) { return m.expire; }), color: 'var(--series-2)' }, { name: '준비 시작', values: sm.months.map(function (m) { return m.prep; }), color: 'var(--series-1)' }] }),
        h('div', null, h('h3', null, '인증기관별'),
          table(['인증기관', '인증 수', '살펴볼 것(만료·지연·임박·배포)'], sm.bodies.map(function (b) { return { cells: [b.body, b.total, b.attention], cls: b.attention ? 'differs' : null }; }), { num: [0, 1, 1] }))),
      h('section', { class: 'card' }, h('h2', null, '상태 신호 읽는 법'),
        h('ul', { class: 'note' },
          h('li', null, '갱신 일정은 만료일에서 거꾸로 셉니다: 만료일 − 여유 = 발급 목표, − 발급 처리 = 피드백 마감, − 피드백 대응 = 기관 심사 끝, − 기관 심사 = 신청 기한, − 준비 = 준비 시작. 일수는 설정의 인증 종류별 리드타임입니다.'),
          h('li', null, '지연 = 그 날짜까지 끝냈어야 할 단계(준비 시작·신청·기관 심사 진행·발급)가 유예 ' + Sx.graceDays + '일을 넘게 지났는데 관리대장의 진행 단계가 아직 그 앞일 때입니다.'),
          h('li', null, '진행 단계를 「발급 완료」로 바꾸면 만료 판정을 멈추고 「배포 필요」가 되며, 배포일을 적으면 「완료」입니다.')))
    ];
  }

  /* ── ② 갱신 타임라인(간트) ───────────────── */
  var PH_LEG = [['ph-prep', '준비'], ['ph-review', '기관 심사'], ['ph-feedback', '피드백 대응'], ['ph-issue', '발급 처리'], ['ph-buffer', '여유']];
  function ganttSvg(list, win, t) {
    var labelW = 250, W = 1180, rowH = 34, top = 34, plotW = W - labelW - 16;
    var H = top + Math.max(1, list.length) * rowH + 10;
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'gantt', role: 'img', 'aria-label': '인증별 갱신 타임라인' });
    function x(d) { var n = L.daysBetween(win.from, d); return labelW + Math.max(0, Math.min(win.days, n)) / win.days * plotW; }
    // 달 눈금
    var d0 = win.from.slice(0, 8) + '01'; if (d0 < win.from) { var p = d0.split('-').map(Number); p[1]++; if (p[1] > 12) { p[1] = 1; p[0]++; } d0 = p[0] + '-' + (p[1] < 10 ? '0' : '') + p[1] + '-01'; }
    var step = win.days > 500 ? 3 : 1, k = 0;
    for (var m = d0; m <= win.to; ) {
      if (k % step === 0) {
        var xx = x(m);
        svg.appendChild(sv('line', { x1: xx, x2: xx, y1: top - 6, y2: H - 6, class: 'mtick' }));
        svg.appendChild(sv('text', { x: xx + 3, y: top - 12, class: 'mtxt' }, (m.slice(5, 7) === '01' || k === 0 ? m.slice(2, 4) + '.' : '') + (+m.slice(5, 7)) + '월'));
      }
      var q = m.split('-').map(Number); q[1]++; if (q[1] > 12) { q[1] = 1; q[0]++; } m = q[0] + '-' + (q[1] < 10 ? '0' : '') + q[1] + '-01'; k++;
    }
    list.forEach(function (it, i) {
      var y = top + i * rowH, r = it.rec, st = it.st, p = st.plan;
      svg.appendChild(sv('rect', { x: 0, y: y, width: W, height: rowH, class: 'row-bg' + (st.level >= 5 ? ' hi' : st.level >= 3 ? ' mid' : i % 2 ? ' alt' : '') }));
      var t1 = sv('text', { x: 8, y: y + 14, class: 'lbl' }, ('[' + r.body + '] ' + (r.model && r.model !== '-' ? r.model : r.product || r.kind)).slice(0, 30));
      svg.appendChild(t1);
      svg.appendChild(sv('text', { x: 8, y: y + 28, class: 'lbl sub' }, (r.kind + ' · ' + st.label + ' · ' + L.stageLabel(r.stage)).slice(0, 38)));
      if (!p) return;
      if (st.code === 'done' || st.code === 'distribute') {
        var a = x(p.prepStart), b = x(r.expires);
        if (b > a) svg.appendChild(sv('rect', { x: a, y: y + 12, width: b - a, height: 10, rx: 3, class: 'done-bar' }));
      } else {
        p.phases.forEach(function (ph) {
          if (ph.to < win.from || ph.from > win.to) return;
          var a = x(ph.from), b = x(ph.to);
          if (b - a < 0.5) return;
          var rc = sv('rect', { x: a, y: y + 9, width: b - a, height: 16, rx: 2, class: 'ph-' + ph.id });
          rc.appendChild(sv('title', null, ph.label + ' ' + ph.from + ' ~ ' + ph.to + ' (' + L.daysBetween(ph.from, ph.to) + '일)'));
          svg.appendChild(rc);
        });
      }
      if (r.expires >= win.from && r.expires <= win.to) {
        var ex = x(r.expires), dm = sv('path', { d: 'M' + ex + ' ' + (y + 10) + 'l6 7l-6 7l-6 -7z', class: 'exp' });
        dm.appendChild(sv('title', null, '만료 ' + r.expires));
        svg.appendChild(dm);
      }
    });
    var tx = x(t);
    svg.appendChild(sv('line', { x1: tx, x2: tx, y1: top - 8, y2: H - 4, class: 'today' }));
    svg.appendChild(sv('text', { x: tx + 4, y: top - 22, class: 'today-txt' }, '오늘 ' + t.slice(5)));
    return svg;
  }
  function listFilter(list, status, body) {
    return list.filter(function (x) {
      if (body !== 'all' && x.rec.body !== body) return false;
      if (status === 'attention') return x.st.level >= 3;
      if (status === 'progress') return x.st.code === 'active' || x.st.code === 'soon';
      if (status === 'running') return x.st.code !== 'inactive';
      return status === 'all' || x.st.code === status;
    });
  }
  function filterBar(stKey, bodyKey, extra) {
    var stSel = h('select', { 'aria-label': '상태' }, [['all', '전체'], ['running', '운영 중만'], ['attention', '살펴볼 것(만료·지연·임박·배포)'], ['progress', '준비 시작·예정']].concat(L.STATUS_ORDER.map(function (c) { return [c, L.statusLabel(c)]; })).map(function (o) {
      var op = h('option', { value: o[0] }, o[1]); if (o[0] === ui[stKey]) op.selected = true; return op;
    }));
    stSel.addEventListener('change', function () { ui[stKey] = stSel.value; render(); });
    var bSel = h('select', { 'aria-label': '인증기관' }, [['all', '전체 기관']].concat(bodies().map(function (b) { return [b, b]; })).map(function (o) {
      var op = h('option', { value: o[0] }, o[1]); if (o[0] === ui[bodyKey]) op.selected = true; return op;
    }));
    bSel.addEventListener('change', function () { ui[bodyKey] = bSel.value; render(); });
    return h('section', { class: 'card filters no-print' }, fld('상태', stSel), fld('인증기관', bSel), extra || null);
  }
  function pageGantt() {
    if (!db.records.length) return [pageHead('②', '갱신 타임라인', ''), emptyNotice()];
    var t = today(), win = L.ganttWindow(t, ui.gMonths, 60);
    var list = listFilter(evaluated(), ui.gStatus, ui.gBody).filter(function (x) { return x.st.plan; });
    list.sort(function (a, b) { return a.st.plan.prepStart < b.st.plan.prepStart ? -1 : 1; });
    var shown = list.filter(function (x) { return L.overlaps(x.st.plan.prepStart, x.rec.expires, win.from, win.to); });
    var mSel = h('select', { 'aria-label': '보는 기간' }, [[6, '6개월'], [12, '12개월'], [18, '18개월'], [24, '24개월']].map(function (o) { var op = h('option', { value: String(o[0]) }, '앞으로 ' + o[1]); if (o[0] === ui.gMonths) op.selected = true; return op; }));
    mSel.addEventListener('change', function () { ui.gMonths = Number(mSel.value); render(); });
    var Sx = settings();
    return [
      pageHead('②', '갱신 타임라인', '인증마다 만료일에서 거꾸로 센 준비 → 기관 심사 → 피드백 대응 → 발급 처리 → 여유를 막대로 봅니다. 마름모는 만료일, 빨간 선은 오늘입니다.'),
      filterBar('gStatus', 'gBody', fld('보는 기간', mSel)),
      h('section', { class: 'card' },
        h('div', { class: 'legend', style: 'margin-bottom:8px' }, PH_LEG.map(function (p) { return h('span', { class: 'lg' }, h('i', { class: p[0] }), p[1]); }),
          h('span', { class: 'lg' }, h('i', { class: 'exp-sw' }), '만료일'), h('span', { class: 'lg' }, h('i', { class: 'today-sw' }), '오늘')),
        shown.length ? h('div', { class: 'gantt-wrap' }, ganttSvg(shown, win, t)) : h('p', { class: 'note' }, '이 기간·조건에 보이는 갱신 일정이 없습니다.'),
        list.length > shown.length ? h('p', { class: 'note' }, '기간 밖 ' + (list.length - shown.length) + '건은 숨겼습니다(보는 기간을 늘려 주세요).') : null),
      h('section', { class: 'card' }, h('h2', null, '일정 표'),
        table(['상태', '인증', '리드타임', '준비 시작', '신청 기한', '피드백 시작', '발급 목표', '만료일'], list.map(function (x) {
          var p = x.st.plan;
          return { cls: lvCls(x.st.level), cells: [stPill(x.st), h('span', null, L.certTitle(x.rec), h('span', { class: 'sub' }, L.stageLabel(x.rec.stage))),
            h('span', null, p.lead + '일', h('span', { class: 'sub' }, p.rule + (p.extra ? ' · 기관 +' + p.extra + '일' : '') + (p.custom ? ' · 대장 값' : ''))),
            p.prepStart, p.applyDate, p.feedbackStart, p.targetIssue, h('span', null, x.rec.expires, h('span', { class: 'sub' }, L.dLabel(x.st.daysLeft)))], tdCls: [0, 0, 0, 'date', 'date', 'date', 'date', 'date'] };
        }), { num: [0, 0, 1, 0, 0, 0, 0, 0] }),
        h('p', { class: 'note' }, '리드타임은 설정의 인증 종류별 값(준비·기관 심사·피드백·발급·여유)입니다. 관리대장에 「갱신 리드타임(일)」이 있으면 그 값에 맞춥니다. 지금 기본값: ' +
          Sx.kinds.map(function (k) { return k.name + ' ' + (k.prep + k.review + k.feedback + k.issue + k.buffer) + '일'; }).join(' · ')))
    ];
  }

  /* ── ③ 관리대장 ─────────────────────────── */
  var EDIT_FIELDS = ['body', 'kind', 'product', 'model', 'certNo', 'issued', 'expires', 'stage', 'applied', 'leadDays', 'owner', 'person', 'distributed', 'state', 'stopReason', 'stopDate', 'note'];
  function editCard() {
    var rec = ui.editId ? recById(ui.editId) : null;
    var inp = {};
    EDIT_FIELDS.forEach(function (f) {
      var v = rec ? rec[f] : '';
      if (f === 'stage') {
        inp[f] = h('select', null, L.STAGES.map(function (s) { var o = h('option', { value: s.id }, s.label); if (rec && rec.stage === s.id) o.selected = true; return o; }));
      } else if (f === 'state') {
        inp[f] = h('select', null, L.STATES.map(function (s) { var o = h('option', { value: s.id }, s.label); if ((rec ? rec.state || 'active' : 'active') === s.id) o.selected = true; return o; }));
      } else if (['issued', 'expires', 'applied', 'distributed', 'stopDate'].indexOf(f) >= 0) inp[f] = h('input', { type: 'date', value: v || '' });
      else if (f === 'leadDays') inp[f] = h('input', { type: 'number', min: 1, step: 1, value: v || '', placeholder: '비우면 설정값' });
      else inp[f] = h('input', { value: v == null ? '' : v });
    });
    function saveRec() {
      var o = {}; EDIT_FIELDS.forEach(function (f) { o[f] = (inp[f].value || '').trim(); });
      if (!o.body || !o.kind || !o.expires) { toast('인증기관·인증 종류·만료일은 꼭 적어 주세요.', true); return; }
      o.leadDays = o.leadDays ? Math.round(Number(o.leadDays)) || null : null;
      if (o.state === 'active') { o.stopReason = ''; o.stopDate = ''; } else if (!o.stopDate) o.stopDate = today();
      if (rec) { Object.keys(o).forEach(function (k) { rec[k] = o[k]; }); rec.key = L.recordKey(rec); }
      else { o.history = []; o.pdf = null; o.key = L.recordKey(o); o.id = 'c' + Date.now().toString(36); db.records.push(o); }
      ui.editId = ''; save(); toast(rec ? '고쳤습니다.' : '추가했습니다.'); render();
    }
    return h('details', { class: 'card', open: !!rec || null, id: 'editCard' },
      h('summary', null, rec ? '인증 고치기 — ' + L.certTitle(rec) : '인증 한 건 직접 추가'),
      h('div', { class: 'form-grid', style: 'margin-top:10px' }, EDIT_FIELDS.map(function (f) { return fld(L.FIELD_BY_ID[f].label + (L.FIELD_BY_ID[f].req ? ' *' : ''), inp[f]); })),
      h('div', { class: 'btn-row', style: 'margin-top:12px' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: saveRec }, rec ? '고친 내용 저장' : '추가'),
        rec ? h('button', { type: 'button', class: 'btn', onclick: function () { ui.editId = ''; render(); } }, '그만두기') : null));
  }
  function renewCard() {
    var rec = recById(ui.renewId); if (!rec) return null;
    var no = h('input', { value: '', placeholder: '새 인증서 번호' }), is = h('input', { type: 'date', value: today() }), ex = h('input', { type: 'date', value: L.addYears(rec.expires, 5) });
    return h('section', { class: 'card', id: 'renewCard' }, h('h2', null, '다음 주기로 넘기기 — ' + L.certTitle(rec)),
      h('p', { class: 'note' }, '새 인증서의 번호·발급일·만료일을 적으면, 이전 번호·날짜(' + (rec.certNo || '-') + ' · ' + rec.expires + ')는 이력에 남기고 진행 단계를 「미착수」로 되돌립니다. 이전/신규 인증서의 내용 비교는 ⑥ 화면에서 해 주세요.'),
      h('div', { class: 'form-grid' }, fld('새 인증서 번호', no), fld('발급일', is), fld('새 만료일 *', ex)),
      h('div', { class: 'btn-row', style: 'margin-top:12px' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
          try {
            var n = L.renewRecord(rec, { certNo: no.value, issued: is.value, expires: ex.value }, today());
            db.records[db.records.indexOf(rec)] = n; ui.renewId = ''; save(); toast('다음 주기로 넘겼습니다. 이력 ' + n.history.length + '건.'); render();
          } catch (e) { toast(e.message, true); }
        } }, '넘기기'),
        h('button', { type: 'button', class: 'btn', onclick: function () { ui.renewId = ''; render(); } }, '그만두기')));
  }
  function pageLedger() {
    var head = pageHead('③', '관리대장', '진행 단계·신청일·배포일을 여기서 바꾸면 상태 신호와 알림이 바로 따라 바뀝니다.',
      db.records.length ? h('div', { class: 'btn-row no-print' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: exportLedger }, '엑셀로 내려받기(계획 날짜 포함)')) : null);
    if (!db.records.length) return [head, editCard(), emptyNotice()];
    var list = listFilter(evaluated(), ui.lStatus, ui.lBody);
    if (ui.lSort === 'model') list.sort(function (a, b) { var ka = L.modelKey(a.rec.model) || '\uffff', kb = L.modelKey(b.rec.model) || '\uffff'; return ka < kb ? -1 : ka > kb ? 1 : b.st.level - a.st.level; });
    else list.sort(function (a, b) { return b.st.level - a.st.level || (a.rec.expires < b.rec.expires ? -1 : 1); });
    var sortSel = h('select', { 'aria-label': '줄 순서' }, [['status', '상태 순'], ['model', '모델-형식 순']].map(function (o) { var op = h('option', { value: o[0] }, o[1]); if ((ui.lSort || 'status') === o[0]) op.selected = true; return op; }));
    sortSel.addEventListener('change', function () { ui.lSort = sortSel.value; render(); });
    var rows = list.map(function (x) {
      var r = x.rec, run = L.isRunning(r);
      var stage = h('select', { 'aria-label': '진행 단계', disabled: !run || null, title: run ? null : '운영 중이 아닌 인증은 진행 단계를 바꾸지 않습니다' }, L.STAGES.map(function (s) { var o = h('option', { value: s.id }, s.label); if (r.stage === s.id) o.selected = true; return o; }));
      stage.addEventListener('change', function () { r.stage = stage.value; if (r.stage === 'apply' && !r.applied) r.applied = today(); save(); render(); });
      var applied = h('input', { type: 'date', value: r.applied || '', 'aria-label': '신청일' });
      applied.addEventListener('change', function () { r.applied = applied.value; save(); render(); });
      var dist = h('input', { type: 'date', value: r.distributed || '', 'aria-label': '배포일', disabled: r.stage !== 'done' || null, title: r.stage !== 'done' ? '진행 단계가 「발급 완료」일 때 적습니다' : null });
      dist.addEventListener('change', function () { r.distributed = dist.value; save(); render(); });
      return { cls: lvCls(x.st.level), cells: [
        h('span', null, stPill(x.st), h('span', { class: 'sub' }, x.st.msg)),
        h('span', null, L.certTitle(r), h('span', { class: 'sub' }, (r.certNo || '번호 없음') + (L.modelKey(r.model) ? ' · 묶음 ' + L.modelKey(r.model) : '') + (r.history && r.history.length ? ' · 이력 ' + r.history.length + '건' : '') + (r.note ? ' · ' + r.note : ''))),
        h('span', null, r.expires, h('span', { class: 'sub' }, L.dLabel(x.st.daysLeft))),
        stage, applied, dist, h('span', null, r.owner || '-', h('span', { class: 'sub' }, r.person || '')),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { ui.editId = r.id; render(); var e = document.getElementById('editCard'); if (e) e.scrollIntoView(); } }, '고치기'),
          r.stage === 'done' && run ? h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { ui.renewId = r.id; render(); window.scrollTo(0, 0); } }, '다음 주기로') : null,
          h('a', { class: 'btn btn-sm', href: '#/models?g=' + encodeURIComponent(L.modelKey(r.model)) }, '이력'),
          pdfControls(r, true),
          h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: function () { removeRecord(r); } }, '지우기'))
      ], tdCls: [0, 0, 'date', 0, 0, 0, 0, 0] };
    });
    return [head, ui.renewId ? renewCard() : null, filterBar('lStatus', 'lBody', fld('줄 순서', sortSel)),
      h('section', { class: 'card' }, h('h2', null, '인증 ' + list.length + '건' + (list.length < db.records.length ? ' / 전체 ' + db.records.length + '건' : '')),
        table(['상태', '인증', '만료일', '진행 단계', '신청일', '배포일', '주관·담당', ''], rows)),
      editCard()];
  }
  function exportLedger() {
    var Sx = settings(), t = today(), wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([L.LEDGER_HEAD].concat(L.ledgerRows(db.records, Sx, t))), '관리대장(' + t + ')');
    // 이력 시트 — 이 파일을 그대로 다시 가져와도 같은 인증에 이력으로 붙습니다
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([L.HISTORY_HEAD].concat(L.historyRows(db.records))), '인증 이력');
    XLSX.writeFile(wb, '인증_관리대장_' + t + '.xlsx');
  }

  /* ── 인증서 PDF (2차) ───────────────────── */
  function removeRecord(r) {
    var n = pdfIdsOf(r).length;
    if (!confirm(L.certTitle(r) + ' 을(를) 지울까요? 이력 ' + (r.history || []).length + '줄' + (n ? '과 붙인 PDF ' + n + '장' : '') + '도 함께 지워집니다.')) return;
    P.del(pdfIdsOf(r));
    db.records.splice(db.records.indexOf(r), 1); save(); render();
  }
  function pdfPick(label, cls, onFile) {
    var fi = h('input', { type: 'file', accept: '.pdf,application/pdf', 'aria-label': label });
    fi.addEventListener('change', function () { var f = fi.files[0]; fi.value = ''; if (f) onFile(f); });
    return h('label', { class: 'btn btn-sm' + (cls ? ' ' + cls : '') }, label, fi);
  }
  /* target: 인증(record) 또는 이력 한 줄 — target.pdf = { id, name, size, at } */
  function pdfControls(target, compact) {
    function setFile(f) {
      P.addFile(f, today()).then(function (meta) {
        var old = target.pdf; target.pdf = meta;
        if (!save()) toast('PDF 는 저장했지만 관리대장을 이 브라우저에 저장하지 못했습니다 — JSON 백업을 받아 두세요.', true);
        else toast('PDF 를 붙였습니다 — ' + meta.name + ' (' + P.fmt(meta.size) + ')' + (P.available() ? '' : ' · 이 창을 닫으면 사라집니다(브라우저 저장소를 쓸 수 없음)'));
        if (old && old.id !== meta.id) P.del([old.id]);
        render();
      }, function (e) { toast(e.message, true); });
    }
    if (!target.pdf) return pdfPick(compact ? 'PDF 붙이기' : '인증서 PDF 붙이기', '', setFile);
    var p = target.pdf;
    return h('span', { class: 'pdf-ctl' },
      h('button', { type: 'button', class: 'btn btn-sm btn-pdf', title: p.name + ' · ' + P.fmt(p.size), onclick: function () { showPdf(p); } }, compact ? 'PDF 보기' : 'PDF 보기 · ' + P.fmt(p.size)),
      compact ? null : pdfPick('바꾸기', '', setFile),
      compact ? null : h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: function () {
        if (!confirm(p.name + ' 을(를) 뺄까요?')) return;
        P.del([p.id]); target.pdf = null; save(); render();
      } }, 'PDF 빼기'));
  }
  var viewerUrl = '';
  function closePdf() {
    var v = document.getElementById('pdfViewer'); if (v) v.remove();
    if (viewerUrl) { URL.revokeObjectURL(viewerUrl); viewerUrl = ''; }
  }
  /* 화면 안 보기 + 새 탭으로 열기(blob 주소) */
  function showPdf(meta) {
    P.url(meta.id).then(function (u) {
      closePdf(); viewerUrl = u;
      var box = h('div', { class: 'pdf-viewer', id: 'pdfViewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': meta.name },
        h('div', { class: 'pdf-panel' },
          h('div', { class: 'pdf-bar' },
            h('strong', { class: 'pdf-name' }, meta.name), h('span', { class: 'note' }, P.fmt(meta.size) + (meta.at ? ' · 붙인 날 ' + meta.at : '')),
            h('div', { class: 'btn-row' },
              h('a', { class: 'btn btn-sm btn-primary', href: u, target: '_blank', rel: 'noopener', id: 'pdfNewTab' }, '새 탭에서 열기'),
              h('a', { class: 'btn btn-sm', href: u, download: meta.name }, '내려받기'),
              h('button', { type: 'button', class: 'btn btn-sm', onclick: closePdf }, '닫기'))),
          h('iframe', { class: 'pdf-frame', src: u, title: meta.name })));
      box.addEventListener('click', function (e) { if (e.target === box) closePdf(); });
      document.body.appendChild(box);
      var nt = document.getElementById('pdfNewTab'); if (nt) nt.focus();
    }, function (e) { toast(e.message, true); });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePdf(); });

  /* ── ③-2 모델별 이력 (2차) ───────────────── */
  function statePill(state, current) {
    return h('span', { class: 'st st-state-' + (state || 'active') }, (current ? '지금 · ' : '') + L.stateLabel(state || 'active'));
  }
  function histForm(g) {
    var recSel = h('select', { 'aria-label': '이력을 붙일 인증' }, g.records.map(function (r) { return h('option', { value: r.id }, '[' + r.body + '] ' + r.kind + (r.certNo ? ' · 지금 ' + r.certNo : '') + (L.isRunning(r) ? '' : ' (' + L.stateLabel(r.state) + ')')); }));
    var no = h('input', { placeholder: '지난 인증서 번호', 'aria-label': '지난 인증서 번호' }), is = h('input', { type: 'date', 'aria-label': '발급일' }), ex = h('input', { type: 'date', 'aria-label': '만료일' });
    var stSel = h('select', { 'aria-label': '이력 상태' }, L.HIST_STATES.filter(function (x) { return x.id !== 'active'; }).map(function (x) { return h('option', { value: x.id }, x.label); }));
    var reason = h('input', { placeholder: '예: 고객 요구 없음 · 모델 단종', 'aria-label': '사유' }), sd = h('input', { type: 'date', 'aria-label': '중지일' }), note = h('input', { 'aria-label': '비고' });
    var file = h('input', { type: 'file', accept: '.pdf,application/pdf', 'aria-label': '이력 인증서 PDF' });
    function go() {
      var rec = recById(recSel.value); if (!rec) return;
      var n;
      try { n = L.addHistory(rec, { certNo: no.value, issued: is.value, expires: ex.value, state: stSel.value, reason: reason.value, stopDate: sd.value, note: note.value, src: 'manual' }); }
      catch (e) { toast(e.message, true); return; }
      var added = n.history.filter(function (x) { return !(rec.history || []).some(function (y) { return y.id === x.id; }); })[0];
      function done(meta) {
        if (meta && added) added.pdf = meta;
        db.records[db.records.indexOf(rec)] = n; ui.histFor = ''; save(); toast('지난 인증서 이력을 더했습니다 — ' + g.label + ' 이력 ' + (g.histCount + 1) + '줄.'); render();
      }
      var f = file.files[0];
      if (f) P.addFile(f, today()).then(done, function (e) { toast(e.message + ' (이력은 PDF 없이 더하지 않았습니다)', true); });
      else done(null);
    }
    return h('div', { class: 'block hist-form' },
      h('h3', null, '과거 이력 추가 — ' + g.label),
      h('p', { class: 'note' }, '지난 인증서 한 장을 한 줄로 적습니다. 「갱신됨」은 다음 인증서로 이어진 것, 「중지」 「만료 종료」 「폐기」는 그때 멈춘 것입니다. 여러 줄을 한꺼번에 넣을 때는 「인증 이력」 시트로 가져오기를 써 주세요.'),
      h('div', { class: 'form-grid' }, fld('붙일 인증', recSel), fld('인증서 번호', no), fld('발급일', is), fld('만료일', ex), fld('이력 상태', stSel), fld('사유(중지·종료일 때)', reason), fld('중지일', sd), fld('비고', note), fld('인증서 PDF(선택)', file, '한 장 ' + P.fmt(P.MAX_BYTES) + ' 까지')),
      h('div', { class: 'btn-row', style: 'margin-top:10px' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: go }, '이력 더하기'),
        h('button', { type: 'button', class: 'btn', onclick: function () { ui.histFor = ''; render(); } }, '그만두기')));
  }
  function stateForm(r) {
    var stSel = h('select', { 'aria-label': '운영 상태' }, L.STATES.map(function (x) { var o = h('option', { value: x.id }, x.label); if ((r.state || 'active') === x.id) o.selected = true; return o; }));
    var reason = h('input', { value: r.stopReason || '', placeholder: '예: 고객 요구 없음 · 모델 단종 · 수출 지역 변경', 'aria-label': '중지 사유' });
    var sd = h('input', { type: 'date', value: r.stopDate || today(), 'aria-label': '중지일' });
    return h('div', { class: 'block hist-form' },
      h('h3', null, '운영 상태 바꾸기 — ' + L.certTitle(r)),
      h('p', { class: 'note' }, '중지 · 만료 종료 · 폐기로 두면 갱신 알림·타임라인·대시보드에서 빠지고, 이 화면과 관리대장(「중지·종료」 거르기)에는 남습니다. 다시 「운영 중」으로 두면 알림이 돌아옵니다.'),
      h('div', { class: 'form-grid' }, fld('운영 상태', stSel), fld('사유', reason), fld('중지일(비우면 기준일)', sd)),
      h('div', { class: 'btn-row', style: 'margin-top:10px' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
          var n = L.setState(r, stSel.value, reason.value, sd.value, today());
          db.records[db.records.indexOf(r)] = n; ui.stateId = ''; save(); toast(L.certTitle(r) + ' — ' + L.stateLabel(n.state) + '(으)로 두었습니다.'); render();
        } }, '저장'),
        h('button', { type: 'button', class: 'btn', onclick: function () { ui.stateId = ''; render(); } }, '그만두기')));
  }
  function groupCard(g, open) {
    var head = h('summary', null,
      h('span', { class: 'g-title' }, g.label),
      g.key ? h('span', { class: 'g-key', title: '묶음 키 — 띄어쓰기·대소문자·하이픈을 지운 모델-형식' }, g.key) : null,
      h('span', { class: 'g-count' }, '운영 중 ' + g.running + (g.stopped ? ' · 중지·종료 ' + g.stopped : '') + ' · 이력 ' + g.histCount + (g.pdfs ? ' · PDF ' + g.pdfs : '')),
      g.worst ? stPill(g.worst) : statePill('stopped'));
    var recRows = g.evaluated.map(function (x) {
      var r = x.rec;
      return { cls: L.isRunning(r) ? lvCls(x.st.level) : 'inactive', cells: [
        h('span', null, stPill(x.st), h('span', { class: 'sub' }, x.st.msg)),
        h('span', null, '[' + r.body + '] ' + r.kind, h('span', { class: 'sub' }, (r.product || '') + (r.model ? ' · ' + r.model : ''))),
        h('span', null, r.certNo || '-', h('span', { class: 'sub' }, (r.issued || '?') + ' ~ ' + r.expires)),
        pdfControls(r, false),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { ui.stateId = r.id; ui.histFor = ''; render(); } }, L.isRunning(r) ? '중지·종료로' : '운영 상태'),
          h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { ui.editId = r.id; location.hash = '#/ledger'; } }, '고치기'))
      ], tdCls: [0, 0, 'date', 0, 0] };
    });
    var tl = h('ol', { class: 'timeline' }, g.entries.map(function (e) {
      var r = e.rec;
      return h('li', { class: 'tl-item' + (e.current ? ' current' : '') + (e.state !== 'active' && e.state !== 'renewed' ? ' stopped' : '') },
        h('div', { class: 'tl-date' }, (e.issued || '발급일 ?') + ' ~ ' + (e.expires || '?')),
        h('div', { class: 'tl-body' },
          h('div', { class: 'tl-line' }, statePill(e.state, e.current), h('strong', null, e.certNo || '(번호 없음)'), h('span', { class: 'note' }, '[' + r.body + '] ' + r.kind)),
          (e.reason || e.stopDate) ? h('div', { class: 'note' }, (e.stopDate ? '중지일 ' + e.stopDate : '') + (e.reason ? (e.stopDate ? ' · ' : '') + '사유: ' + e.reason : '')) : null,
          e.note ? h('div', { class: 'note' }, e.note) : null,
          h('div', { class: 'btn-row tl-actions' }, pdfControls(e.current ? r : e.hist, false),
            e.current ? null : h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: function () {
              if (!confirm((e.certNo || '이 줄') + ' 이력을 지울까요?' + (e.pdf ? ' 붙인 PDF 도 지워집니다.' : ''))) return;
              if (e.pdf) P.del([e.pdf.id]);
              r.history = (r.history || []).filter(function (x) { return x !== e.hist; }); save(); render();
            } }, '이력 지우기'))));
    }));
    var forms = [];
    g.records.forEach(function (r) { if (ui.stateId === r.id) forms.push(stateForm(r)); });
    if (ui.histFor === g.key) forms.push(histForm(g));
    var d = h('details', { class: 'card group', open: open || forms.length ? true : null, 'data-key': g.key, id: 'g-' + (g.key || 'none') },
      head,
      g.names.length > 1 ? h('p', { class: 'note' }, '같은 묶음으로 본 표기: ' + g.names.join(' · ')) : null,
      table(['상태', '인증(기관·종류)', '지금 인증서', '인증서 PDF', ''], recRows),
      forms,
      h('h3', null, '인증서 이력 (' + g.entries.length + '장, 최근 것이 위)'),
      tl,
      h('div', { class: 'btn-row', style: 'margin-top:8px' },
        ui.histFor === g.key ? null : h('button', { type: 'button', class: 'btn', onclick: function () { ui.histFor = g.key; ui.stateId = ''; render(); } }, '과거 이력 추가')));
    d.addEventListener('toggle', function () { ui.open[g.key] = d.open; });
    return d;
  }
  function pageModels() {
    if (!db.records.length) return [pageHead('③-2', '모델별 이력', ''), emptyNotice()];
    var t = today(), groups = L.groupByModel(db.records, settings(), t);
    var q = L.norm(ui.mQuery), qk = L.modelKey(ui.mQuery);
    var focus = (location.hash.split('?g=')[1] || '');
    if (focus) { focus = decodeURIComponent(focus); ui.open[focus] = true; }
    var shown = groups.filter(function (g) {
      if (ui.mState === 'stopped' && !g.stopped) return false;
      if (ui.mState === 'running' && !g.running) return false;
      if (ui.mState === 'history' && !g.histCount) return false;
      if (!q) return true;
      if (qk && g.key.indexOf(qk) >= 0) return true;
      return g.entries.some(function (e) { return L.norm(e.certNo + ' ' + e.rec.body + ' ' + e.rec.kind + ' ' + e.rec.product).indexOf(q) >= 0; });
    });
    var stSel = h('select', { 'aria-label': '보기' }, [['all', '모든 묶음'], ['running', '운영 중 인증이 있는 묶음'], ['stopped', '중지·종료가 있는 묶음'], ['history', '지난 이력이 있는 묶음']].map(function (o) { var op = h('option', { value: o[0] }, o[1]); if (ui.mState === o[0]) op.selected = true; return op; }));
    stSel.addEventListener('change', function () { ui.mState = stSel.value; render(); });
    var qi = h('input', { type: 'search', value: ui.mQuery, placeholder: '모델-형식 · 기관 · 인증서 번호', 'aria-label': '찾기' });
    qi.addEventListener('change', function () { ui.mQuery = qi.value; render(); });
    var nRun = db.records.filter(L.isRunning).length, nHist = 0, nPdf = 0;
    groups.forEach(function (g) { nHist += g.histCount; nPdf += g.pdfs; });
    var noKey = groups.filter(function (g) { return !g.key; })[0];
    var defOpen = shown.length <= 12;
    return [
      pageHead('③-2', '모델별 이력', '관리대장의 「모델-형식」을 묶음 키로, 같은 모델의 인증(기관·종류별)과 지난 인증서를 한곳에 봅니다. 띄어쓰기·대소문자·하이픈 모양이 달라도 같은 모델로 묶습니다.'),
      h('div', { class: 'tiles status-tiles' },
        tile('모델-형식 묶음', groups.filter(function (g) { return g.key; }).length + '개', noKey ? '모델-형식 없는 인증 ' + noKey.records.length + '건 따로' : ''),
        tile('운영 중 인증', nRun + '건', '갱신 알림 대상'),
        tile('중지·종료', (db.records.length - nRun) + '건', '알림에서 빠짐 · 이력에 남음'),
        tile('지난 인증서 이력', nHist + '줄', ''),
        tile('인증서 PDF', nPdf + '장', P.available() ? '이 브라우저에 저장' : '이 창에만(저장소를 쓸 수 없음)')),
      h('section', { class: 'card filters no-print' }, fld('보기', stSel), fld('찾기', qi)),
      shown.length ? shown.map(function (g) { return groupCard(g, ui.open[g.key] != null ? ui.open[g.key] : defOpen); }) : h('p', { class: 'card note' }, '조건에 맞는 묶음이 없습니다.'),
      h('section', { class: 'card' }, h('h2', null, '이렇게 묶습니다'),
        h('ul', { class: 'note' },
          h('li', null, '묶음 키 = 모델-형식에서 띄어쓰기·하이픈·밑줄·가운뎃점을 지우고 대문자로 바꾼 글자입니다. 「HC-100 계열」 「hc100계열」 「HC–100 계열」은 모두 HC100계열 입니다. 빈칸·「-」는 묶지 않고 「모델·형식 미기재」에 모읍니다.'),
          h('li', null, '한 묶음 안에서 인증은 기관·종류별로 한 줄(지금의 인증서)이고, 지난 인증서는 그 인증의 이력입니다. 「다음 주기로」로 넘기면 지금 인증서와 그 PDF 가 이력으로 내려갑니다.'),
          h('li', null, 'PDF 는 서버로 보내지 않고 이 브라우저(IndexedDB)에만 둡니다. 한 장 ' + P.fmt(P.MAX_BYTES) + ' 까지. 다른 PC 로 옮길 때는 설정의 「JSON 백업(PDF 포함)」을 써 주세요.')))
    ];
  }

  /* ── ④ 알림 ─────────────────────────────── */
  function deptName(id) { var d = settings().depts.filter(function (x) { return x.id === id; })[0]; return d ? d.name : id; }
  function pageAlert() {
    if (!db.records.length) return [pageHead('④', '알림', ''), emptyNotice()];
    var Sx = settings(), t = today(), al = L.alerts(db.records, Sx, t), drafts = L.mailDrafts(al, Sx, t);
    var upcoming = [];
    db.records.forEach(function (r) {
      L.pendingEvents(r, Sx, t).forEach(function (e) { if (e.key !== 'distribute' && e.date > L.addDays(t, Sx.lookahead) && e.date <= L.addDays(t, 90)) upcoming.push({ rec: r, e: e }); });
    });
    upcoming.sort(function (a, b) { return a.e.date < b.e.date ? -1 : 1; });
    var noMail = Sx.depts.filter(function (d) { return !d.email; }).map(function (d) { return d.name; });
    return [
      pageHead('④', '알림 — 오늘 연락할 사람', '아직 끝나지 않은 일 가운데 오늘부터 ' + Sx.lookahead + '일 안(지난 것 포함)에 날짜가 온 일을 인증마다 하나씩 모아, 부서별 메일 초안을 만듭니다.'),
      h('section', { class: 'card' }, h('h2', null, '오늘 연락할 것 (' + al.length + '건)'),
        al.length ? table(['상태', '인증', '할 일', '날짜', '받을 부서'], al.map(function (a) {
          return { cls: lvCls(a.status.level), cells: [stPill(a.status), h('span', null, L.certTitle(a.rec), h('span', { class: 'sub' }, '만료 ' + a.rec.expires + ' · ' + L.stageLabel(a.rec.stage))), a.label, h('span', null, a.date, h('span', { class: 'sub' }, L.whenText(a.days))), a.depts.map(deptName).join(' · ')], tdCls: [0, 0, 0, 'date', 0] };
        })) : h('p', { class: 'note' }, '오늘 연락할 일이 없습니다.')),
      drafts.length ? h('section', { class: 'card' }, h('h2', null, '부서별 메일 초안'),
        noMail.length ? h('p', { class: 'alert info' }, '받는 메일 주소가 비어 있는 부서: ' + noMail.join(', ') + ' — ', h('a', { href: '#/settings' }, '설정'), '에서 부서 메일(공용 주소 권장)을 적으면 「메일 앱으로 열기」에 받는 사람이 들어갑니다.') : null,
        h('div', { class: 'mail-list' }, drafts.map(function (d) {
          var ta = h('textarea', { readonly: true, 'aria-label': d.dept.name + ' 메일 본문' }); ta.value = d.body;
          return h('div', { class: 'mail' },
            h('h3', null, d.dept.name, h('span', { class: 'note' }, d.items.length + '건')),
            h('p', { class: 'to' }, '받는 사람: ' + (d.dept.email || '(비어 있음)')),
            h('p', null, h('strong', null, d.subject)),
            ta,
            h('div', { class: 'btn-row', style: 'margin-top:8px' },
              h('a', { class: 'btn btn-primary', href: d.mailto }, '메일 앱으로 열기'),
              h('button', { type: 'button', class: 'btn', onclick: function () { copyText(d.subject, '제목을 복사했습니다.'); } }, '제목 복사'),
              h('button', { type: 'button', class: 'btn', onclick: function () { copyText(d.body, '본문을 복사했습니다.'); } }, '본문 복사')),
            d.cut ? h('p', { class: 'note' }, '본문이 길어 「메일 앱으로 열기」에는 앞부분만 들어갑니다. 「본문 복사」로 붙여 넣어 주세요.') : null);
        })),
        h('p', { class: 'note' }, '1단계는 초안까지입니다. 메일은 직접 열어 확인한 뒤 보내 주세요. 정해진 날 자동 발송(Make·Power Automate)은 회사 메일 정책을 확인한 뒤 2단계에서 붙입니다(기획서 8장).')) : null,
      h('section', { class: 'card' }, h('h2', null, '다가오는 일 (' + Sx.lookahead + '일 뒤 ~ 90일)'),
        upcoming.length ? table(['날짜', '할 일', '인증', '받을 부서'], upcoming.map(function (u) {
          return [h('span', null, u.e.date, h('span', { class: 'sub' }, L.whenText(L.daysBetween(t, u.e.date)))), L.EVENTS[u.e.key], L.certTitle(u.rec), Sx.rules[u.e.key].map(deptName).join(' · ')];
        })) : h('p', { class: 'note' }, '90일 안에 다가오는 일이 없습니다.'),
        h('p', { class: 'note' }, '알림 시점: 준비 시작 ' + Sx.noticeDays + '일 전 안내 · 준비 시작일 · 신청 기한 · 피드백 마감 · 만료 ' + Sx.urgentDays + '일 전 · 만료일 · 발급 완료 뒤 배포. 받는 부서는 설정에서 바꿀 수 있습니다.'))
    ];
  }

  /* ── ⑤ 업무흐름 · R/R ───────────────────── */
  function flowSvg(flow) {
    var g = L.flowLayout(flow), ext = /기관|외부|고객/;
    var svg = sv('svg', { viewBox: '0 0 ' + g.width + ' ' + g.height, width: g.width, height: g.height, class: 'flow', role: 'img', 'aria-label': '인증 갱신 업무흐름도(부서별 줄)' });
    var defs = sv('defs'), mk = sv('marker', { id: 'arrowHead', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    mk.appendChild(sv('path', { d: 'M0 0L10 5L0 10z', class: 'head' })); defs.appendChild(mk); svg.appendChild(defs);
    g.lanes.forEach(function (ln, i) {
      svg.appendChild(sv('rect', { x: 0, y: ln.y, width: g.width, height: ln.h, class: 'lane' + (i % 2 ? ' alt' : '') }));
      svg.appendChild(sv('text', { x: 12, y: ln.y + ln.h / 2 + 5, class: 'lane-name' }, ln.name));
    });
    g.boxes.forEach(function (b) { svg.appendChild(sv('text', { x: b.x, y: 20, class: 'col-t' }, 'D+' + b.from + '~' + b.to)); });
    g.arrows.forEach(function (a) { svg.appendChild(sv('path', { d: a.d, class: 'arrow', 'marker-end': 'url(#arrowHead)' })); });
    g.boxes.forEach(function (b) {
      var warn = b.noR || b.a.length !== 1;
      svg.appendChild(sv('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 8, class: 'box' + (ext.test(flow.lanes[b.lane]) ? ' ext' : '') + (warn ? ' warn' : '') }));
      svg.appendChild(sv('text', { x: b.x + 8, y: b.y + 16, class: 'box-no' }, (b.i + 1) + '단계'));
      b.lines.forEach(function (ln, j) { svg.appendChild(sv('text', { x: b.x + 8, y: b.y + 34 + j * 16, class: 'box-t' }, ln)); });
      svg.appendChild(sv('text', { x: b.x + 8, y: b.y + b.h - 8, class: 'box-d' }, b.days + '일 · A ' + (b.a.join('·') || '없음')));
    });
    return { svg: svg, g: g };
  }
  function roleCls(v) { return v === 'R/A' ? 'ra' : (v || '').toLowerCase(); }
  function pageFlow() {
    var flow = L.cleanFlow(db.flow), warns = L.checkFlow(flow), Sx = settings();
    function commitFlow() { db.flow = L.cleanFlow(db.flow); save(); render(); }
    var lanesIn = h('input', { value: flow.lanes.join(', ') });
    lanesIn.addEventListener('change', function () {
      var nl = lanesIn.value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!nl.length) { toast('부서를 하나 이상 적어 주세요.', true); return; }
      db.flow = { lanes: nl, steps: flow.steps }; commitFlow();
    });
    var editRows = flow.steps.map(function (s, i) {
      var name = h('input', { value: s.name, 'aria-label': (i + 1) + '단계 이름' }); name.addEventListener('change', function () { db.flow.steps[i].name = name.value; commitFlow(); });
      var days = h('input', { type: 'number', min: 0, step: 1, value: s.days, 'aria-label': (i + 1) + '단계 일수' }); days.addEventListener('change', function () { db.flow.steps[i].days = Number(days.value); commitFlow(); });
      var cells = [i + 1, name, days];
      flow.lanes.forEach(function (ln) {
        var sel = h('select', { 'aria-label': (i + 1) + '단계 ' + ln + ' 역할' }, L.ROLES.map(function (r) { var o = h('option', { value: r }, r || '-'); if ((s.roles[ln] || '') === r) o.selected = true; return o; }));
        sel.addEventListener('change', function () { db.flow.steps[i].roles = db.flow.steps[i].roles || {}; db.flow.steps[i].roles[ln] = sel.value; commitFlow(); });
        cells.push(sel);
      });
      cells.push(h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-sm', disabled: i === 0 || null, 'aria-label': '위로', onclick: function () { var st = db.flow.steps; var x = st[i]; st[i] = st[i - 1]; st[i - 1] = x; commitFlow(); } }, '위'),
        h('button', { type: 'button', class: 'btn btn-sm', disabled: i === flow.steps.length - 1 || null, 'aria-label': '아래로', onclick: function () { var st = db.flow.steps; var x = st[i]; st[i] = st[i + 1]; st[i + 1] = x; commitFlow(); } }, '아래'),
        h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: function () { db.flow.steps.splice(i, 1); commitFlow(); } }, '빼기')));
      return { cells: cells, tdCls: [0, 'name-cell'] };
    });
    db.flow = flow;
    var fs = flowSvg(flow);
    var raciRows = flow.steps.map(function (s, i) {
      return { cells: [(i + 1) + '. ' + s.name, s.days + '일'].concat(flow.lanes.map(function (ln) { return s.roles[ln] || ''; })), tdCls: [0, 0].concat(flow.lanes.map(function (ln) { return s.roles[ln] ? 'role ' + roleCls(s.roles[ln]) : 'role'; })) };
    });
    var ta = Sx.kinds[0], taLead = ta.prep + ta.review + ta.feedback + ta.issue + ta.buffer;
    return [
      pageHead('⑤', '업무흐름 · R/R', '단계표를 고치면 흐름도가 바로 다시 그려집니다. 상자는 R(실행) 부서 줄에 놓이고, 위쪽 D+ 는 착수일부터 센 누적 일수입니다.',
        h('div', { class: 'btn-row no-print' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { download('인증갱신_업무흐름도.svg', new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svgWithStyle(fs.svg)], { type: 'image/svg+xml' })); } }, '흐름도 SVG 내려받기'),
          h('button', { type: 'button', class: 'btn', onclick: function () { window.print(); } }, '인쇄 / PDF'))),
      warns.length ? h('div', { class: 'alert warn' }, h('ul', null, warns.map(function (w) { return h('li', null, w.msg); }))) : null,
      h('section', { class: 'card' }, h('h2', null, '업무흐름도'), h('div', { class: 'flow-wrap' }, fs.svg),
        h('p', { class: 'note' }, '전체 ' + fs.g.total + '일. 설정의 ' + ta.name + ' 리드타임은 ' + taLead + '일입니다' + (Math.abs(fs.g.total - taLead) > 14 ? ' — 두 값이 꽤 다릅니다. 실제 걸린 날을 확인해 어느 쪽이든 맞춰 주세요(기획서 10장 ③).' : '.') + ' 점선 상자는 외부(인증기관) 단계입니다.')),
      h('section', { class: 'card' }, h('h2', null, 'R/R 표 (RACI)'),
        table(['단계', '기간'].concat(flow.lanes), raciRows, { cls: 'raci' }),
        h('p', { class: 'note' }, 'R 실행(Responsible) · A 최종 책임(Accountable, 단계마다 하나) · C 협의(Consulted) · I 통보(Informed). 알림 메일을 받는 부서는 설정의 「알림 받는 부서」에서 따로 정합니다.')),
      h('details', { class: 'card no-print', open: true }, h('summary', null, '단계표 고치기'),
        fld('부서(줄) — 쉼표로', lanesIn, '예: 영업, 품질, 개발, 생산, 인증기관. 이름을 바꾸면 그 줄의 역할은 비워집니다.'),
        h('div', { style: 'margin-top:10px' }, table(['#', '단계', '일수'].concat(flow.lanes).concat(['']), editRows, { cls: 'edit' })),
        h('div', { class: 'btn-row', style: 'margin-top:10px' },
          h('button', { type: 'button', class: 'btn', onclick: function () { db.flow.steps.push({ name: '새 단계', days: 5, roles: {} }); commitFlow(); } }, '단계 더하기'),
          h('button', { type: 'button', class: 'btn', onclick: function () { if (confirm('업무흐름을 기본값으로 되돌릴까요?')) { db.flow = L.defaultFlow(); commitFlow(); } } }, '기본값으로')))
    ];
  }
  function svgWithStyle(svg) {
    var c = svg.cloneNode(true);
    var css = 'text{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif}.lane{fill:#f7f9fc;stroke:#e1e6ee}.lane.alt{fill:#fff}.lane-name{font-size:13px;font-weight:800;fill:#17427e}.box{fill:#fff;stroke:#2f73d9;stroke-width:1.5}.box.ext{stroke:#8a95a5;stroke-dasharray:5 3}.box.warn{stroke:#c0392b;stroke-width:2}.box-no{font-size:11px;font-weight:800;fill:#2f73d9}.box-t{font-size:12px;font-weight:700;fill:#16202c}.box-d,.col-t{font-size:11px;fill:#56616f}.arrow{fill:none;stroke:#6b7787;stroke-width:1.5}.head{fill:#6b7787}';
    var st = document.createElementNS(NS, 'style'); st.textContent = css; c.insertBefore(st, c.firstChild);
    c.setAttribute('xmlns', NS);
    return new XMLSerializer().serializeToString(c);
  }

  /* ── ⑥ 인증서 비교 ─────────────────────── */
  function readText(file) {
    if (/\.pdf$/i.test(file.name)) {
      if (!window.pdfjsLib) return Promise.reject(new Error('PDF 라이브러리를 불러오지 못했습니다.'));
      return file.arrayBuffer().then(function (buf) {
        return window.pdfjsLib.getDocument({ data: new Uint8Array(buf), cMapUrl: 'vendor/cmaps/', cMapPacked: true, isEvalSupported: false }).promise;
      }).then(function (doc) {
        var jobs = [];
        for (var i = 1; i <= Math.min(doc.numPages, 30); i++) jobs.push(doc.getPage(i).then(function (p) { return p.getTextContent(); }).then(function (tc) { return L.itemsToLines(tc.items); }));
        return Promise.all(jobs).then(function (pages) { doc.destroy(); var t = pages.join('\n'); if (!t.trim()) throw new Error(file.name + ': 글자층이 없는 PDF(스캔본)입니다. 글자를 복사해 붙여 넣거나, 2단계 OCR 을 기다려 주세요.'); return t; });
      });
    }
    return file.text();
  }
  function wordSpan(a, b, side) {
    var parts = L.wordDiff(a, b), out = [];
    parts.forEach(function (p) {
      if (p.op === '=') out.push(p.t);
      else if (p.op === '-' && side === 'old') out.push(h('del', { class: 'wd' }, p.t));
      else if (p.op === '+' && side === 'new') out.push(h('ins', { class: 'wd' }, p.t));
    });
    return h('span', null, out);
  }
  function compareMeta() {
    var r = recById(db.compare.recId);
    return r ? { body: r.body, kind: r.kind, product: [r.product, r.model !== '-' ? r.model : ''].filter(Boolean).join(' ') } : {};
  }
  function aiInfo(cmp) {
    var r = recById(db.compare.recId), nos = [];
    if (db.maskCertNo) {
      cmp.items.forEach(function (it) { if (/^(certificate(no|number)?|certno|인증서?번호|증서번호)/.test(it.k)) { if (it.old) nos.push(it.old); if (it.new) nos.push(it.new); } });
      if (r) { if (r.certNo) nos.push(r.certNo); (r.history || []).forEach(function (x) { if (x.certNo) nos.push(x.certNo); }); }
    }
    return L.aiComparePrompt(cmp, compareMeta(), { mask: db.mask, words: settings().maskWords, certNos: nos });
  }
  function pageCompare() {
    var c = db.compare, cmp = L.compareCerts(c.oldText, c.newText);
    function side(which, label) {
      var ta = h('textarea', { 'aria-label': label + ' 인증서 글', placeholder: '인증서 글을 붙여 넣거나 위에서 파일(.txt·.pdf)을 골라 주세요.' }); ta.value = c[which + 'Text'];
      ta.addEventListener('change', function () { c[which + 'Text'] = ta.value; c[which + 'Name'] = c[which + 'Name'] || '붙여 넣은 글'; save(); render(); });
      var fi = h('input', { type: 'file', accept: '.pdf,.txt,.csv,.md' });
      fi.addEventListener('change', function () {
        var f = fi.files[0]; if (!f) return;
        readText(f).then(function (t) { c[which + 'Text'] = t; c[which + 'Name'] = f.name; save(); toast(f.name + ' 을(를) 읽었습니다.'); render(); }, function (e) { toast(e.message, true); });
        fi.value = '';
      });
      return h('div', null, h('h3', null, label, c[which + 'Name'] ? h('span', { class: 'note' }, ' · ' + c[which + 'Name']) : null),
        h('div', { class: 'btn-row', style: 'margin-bottom:6px' }, h('label', { class: 'btn btn-sm' }, '파일 고르기(PDF·글)', fi)), ta);
    }
    var recSel = h('select', { 'aria-label': '연결할 인증' }, [h('option', { value: '' }, '(연결 안 함)')].concat(db.records.map(function (r) { var o = h('option', { value: r.id }, L.certTitle(r) + (r.certNo ? ' · ' + r.certNo : '')); if (r.id === c.recId) o.selected = true; return o; })));
    recSel.addEventListener('change', function () { c.recId = recSel.value; save(); render(); });
    var out = [
      pageHead('⑥', '인증서 비교 — 이전 / 신규', '두 인증서의 글을 넣으면 「항목: 값」을 맞대어 바뀐 항목과 바뀐 줄을 찾고, AI 요약용 프롬프트를 만듭니다.'),
      h('section', { class: 'card' },
        h('div', { class: 'form-grid' }, fld('관리대장의 어느 인증인가요(선택)', recSel, '연결하면 인증기관·종류·제품이 프롬프트와 보고서에 들어갑니다.')),
        h('div', { class: 'cmp-grid', style: 'margin-top:12px' }, side('old', '이전 인증서'), side('new', '신규 인증서')),
        h('p', { class: 'note' }, 'PDF 는 글자층을 읽습니다(스캔본은 글자층이 없어 2단계 OCR 대상). 파일은 이 브라우저 안에서만 읽습니다.'))];
    if (cmp.empty) { out.push(h('p', { class: 'note' }, '두 칸을 모두 채우면 비교 결과가 나옵니다.')); return out; }
    var k = cmp.count;
    out.push(h('div', { class: 'tiles' }, tile('내용 변경', cmp.content.length + '건', '사양·범위·조건·규칙', 'st-tile ' + (cmp.content.length ? 'lv-mid' : 'lv-ok')),
      tile('번호·날짜 변경', cmp.routine.length + '건', '정기 갱신으로 바뀌는 것', 'st-tile lv-lo'),
      tile('바뀐 문장 줄', cmp.free.length + '줄', '항목이 아닌 줄(조건 등)', 'st-tile ' + (cmp.free.length ? 'lv-mid' : 'lv-ok')),
      tile('같은 항목', k['같음'] + '건', '변경 ' + k['변경'] + ' · 추가 ' + k['추가'] + ' · 삭제 ' + k['삭제'])));
    function kvTable(list) {
      return table(['구분', '항목', '이전', '신규'], list.map(function (it) {
        return [it.kind, it.key, it.kind === '변경' ? wordSpan(it.old, it.new, 'old') : (it.old || '(없음)'), it.kind === '변경' ? wordSpan(it.old, it.new, 'new') : (it.new || '(없음)')];
      }));
    }
    out.push(h('section', { class: 'card' }, h('h2', null, '내용 변경 (' + cmp.content.length + '건)'),
      cmp.content.length ? kvTable(cmp.content) : h('p', { class: 'note' }, '사양·범위·조건 항목은 바뀌지 않았습니다.'),
      h('h3', { style: 'margin-top:16px' }, '항목이 아닌 줄의 차이 (' + cmp.free.length + '줄)'),
      cmp.free.length ? h('div', { class: 'diff-lines' }, cmp.free.map(function (o) { return h('div', { class: o.op === '+' ? 'add' : 'del' }, (o.op === '+' ? '+ ' : '- ') + (o.op === '+' ? o.b : o.a)); })) : h('p', { class: 'note' }, '없음'),
      h('h3', { style: 'margin-top:16px' }, '번호·날짜 변경 (' + cmp.routine.length + '건)'),
      cmp.routine.length ? kvTable(cmp.routine) : h('p', { class: 'note' }, '없음'),
      h('details', { style: 'margin-top:12px' }, h('summary', null, '전체 줄 비교 보기 (추가 ' + cmp.lines.added + ' · 삭제 ' + cmp.lines.removed + ' · 같음 ' + cmp.lines.same + ')'),
        h('div', { class: 'diff-lines' }, cmp.lines.ops.map(function (o) { return h('div', { class: o.op === '+' ? 'add' : o.op === '-' ? 'del' : 'same' }, (o.op === '=' ? '  ' : o.op + ' ') + (o.op === '+' ? o.b : o.a)); })))));
    // AI 요약 (반자동)
    var info = aiInfo(cmp);
    var maskBox = h('input', { type: 'checkbox' }); maskBox.checked = db.mask;
    maskBox.addEventListener('change', function () { db.mask = maskBox.checked; save(); render(); });
    var noBox = h('input', { type: 'checkbox' }); noBox.checked = db.maskCertNo;
    noBox.addEventListener('change', function () { db.maskCertNo = noBox.checked; save(); render(); });
    var words = h('textarea', { 'aria-label': '가릴 낱말', style: 'min-height:70px' }); words.value = settings().maskWords.join('\n');
    words.addEventListener('change', function () { db.settings.maskWords = words.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean); save(); render(); });
    var leaks = db.mask ? L.findLeaks(info.prompt, info.map) : [];
    var pr = h('textarea', { readonly: true, 'aria-label': 'AI 프롬프트', style: 'min-height:220px' }); pr.value = info.prompt;
    var ans = h('textarea', { 'aria-label': 'AI 답', placeholder: 'AI 답을 여기에 붙여 넣어 주세요. 별칭(가린말1·인증번호1 …)은 원래 이름으로 되돌립니다.' }); ans.value = c.answer;
    function back(t) { return db.mask ? L.unmaskText(t, info.map) : t; }
    ans.addEventListener('change', function () { var b = back(ans.value); if (b !== ans.value) toast('답의 별칭을 원래 이름으로 되돌렸습니다.'); c.answer = b; ans.value = b; save(); });
    var mapRows = Object.keys(info.map).map(function (k) { return [k, info.map[k]]; });
    out.push(h('section', { class: 'card' }, h('h2', null, 'AI 로 변경 내용 요약 (반자동)'),
      h('ol', { class: 'steps' }, h('li', null, '아래 프롬프트를 복사해 회사가 허용한 AI 에 붙여 넣어 주세요.'), h('li', null, 'AI 답을 「AI 답」 칸에 붙여 넣으면 ⑦ 보고서에 들어갑니다.'), h('li', null, '답은 비교 결과만 근거로 한 초안입니다. 인증서 원문과 대조해 확인해 주세요.')),
      h('div', { class: 'mask-box' },
        h('label', { class: 'opt' }, maskBox, h('span', null, h('span', { class: 't' }, '이름 가리기(권장)'), h('span', { class: 's' }, '아래 낱말·메일 주소·전화번호를 별칭으로 바꿔 보냅니다. 대응표는 이 PC 에만 있습니다.'))),
        h('label', { class: 'opt', style: 'margin-top:6px' }, noBox, h('span', null, h('span', { class: 't' }, '인증서 번호도 가리기'), h('span', { class: 's' }, '번호로 회사·제품을 알아볼 수 있으면 켜 두세요.'))),
        fld('가릴 낱말 (한 줄에 하나 — 회사명·사람 이름·고객명 등)', words)),
      leaks.length ? h('p', { class: 'alert warn' }, '프롬프트에 가리지 못한 낱말이 남았습니다: ' + leaks.join(', ')) : null,
      pr,
      h('div', { class: 'btn-row', style: 'margin:8px 0' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { copyText(info.prompt, '프롬프트를 복사했습니다.'); } }, '프롬프트 복사'),
        AIP.sendButton('설정한 AI 서버로 보내기(선택)', function () { return info.prompt; }, function (text) { c.answer = back(text); ans.value = c.answer; save(); toast('AI 답을 받았습니다(별칭은 원래 이름으로 되돌림).'); }, { toast: toast, settingsHref: '#/settings' })),
      mapRows.length ? h('details', null, h('summary', null, '별칭 대응표 (' + mapRows.length + '개 · 이 PC 에만)'), table(['별칭', '원래'], mapRows, { cls: 'alias' })) : null,
      fld('AI 답', ans)));
    return out;
  }

  /* ── ⑦ 보고서 ─────────────────────────────── */
  function statusPaper() {
    var Sx = settings(), t = today(), sm = L.summary(db.records, Sx, t), al = L.alerts(db.records, Sx, t), c = sm.count;
    return h('div', { class: 'card paper rp' },
      h('h1', null, '인증 갱신 현황 보고 (' + t + ' 기준)'),
      h('h2', null, '1. 요약'),
      table(['전체', '만료', '지연', '임박', '배포 필요', '준비 시작·진행', '준비 예정', '정상·완료'], [[db.records.length, c.expired, c.late, c.urgent, c.distribute, c.active, c.soon, c.ok + c.done]], { num: [1, 1, 1, 1, 1, 1, 1, 1] }),
      h('h2', null, '2. 살펴볼 인증 (만료·지연·임박·배포 필요)'),
      sm.attention.length ? table(['상태', '인증', '인증서 번호', '만료일', '진행 단계', '내용'], sm.attention.map(function (x) {
        return [x.st.label, L.certTitle(x.rec), x.rec.certNo || '', x.rec.expires + ' (' + L.dLabel(x.st.daysLeft) + ')', L.stageLabel(x.rec.stage), x.st.msg];
      })) : h('p', null, '없음'),
      h('h2', null, '3. 오늘 연락할 것'),
      al.length ? table(['인증', '할 일', '날짜', '받을 부서'], al.map(function (a) { return [L.certTitle(a.rec), a.label, a.date + ' (' + L.whenText(a.days) + ')', a.depts.map(deptName).join(' · ')]; })) : h('p', null, '없음'),
      h('h2', null, '4. 앞으로 12개월 만료 예정'),
      table(['월'].concat(sm.months.map(function (m) { return m.label; })), [['만료'].concat(sm.months.map(function (m) { return m.expire; })), ['준비 시작'].concat(sm.months.map(function (m) { return m.prep; }))]),
      h('p', { class: 'note' }, '갱신 일정은 만료일에서 인증 종류별 리드타임(설정)을 거꾸로 센 계획값입니다.'));
  }
  function comparePaper() {
    var c = db.compare, cmp = L.compareCerts(c.oldText, c.newText), m = compareMeta();
    if (cmp.empty) return h('div', { class: 'card paper rp' }, h('p', null, '⑥ 화면에서 이전·신규 인증서 글을 넣으면 변경 내용 보고서가 만들어집니다.'));
    return h('div', { class: 'card paper rp' },
      h('h1', null, '인증서 변경 내용 보고'),
      h('p', null, [m.body ? '인증기관 ' + m.body : '', m.kind ? '인증 종류 ' + m.kind : '', m.product ? '제품 ' + m.product : '', '작성일 ' + today()].filter(Boolean).join(' · ')),
      h('p', null, '이전: ' + (c.oldName || '-') + ' · 신규: ' + (c.newName || '-')),
      h('h2', null, '1. 내용 변경 (' + cmp.content.length + '건)'),
      cmp.content.length ? table(['구분', '항목', '이전', '신규'], cmp.content.map(function (it) { return [it.kind, it.key, it.old || '(없음)', it.new || '(없음)']; })) : h('p', null, '없음'),
      h('h2', null, '2. 조건·문장 변경 (' + cmp.free.length + '줄)'),
      cmp.free.length ? h('ul', null, cmp.free.map(function (o) { return h('li', null, (o.op === '+' ? '[추가] ' + o.b : '[삭제] ' + o.a)); })) : h('p', null, '없음'),
      h('h2', null, '3. 번호·날짜 변경 (' + cmp.routine.length + '건)'),
      cmp.routine.length ? table(['구분', '항목', '이전', '신규'], cmp.routine.map(function (it) { return [it.kind, it.key, it.old || '(없음)', it.new || '(없음)']; })) : h('p', null, '없음'),
      c.answer ? [h('h2', null, '4. 요약 의견 (AI 초안 — 원문과 대조 후 사용)'), h('div', { class: 'pre' }, c.answer)] : null);
  }
  function pageReport() {
    var tabs = h('div', { class: 'tabs no-print', role: 'group', 'aria-label': '보고서 종류' },
      [['status', '현황 보고'], ['compare', '변경 내용 보고']].map(function (x) { return h('button', { type: 'button', 'aria-pressed': ui.report === x[0] ? 'true' : 'false', onclick: function () { ui.report = x[0]; render(); } }, x[1]); }));
    var paper = ui.report === 'compare' ? comparePaper() : (db.records.length ? statusPaper() : emptyNotice());
    var name = (ui.report === 'compare' ? '인증서_변경내용_보고_' : '인증_갱신_현황_보고_') + today();
    return [
      pageHead('⑦', '보고서', '현황 보고(관리대장 기준)와 변경 내용 보고(이전/신규 인증서 비교)를 인쇄하거나 Word·엑셀로 내려받습니다.',
        h('div', { class: 'btn-row no-print' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { window.print(); } }, '인쇄 / PDF'),
          h('button', { type: 'button', class: 'btn', onclick: function () { exportWord(name, paper); } }, 'Word 로'),
          h('button', { type: 'button', class: 'btn', onclick: function () { exportReportXlsx(name); } }, '엑셀로'))),
      tabs, paper];
  }
  function exportWord(name, paper) {
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>' + name + '</title>' +
      '<style>body{font-family:"맑은 고딕",sans-serif;font-size:10.5pt} table{border-collapse:collapse;margin:6px 0} th,td{border:1px solid #999;padding:3px 6px;font-size:9.5pt} th{background:#eef2f7} h1{font-size:16pt} h2{font-size:12.5pt;margin-top:14pt} .pre{white-space:pre-wrap}</style></head><body>' +
      paper.innerHTML + '</body></html>';
    download(name + '.doc', new Blob(['﻿' + html], { type: 'application/msword' }));
  }
  function exportReportXlsx(name) {
    var Sx = settings(), t = today(), wb = XLSX.utils.book_new();
    if (db.records.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([L.LEDGER_HEAD].concat(L.ledgerRows(db.records, Sx, t))), '관리대장 현황');
      var al = L.alerts(db.records, Sx, t);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['인증', '인증서 번호', '할 일', '날짜', '남은 날', '상태', '받을 부서']].concat(al.map(function (a) { return [L.certTitle(a.rec), a.rec.certNo, a.label, a.date, a.days, a.status.label, a.depts.map(deptName).join(', ')]; }))), '오늘 알림');
      var flow = L.cleanFlow(db.flow);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['단계', '기간(일)'].concat(flow.lanes)].concat(flow.steps.map(function (s, i) { return [(i + 1) + '. ' + s.name, s.days].concat(flow.lanes.map(function (l) { return s.roles[l] || ''; })); }))), 'R&R(RACI)');
    }
    var cmp = L.compareCerts(db.compare.oldText, db.compare.newText);
    if (!cmp.empty) {
      var rows = [['구분', '분류', '항목', '이전', '신규']];
      cmp.items.forEach(function (it) { rows.push([it.kind, it.routine ? '번호·날짜' : '내용', it.key, it.old, it.new]); });
      cmp.free.forEach(function (o) { rows.push([o.op === '+' ? '추가' : '삭제', '문장', '', o.op === '-' ? o.a : '', o.op === '+' ? o.b : '']); });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '인증서 변경 비교');
      if (db.compare.answer) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(db.compare.answer.split('\n').map(function (s) { return [s]; })), 'AI 요약(초안)');
    }
    if (!wb.SheetNames.length) { toast('내보낼 데이터가 없습니다.', true); return; }
    XLSX.writeFile(wb, name + '.xlsx');
  }

  /* ── 설정 ─────────────────────────────────── */
  function backupJson(withPdf) {
    var ids = allPdfIds(), name = '인증관리_백업_' + L.localToday() + (withPdf ? '_PDF포함' : '') + '.json';
    if (!withPdf) { download(name, new Blob([JSON.stringify(Object.assign({}, db, { pdfsOmitted: ids.length }))], { type: 'application/json' })); return; }
    P.exportAll(ids).then(function (list) {
      download(name, new Blob([JSON.stringify(Object.assign({}, db, { pdfs: list }))], { type: 'application/json' }));
      if (list.length < ids.length) toast('PDF ' + (ids.length - list.length) + '장은 이 브라우저에서 찾지 못해 빠졌습니다.', true);
    }, function (e) { toast('PDF 를 읽지 못했습니다: ' + e.message, true); });
  }
  function pageSettings() {
    var pdfCount = { n: 0, bytes: 0 };
    db.records.forEach(function (r) { [r.pdf].concat((r.history || []).map(function (x) { return x.pdf; })).forEach(function (p) { if (p) { pdfCount.n++; pdfCount.bytes += p.size || 0; } }); });
    var s = settings();
    function num(v, lo, hi) { return h('input', { type: 'number', min: lo, max: hi, step: 1, inputmode: 'numeric', value: v }); }
    var inp = { today: h('input', { type: 'date', value: s.today }), noticeDays: num(s.noticeDays, 0, 365), urgentDays: num(s.urgentDays, 0, 730), graceDays: num(s.graceDays, 0, 90), lookahead: num(s.lookahead, 0, 60) };
    function saveBasic() { Object.keys(inp).forEach(function (k) { db.settings[k] = inp[k].value; }); db.settings = L.cleanSettings(db.settings); save(); toast('저장했습니다.'); render(); }
    // 인증 종류별 리드타임
    var kindRows = s.kinds.map(function (k, i) {
      var cells = [], ins = {};
      ins.name = h('input', { value: k.name, 'aria-label': '이름' }); ins.match = h('input', { value: k.match, 'aria-label': '알아볼 낱말', placeholder: '비우면 기본값(맞는 종류가 없을 때)' });
      cells.push(ins.name, ins.match);
      L.PHASES.forEach(function (p) { ins[p.id] = h('input', { type: 'number', min: 0, step: 1, value: k[p.id], 'aria-label': p.label + ' 일수' }); cells.push(ins[p.id]); });
      cells.push(String(L.PHASES.reduce(function (a, p) { return a + k[p.id]; }, 0)));
      Object.keys(ins).forEach(function (f) { ins[f].addEventListener('change', function () { db.settings.kinds = s.kinds; db.settings.kinds[i][f] = ins[f].value; db.settings = L.cleanSettings(db.settings); save(); render(); }); });
      cells.push(h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: function () { if (s.kinds.length > 1) { db.settings.kinds = s.kinds.filter(function (_, j) { return j !== i; }); db.settings = L.cleanSettings(db.settings); save(); render(); } } }, '빼기'));
      return { cells: cells, tdCls: ['name-cell'] };
    });
    var extraTa = h('textarea', { style: 'min-height:70px', 'aria-label': '기관별 추가 일수' }); extraTa.value = s.bodyExtra.map(function (b) { return b.body + ', ' + b.days; }).join('\n');
    extraTa.addEventListener('change', function () {
      db.settings.bodyExtra = extraTa.value.split(/\r?\n/).map(function (l) { var p = l.split(/[,\t]/); return { body: (p[0] || '').trim(), days: Number((p[1] || '').trim()) }; }).filter(function (b) { return b.body && isFinite(b.days); });
      db.settings = L.cleanSettings(db.settings); save(); render();
    });
    // 부서 · 알림 규칙
    var deptRows = s.depts.map(function (d, i) {
      var n = h('input', { value: d.name, 'aria-label': '부서 이름' }), e = h('input', { value: d.email, type: 'email', placeholder: '예: quality@회사도메인', 'aria-label': d.name + ' 메일' });
      n.addEventListener('change', function () { db.settings.depts = s.depts; db.settings.depts[i].name = n.value; db.settings = L.cleanSettings(db.settings); save(); render(); });
      e.addEventListener('change', function () { db.settings.depts = s.depts; db.settings.depts[i].email = e.value; db.settings = L.cleanSettings(db.settings); save(); render(); });
      var cells = [n, e];
      Object.keys(L.EVENTS).forEach(function (ev) {
        var cb = h('input', { type: 'checkbox', 'aria-label': d.name + ' · ' + L.EVENTS[ev] }); cb.checked = s.rules[ev].indexOf(d.id) >= 0;
        cb.addEventListener('change', function () { db.settings.rules = s.rules; var l = db.settings.rules[ev]; if (cb.checked) l.push(d.id); else l.splice(l.indexOf(d.id), 1); db.settings = L.cleanSettings(db.settings); save(); });
        cells.push(cb);
      });
      cells.push(i >= 3 ? h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: function () { db.settings.depts = s.depts.filter(function (_, j) { return j !== i; }); db.settings = L.cleanSettings(db.settings); save(); render(); } }, '빼기') : '');
      return { cells: cells, tdCls: ['name-cell'] };
    });
    var backup = h('input', { type: 'file', accept: '.json' });
    backup.addEventListener('change', function () {
      var f = backup.files[0]; if (!f) return;
      f.text().then(function (t) {
        var o = JSON.parse(t), had = allPdfIds();
        var next = L.restoreDb(o);
        return P.importAll(o && o.pdfs).then(function (n) {
          // 백업에 없는 PDF 는 이 브라우저에 있으면 그대로 씁니다. 새 데이터가 가리키지 않는 옛 PDF 는 지웁니다
          var keep = {}; db = next; allPdfIds().forEach(function (id) { keep[id] = 1; });
          P.del(had.filter(function (id) { return !keep[id]; }));
          save();
          var miss = o && o.pdfsOmitted ? ' · PDF ' + o.pdfsOmitted + '장은 백업에 없음(이 브라우저에 있으면 그대로 보임)' : '';
          toast('백업을 불러왔습니다 — 인증 ' + db.records.length + '건' + (n ? ' · PDF ' + n + '장' : '') + miss + '.');
          render();
        });
      }).catch(function (e) { toast('불러오지 못했습니다: ' + e.message, true); });
    });
    return [
      pageHead('설정', '설정', '리드타임·알림 시점·부서 메일·AI 연결. 바꾸면 모든 화면에 바로 반영됩니다.'),
      h('section', { class: 'card' }, h('h2', null, '기준일 · 알림 시점'),
        h('div', { class: 'form-grid' },
          fld('기준일(비우면 오늘)', inp.today, '지난 날·다가올 날 기준으로 미리 볼 때'),
          fld('준비 예정 안내 (준비 시작 며칠 전)', inp.noticeDays),
          fld('임박 (만료 며칠 전)', inp.urgentDays),
          fld('지연 판정 유예 (일)', inp.graceDays, '단계 기한이 이 일수를 넘게 지나면 「지연」'),
          fld('알림 미리 보기 (일)', inp.lookahead, '오늘부터 이 일수 안에 오는 일까지 알림')),
        h('div', { class: 'btn-row', style: 'margin-top:12px' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: saveBasic }, '저장'))),
      h('section', { class: 'card' }, h('h2', null, '인증 종류별 리드타임 (일)'),
        h('p', { class: 'note' }, '인증 종류 글자에 「알아볼 낱말」이 들어 있으면 그 줄을 씁니다(위에서부터). 3글자 이하 약어(TA·MWA)는 따로 떨어진 낱말일 때만 맞춥니다. 실제 값은 확인 대기입니다(기획서 10장 ③).'),
        table(['이름', '알아볼 낱말(쉼표)'].concat(L.PHASES.map(function (p) { return p.label; })).concat(['합계', '']), kindRows, { cls: 'edit' }),
        h('div', { class: 'btn-row', style: 'margin-top:8px' },
          h('button', { type: 'button', class: 'btn', onclick: function () { db.settings.kinds = s.kinds.concat([{ name: '새 종류', match: '', prep: 45, review: 30, feedback: 21, issue: 14, buffer: 30 }]); db.settings = L.cleanSettings(db.settings); save(); render(); } }, '종류 더하기'),
          h('button', { type: 'button', class: 'btn', onclick: function () { if (confirm('리드타임을 기본값으로 되돌릴까요?')) { db.settings.kinds = L.defaultSettings().kinds; save(); render(); } } }, '기본값으로')),
        h('div', { style: 'margin-top:14px' }, fld('인증기관별 추가 일수 — 기관 심사 기간에 더함 (한 줄에 「기관, 일수」)', extraTa, '예: ABS, 15  ·  피드백이 늦게 오는 기관이 있으면 적어 주세요.'))),
      h('section', { class: 'card' }, h('h2', null, '부서 · 알림 받는 부서'),
        h('p', { class: 'note' }, '부서 메일은 개인 주소보다 부서 공용 주소를 권합니다. 관리대장의 「주관 부서」가 부서 이름과 같으면 그 부서는 늘 함께 받습니다.'),
        table(['부서', '메일(여럿은 ; 로)'].concat(Object.keys(L.EVENTS).map(function (k) { return L.EVENTS[k]; })).concat(['']), deptRows, { cls: 'edit' }),
        h('div', { class: 'btn-row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn', onclick: function () { db.settings.depts = s.depts.concat([{ id: 'd' + Date.now().toString(36), name: '새 부서', email: '' }]); db.settings = L.cleanSettings(db.settings); save(); render(); } }, '부서 더하기'))),
      AIP.settingsCard({ toast: toast, onChange: render }),
      h('section', { class: 'card' }, h('h2', null, '백업 · 불러오기'),
        h('p', { class: 'note' }, '데이터는 이 브라우저에만 있습니다. 다른 PC 로 옮기거나 지우기 전에 JSON 백업을 받아 두세요(AI 키는 백업에 들어가지 않습니다).'),
        h('p', { class: 'note' }, '인증서 PDF ' + pdfCount.n + '장(' + P.fmt(pdfCount.bytes) + ') — 「PDF 포함」은 PDF 를 글자(base64)로 넣어 파일이 약 ' + P.fmt(Math.round(pdfCount.bytes * 1.37) + 4096) + ' 커집니다. 「PDF 빼고」는 관리대장·이력만 담고, 불러온 브라우저에 같은 PDF 가 없으면 「PDF 를 찾지 못했습니다」로 나옵니다.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { backupJson(true); } }, 'JSON 백업(PDF 포함)'),
          h('button', { type: 'button', class: 'btn', onclick: function () { backupJson(false); } }, 'JSON 백업(PDF 빼고)'),
          h('label', { class: 'btn' }, 'JSON 백업 불러오기', backup)))
    ];
  }

  /* ── 라우터 ─────────────────────────────── */
  var PAGES = [
    { id: 'import', no: '0', t: '데이터 가져오기', s: '관리대장 엑셀', fn: pageImport },
    { id: 'dash', no: '①', t: '대시보드', s: '상태 신호·할 일', fn: pageDash },
    { id: 'gantt', no: '②', t: '갱신 타임라인', s: '만료일 역산 간트', fn: pageGantt },
    { id: 'ledger', no: '③', t: '관리대장', s: '진행 단계·배포일', fn: pageLedger },
    { id: 'models', no: '③-2', t: '모델별 이력', s: '모델-형식 묶음·PDF', fn: pageModels },
    { id: 'alert', no: '④', t: '알림', s: '오늘 연락할 사람·메일', fn: pageAlert },
    { id: 'flow', no: '⑤', t: '업무흐름 · R/R', s: '단계표 → 흐름도', fn: pageFlow },
    { id: 'compare', no: '⑥', t: '인증서 비교', s: '이전/신규·AI 요약', fn: pageCompare },
    { id: 'report', no: '⑦', t: '보고서', s: '인쇄·Word·엑셀', fn: pageReport },
    { id: 'settings', no: '설', t: '설정', s: '리드타임·부서·AI', fn: pageSettings }
  ];
  function route() { var id = (location.hash || '').replace(/^#\//, '').split('?')[0]; return PAGES.filter(function (p) { return p.id === id; })[0] || (db.records.length ? PAGES[1] : PAGES[0]); }
  function render() {
    var p = route();
    var nav = document.getElementById('nav'); nav.innerHTML = '';
    PAGES.forEach(function (x) {
      nav.appendChild(h('a', { href: '#/' + x.id, 'aria-current': x === p ? 'page' : null }, h('span', { class: 'no' }, x.no), h('span', { class: 't' }, x.t), h('span', { class: 's' }, x.s)));
    });
    var chip = document.getElementById('dataChip');
    if (db.records.length) {
      var sm = L.summary(db.records, settings(), today());
      chip.textContent = '운영 중 인증 ' + sm.running + '건' + (sm.count.inactive ? ' · 중지·종료 ' + sm.count.inactive + '건' : '') + ' · 기준일 ' + today() + ' · 살펴볼 것 ' + sm.attention.length + '건';
    } else chip.textContent = '데이터 없음';
    var b = document.getElementById('sampleBanner');
    b.hidden = !db.sample;
    b.textContent = '지금 보시는 것은 가상 샘플입니다(공개 선급 이름 + 지어낸 제품·모델·인증서 번호·담당자·이력·PDF, 만료일은 오늘 기준으로 배치). 리드타임·부서도 가상 기본값입니다. 실제 관리대장을 넣으면 샘플은 지워집니다.';
    main.innerHTML = '';
    add(main, p.fn());
    document.title = p.t + ' — 인증 갱신 관리';
    save();
  }
  window.addEventListener('hashchange', function () {
    closePdf(); render(); main.focus(); window.scrollTo(0, 0);
    var g = location.hash.split('?g=')[1];
    if (g != null) { var el = document.getElementById('g-' + (decodeURIComponent(g) || 'none')); if (el) el.scrollIntoView(); }
  });
  render();
})();

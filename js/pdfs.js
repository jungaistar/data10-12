/* 인증서 PDF 저장소 — IndexedDB (2차, 2026-10-27 · data10-06 의 사진 저장소 photos.js 와 같은 모양)
 *
 * PDF 는 localStorage(보통 5MB 안팎)에 넣으면 몇 장 만에 가득 차므로 IndexedDB 에 둡니다. 관리대장 글은 localStorage.
 * 관리대장의 인증·이력 한 줄에는 { id, name, size, at } 만 적고, 파일 자체는 여기에 { id, name, size, type, at, blob } 으로 둡니다.
 * IndexedDB 를 쓸 수 없는 브라우저(사생활 보호 창 등)에서는 이번 창의 메모리에만 두고, 화면에 알립니다.
 */
(function (root) {
  'use strict';
  var DB_NAME = 'data10-12.pdfs', STORE = 'pdfs';
  var MAX_BYTES = 15 * 1024 * 1024;   // 한 장 15MB — 스캔본 인증서도 대개 이 안에 들어옵니다
  var memory = {};
  var dbp = null, ok = true;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        if (!root.indexedDB) { ok = false; resolve(null); return; }
        var rq = root.indexedDB.open(DB_NAME, 1);
        rq.onupgradeneeded = function () { var d = rq.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' }); };
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { ok = false; resolve(null); };
        rq.onblocked = function () { ok = false; resolve(null); };
      } catch (e) { ok = false; resolve(null); }
    });
    return dbp;
  }
  function tx(mode, fn) {
    return open().then(function (d) {
      if (!d) return fn(null);
      return new Promise(function (resolve, reject) {
        var t = d.transaction(STORE, mode), st = t.objectStore(STORE), out;
        Promise.resolve(fn(st)).then(function (v) { out = v; });
        t.oncomplete = function () { resolve(out && out.__req ? out.__req.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('PDF 를 저장하지 못했습니다(저장 공간이 모자랄 수 있습니다)')); };
      });
    });
  }
  function put(rec) { return tx('readwrite', function (st) { if (!st) { memory[rec.id] = rec; return; } st.put(rec); }); }
  function get(id) { return tx('readonly', function (st) { if (!st) return memory[id] || null; return { __req: st.get(id) }; }); }
  function del(ids) { return tx('readwrite', function (st) { (ids || []).forEach(function (id) { if (!id) return; if (!st) delete memory[id]; else st.delete(id); }); }); }
  function all() { return tx('readonly', function (st) { if (!st) return Object.keys(memory).map(function (k) { return memory[k]; }); return { __req: st.getAll() }; }); }
  function clear() { return tx('readwrite', function (st) { if (!st) { memory = {}; return; } st.clear(); }); }
  function newId() { return 'pdf' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* 파일 하나를 확인하고 저장 → 관리대장에 적을 { id, name, size, at } */
  function looksPdf(blob) {
    return blob.slice(0, 5).arrayBuffer().then(function (b) { return String.fromCharCode.apply(null, new Uint8Array(b)) === '%PDF-'; });
  }
  function fmt(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace(/\.0$/, '') + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }
  function addFile(file, now) {
    if (!file) return Promise.reject(new Error('파일을 골라 주세요.'));
    if (file.size > MAX_BYTES) return Promise.reject(new Error(file.name + ' 은(는) ' + fmt(file.size) + ' 입니다. 한 장 ' + fmt(MAX_BYTES) + ' 까지 붙일 수 있습니다 — PDF 를 줄이거나(인쇄 → PDF 로 저장) 쪽을 나눠 주세요.'));
    if (!file.size) return Promise.reject(new Error(file.name + ' 은(는) 빈 파일입니다.'));
    return looksPdf(file).then(function (isPdf) {
      if (!isPdf) throw new Error(file.name + ' 은(는) PDF 가 아닙니다. 인증서를 PDF 로 저장해 붙여 주세요.');
      var meta = { id: newId(), name: file.name || '인증서.pdf', size: file.size, at: now || new Date().toISOString().slice(0, 10) };
      return put({ id: meta.id, name: meta.name, size: meta.size, type: 'application/pdf', at: meta.at, blob: file.slice(0, file.size, 'application/pdf') }).then(function () { return meta; });
    });
  }
  /* 새 탭·화면 안 보기용 주소. 쓰고 나면 revoke 해 주세요 */
  function url(id) {
    return get(id).then(function (r) { if (!r || !r.blob) throw new Error('PDF 파일을 찾지 못했습니다(이 브라우저에서 지워졌거나 다른 PC 의 백업입니다). 다시 붙여 주세요.'); return URL.createObjectURL(r.blob); });
  }

  /* 백업용 base64 */
  function blobToB64(blob) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onload = function () { resolve(String(rd.result).replace(/^data:[^,]*,/, '')); };
      rd.onerror = function () { reject(rd.error); };
      rd.readAsDataURL(blob);
    });
  }
  function b64ToBlob(b64) {
    var bin = atob(b64 || ''), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: 'application/pdf' });
  }
  function exportAll(ids) {
    var want = {}; (ids || []).forEach(function (id) { want[id] = 1; });
    return all().then(function (list) {
      list = (list || []).filter(function (r) { return want[r.id] && r.blob; });
      return Promise.all(list.map(function (r) { return blobToB64(r.blob).then(function (b) { return { id: r.id, name: r.name, size: r.size, at: r.at, b64: b }; }); }));
    });
  }
  function importAll(list) {
    list = (list || []).filter(function (x) { return x && x.id && x.b64; });
    return Promise.all(list.map(function (x) { return put({ id: x.id, name: x.name, size: x.size, type: 'application/pdf', at: x.at, blob: b64ToBlob(x.b64) }); })).then(function () { return list.length; });
  }
  function putBytes(bytes, name, now) {
    var meta = { id: newId(), name: name, size: bytes.length, at: now || new Date().toISOString().slice(0, 10) };
    return put({ id: meta.id, name: name, size: bytes.length, type: 'application/pdf', at: meta.at, blob: new Blob([bytes], { type: 'application/pdf' }) }).then(function () { return meta; });
  }

  root.CTPdfs = {
    MAX_BYTES: MAX_BYTES, fmt: fmt,
    addFile: addFile, putBytes: putBytes, get: get, del: del, all: all, clear: clear, url: url,
    exportAll: exportAll, importAll: importAll,
    ready: function () { return open().then(function () { return ok; }); },
    available: function () { return ok; }
  };
})(window);

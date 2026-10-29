// Uji worker.js + halaman /admin tanpa akun Cloudflare (D1 palsu).
// Jalankan: node tests/worker.test.mjs
import { createRequire } from 'node:module';
import worker from '../worker.js';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const results = [];
const ok = (name, pass, info = '') => results.push({ name, pass, info });

// ---- D1 palsu: mencatat SQL & binding, mengembalikan hasil tetap ----
function fakeDB() {
  const log = { run: [], batch: [], all: [] };
  const db = {
    prepare(sql) {
      const st = {
        sql,
        args: [],
        bind(...a) { this.args = a; return this; },
        async run() { log.run.push({ sql, args: st.args }); return { meta: { last_row_id: 7 } }; },
        async all() {
          log.all.push({ sql, args: st.args });
          if (/FROM jawaban GROUP BY organ/.test(sql)) return { results: [{ organ: 'Mulut', n: 4, rata_salah: 1.5, pct_gagal: 50, pct_petunjuk: 25 }] };
          if (/FROM sesi GROUP BY/.test(sql)) return { results: [{ nama: 'Budi', kelas: 'X-1', sesi: 2, rata: 220, maks: 300, terakhir: '2026-10-29 06:00:00' }] };
          return { results: [{ soal: 'Enzim air liur?', n: 5, rata_salah: 1.2 }] };
        }
      };
      return st;
    },
    async batch(stmts) { log.batch.push(stmts.map(s => ({ sql: s.sql, args: s.args }))); return []; }
  };
  return { db, log };
}

const env = () => { const f = fakeDB(); return { env: { DB: f.db, ADMIN_KEY: 'rahasia', ALLOWED_ORIGIN: 'https://siswa.github.io' }, log: f.log }; };
const call = (e, path, init = {}) => worker.fetch(new Request('https://api.test' + path, init), e);

// 1) kiriman normal
{
  const { env: e, log } = env();
  const body = {
    nama: 'B'.repeat(50), kelas: 'X-1', mode: 'solo', level: 2, makanan: 'Nasi Goreng Spesial', skor: 420,
    jawaban: Array.from({ length: 20 }, () => ({ o: 'Mulut', p: 'Ani', s: 1, h: 1, pt: 40, q: 'Q'.repeat(300) }))
  };
  const r = await call(e, '/api/log', { method: 'POST', body: JSON.stringify(body) });
  const j = await r.json();
  ok('POST /api/log → 200 ok', r.status === 200 && j.ok === 1, JSON.stringify(j));
  ok('header CORS dari ALLOWED_ORIGIN', r.headers.get('Access-Control-Allow-Origin') === 'https://siswa.github.io', r.headers.get('Access-Control-Allow-Origin'));
  ok('respons tidak di-cache', r.headers.get('Cache-Control') === 'no-store', r.headers.get('Cache-Control'));
  const sesi = log.run[0];
  ok('sesi_id = last_row_id', log.batch[0]?.[0].args[0] === 7, String(log.batch[0]?.[0].args[0]));
  ok('nama dipotong 30 karakter', sesi.args[0].length === 30, String(sesi.args[0].length));
  ok('makanan dipotong 20 karakter', sesi.args[5] === 'Nasi Goreng Spesial', sesi.args[5]);
  ok('detail soal dibatasi 12 baris', log.batch[0].length === 12, String(log.batch[0].length));
  ok('teks soal dipotong 160 karakter', log.batch[0][0].args[6].length === 160, String(log.batch[0][0].args[6].length));
  ok('nilai salah/petunjuk/poin tersimpan', log.batch[0][0].args.slice(3, 6).join(',') === '1,1,40', log.batch[0][0].args.slice(3, 6).join(','));
}

// 2) input aneh & origin lain
{
  const { env: e, log } = env();
  const r = await call(e, '/api/log', { method: 'POST', body: JSON.stringify({ nama: null, mode: 'x', level: 'abc', skor: '9', jawaban: 'bukan array' }) });
  ok('tanpa nama → 400 (tidak ada baris kosong)', r.status === 400, String(r.status));
  ok('nama kosong tidak menulis ke DB', log.run.length === 0, String(log.run.length));
}
{
  const { env: e, log } = env();
  const r = await call(e, '/api/log', { method: 'POST', headers: { Origin: 'https://situs-lain.example' }, body: JSON.stringify({ nama: 'X', jawaban: [] }) });
  ok('origin lain ditolak 403', r.status === 403, String(r.status));
  ok('origin lain tidak menulis ke DB', log.run.length === 0, String(log.run.length));
  const ok2 = await call(e, '/api/log', { method: 'POST', headers: { Origin: 'https://siswa.github.io' }, body: JSON.stringify({ nama: 'X', mode: 'tim', level: 0, skor: 100, jawaban: [] }) });
  ok('origin yang benar diterima', ok2.status === 200 && log.run.length === 1, String(ok2.status));
}
{
  const { env: e, log } = env();
  const r = await call(e, '/api/log', { method: 'POST', body: JSON.stringify({ nama: 'A', mode: 'x', level: 'abc', skor: '9', jawaban: 'bukan array' }) });
  ok('mode aneh dinormalkan ke solo', log.run[0].args[2] === 'solo', log.run[0].args[2]);
  ok('level bukan angka → 0', log.run[0].args[4] === 0, String(log.run[0].args[4]));
  ok('tanpa detail soal tetap tersimpan', log.batch.length === 0 && r.status === 200, String(log.batch.length));
}
{
  const { env: e } = env();
  const r = await call(e, '/api/log', { method: 'POST', body: '{rusak' });
  ok('JSON rusak → 400', r.status === 400, String(r.status));
}

// 3) rekap
{
  const { env: e } = env();
  const a = await call(e, '/api/rekap');
  ok('rekap tanpa kunci → 401', a.status === 401, String(a.status));
  const b = await call(e, '/api/rekap', { headers: { Authorization: 'Bearer salah' } });
  ok('rekap kunci salah → 401', b.status === 401, String(b.status));
  const c = await call(e, '/api/rekap', { headers: { Authorization: 'Bearer rahasia' } });
  const d = await c.json();
  ok('rekap kunci benar → 200', c.status === 200, String(c.status));
  ok('rekap berisi organ/siswa/soal', ['organ', 'siswa', 'soal'].every(k => Array.isArray(d[k])), Object.keys(d).join(','));
}

// 4) OPTIONS, rute lain, /admin, dan render halaman guru
{
  const { env: e } = env();
  const o = await call(e, '/api/log', { method: 'OPTIONS' });
  ok('OPTIONS → 200/204 + izin header', o.status === 200 || o.status === 204, String(o.status));
  ok('izin header Authorization', (o.headers.get('Access-Control-Allow-Headers') || '').includes('Authorization'));
  const x = await call(e, '/apa-saja');
  ok('rute tak dikenal → info JSON', x.status === 200 && (await x.json()).info, '');
  const admin = await call(e, '/admin');
  const html = await admin.text();
  ok('/admin mengirim halaman html', /Rekap Petualangan/.test(html) && admin.headers.get('content-type').includes('text/html'));
  ok('/admin meminta kunci (tidak membocorkan data)', !/Budi/.test(html));
  ok('ambang bisa diubah dari satu tempat (AMBANG_GAGAL/AMBANG_RATA/MIN_SESI)', /pct_gagal>=30/.test(html) && /rata<250/.test(html) && /sesi>=2/.test(html));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'https://api.test/admin', pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = async () => ({
        ok: true, status: 200, json: async () => ({
          organ: [{ organ: 'Mulut', n: 10, rata_salah: 1.4, pct_gagal: 45, pct_petunjuk: 30 }, { organ: 'Anus', n: 8, rata_salah: 0.2, pct_gagal: 12, pct_petunjuk: 0 }],
          siswa: [{ nama: 'Budi', kelas: 'X-1', sesi: 3, rata: 200, maks: 300, terakhir: '2026-10-29 06:00:00' }, { nama: 'Sari', kelas: 'X-1', sesi: 1, rata: 150, maks: 150, terakhir: '2026-10-29 06:00:00' }, { nama: '<img src=x onerror=alert(1)>', kelas: 'X-2', sesi: 2, rata: 500, maks: 600, terakhir: 'x' }],
          soal: [{ soal: 'Enzim air liur?', n: 5, rata_salah: 1.2 }]
        })
      });
    }
  });
  dom.window.document.getElementById('k').value = 'rahasia';
  dom.window.document.querySelector('button').click();
  await new Promise(r => setTimeout(r, 300));
  const out = dom.window.document.getElementById('o').textContent;
  const warns = dom.window.document.querySelectorAll('.w');
  ok('admin merender saran tindakan', /Saran tindakan/.test(out), out.slice(0, 70));
  ok('ambang 30% memunculkan materi Mulut saja', warns.length === 2 && /Mulut/.test(warns[0].textContent) && ![...warns].map(w => w.textContent).join(' ').includes('Anus'), [...warns].map(w => w.textContent).join(' | '));
  ok('siswa rata<250 & sesi>=2 disorot, sesi 1 tidak', /Budi/.test(out) && warns[1]?.textContent.includes('Budi'), warns[1]?.textContent);
  ok('nama berisi HTML di-escape', !dom.window.document.querySelector('#o img'), 'ada elemen img');
  ok('tabel per organ/siswa/soal ada', /Per materi/.test(out) && /Per siswa/.test(out) && /Soal tersulit/.test(out));
  dom.window.close();
}

// 5) D1 belum terpasang
{
  let status = 'throw';
  try { status = (await worker.fetch(new Request('https://api.test/api/log', { method: 'POST', body: '{"nama":"A"}' }), {})).status; } catch (e) { status = 'throw'; }
  ok('tanpa binding DB: 500 JSON, bukan 200 palsu', status === 500, String(status));
}

const pass = results.filter(r => r.pass).length;
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.info ? '  → ' + r.info : ''));
console.log(`\n${pass}/${results.length} lulus`);
process.exit(pass === results.length ? 0 : 1);

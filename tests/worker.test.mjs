// Uji worker.js + halaman /admin tanpa akun Cloudflare (D1 palsu).
// Jalankan: node tests/worker.test.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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
          if (/ORDER BY maks DESC/.test(sql)) return { results: [{ nama: 'Budi', kelas: 'X-1', maks: 600, sesi: 2 }, { nama: 'Sari', kelas: 'X-2', maks: 300, sesi: 1 }] };
          if (/COUNT\(\*\) sesi/.test(sql)) return { results: [{ sesi: 3, siswa: 2, rata: 300, terakhir: '2026-10-29 17:00:00' }] };
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

const env = () => { const f = fakeDB(); return { env: { DB: f.db, ADMIN_KEY: 'rahasia', ALLOWED_ORIGIN: 'https://siswa.github.io', PAPAN_PUBLIK: '1' }, log: f.log }; };
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
  ok('nama dipotong 30 karakter', sesi.args[1].length === 30, String(sesi.args[1].length));
  ok('makanan dipotong 20 karakter', sesi.args[6] === 'Nasi Goreng Spesial', sesi.args[6]);
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
  ok('mode aneh dinormalkan ke solo', log.run[0].args[3] === 'solo', log.run[0].args[3]);
  ok('level bukan angka → 0', log.run[0].args[5] === 0, String(log.run[0].args[5]));
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
  ok('rekap berisi ringkasan (total sesi/siswa/rata-rata)', Array.isArray(d.ringkasan) && d.ringkasan[0].sesi === 3 && d.ringkasan[0].siswa === 2, JSON.stringify(d.ringkasan));
}

// 3b) papan skor publik untuk game
{
  const { env: e } = env();
  const a = await call(e, '/api/papan');
  const d = await a.json();
  ok('GET /api/papan → 200 tanpa kunci', a.status === 200, String(a.status));
  ok('papan mengirim top skor terbaik per siswa', Array.isArray(d.top) && d.top.length === 2 && d.top[0].maks === 600, JSON.stringify(d.top));
  ok('papan tidak membocorkan data lain (hanya nama/kelas/maks/sesi)', d.top.every(x => Object.keys(x).sort().join(',') === 'kelas,maks,nama,sesi'), JSON.stringify(Object.keys(d.top[0])));

  const off = await call({ ...e, PAPAN_PUBLIK: '0' }, '/api/papan');
  ok('PAPAN_PUBLIK="0" menyembunyikan papan', (await off.json()).top.length === 0);

  const rusak = await call({ DB: { prepare() { throw new Error('db mati'); } }, ALLOWED_ORIGIN: 'https://siswa.github.io' }, '/api/papan');
  ok('DB error → papan kosong, bukan 500 (game tetap jalan)', rusak.status === 200 && (await rusak.json()).top.length === 0, String(rusak.status));

  const lain = await call(e, '/api/papan', { headers: { Origin: 'https://situs-lain.example' } });
  ok('papan dari origin lain → 403', lain.status === 403, String(lain.status));
}

// 4) OPTIONS, rute lain, /admin, dan halaman guru statis
{
  const { env: e } = env();
  const o = await call(e, '/api/log', { method: 'OPTIONS' });
  ok('OPTIONS → 200/204 + izin header', o.status === 200 || o.status === 204, String(o.status));
  ok('izin header Authorization', (o.headers.get('Access-Control-Allow-Headers') || '').includes('Authorization'));
  const x = await call(e, '/apa-saja');
  ok('rute tak dikenal → info JSON', x.status === 200 && (await x.json()).info, '');
  const admin = await call(e, '/admin');
  ok('/admin dialihkan ke halaman guru', admin.status === 302 && (admin.headers.get('Location') || '').includes('admin.html'), String(admin.status));

  const html = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
  ok('halaman guru berisi form masuk dan daftar', /id="formLogin"/.test(html) && /id="formRegister"/.test(html));
  ok('halaman guru tidak membocorkan data siswa', !/Budi/.test(html));
  ok('ambang saran tindakan ada di halaman guru', /pct_gagal >= 30/.test(html) && /rata < 250/.test(html) && /sesi >= 2/.test(html));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'https://destroy27.github.io/petualangan-makanan/admin.html', pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = async (url, opt = {}) => {
        const path = String(url).replace('https://pencernaan-api.jejak7-api.workers.dev', '');
        if (path === '/api/auth/login') {
          return { ok: true, status: 200, json: async () => ({ ok: 1, user: { id: 1, nama: 'Guru', tenant: 'g1', active: 1, paid_until: '2026-11-29 10:00:00', token: 'TOK' } }) };
        }
        if (path === '/api/murid') return { ok: true, status: 200, json: async () => ({ list: [] }) };
        if (path === '/api/soal') return { ok: true, status: 200, json: async () => ({ list: [] }) };
        if (path === '/api/token/list') return { ok: true, status: 200, json: async () => ({ list: [] }) };
        if (path === '/api/rekap') {
          return {
            ok: true, status: 200, json: async () => ({
              ringkasan: [{ sesi: 6, siswa: 3, rata: 283, terakhir: '2026-10-29 17:00:00' }],
              organ: [{ organ: 'Mulut', n: 10, rata_salah: 1.4, pct_gagal: 45, pct_petunjuk: 30 }, { organ: 'Anus', n: 8, rata_salah: 0.2, pct_gagal: 12, pct_petunjuk: 0 }],
              siswa: [{ nama: 'Budi', kelas: 'X-1', sesi: 3, rata: 200, maks: 300, terakhir: '2026-10-29 06:00:00' }, { nama: 'Sari', kelas: 'X-1', sesi: 1, rata: 150, maks: 150, terakhir: '2026-10-29 06:00:00' }, { nama: '<img src=x onerror=alert(1)>', kelas: 'X-2', sesi: 2, rata: 500, maks: 600, terakhir: 'x' }],
              soal: [{ soal: 'Enzim air liur?', n: 5, rata_salah: 1.2 }]
            })
          };
        }
        return { ok: true, status: 200, json: async () => ({ ok: 1 }) };
      };
    }
  });
  const w = dom.window, doc = w.document;
  doc.getElementById('loginNama').value = 'Guru';
  doc.getElementById('loginPin').value = '1234';
  doc.getElementById('formLogin').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 250));
  ok('login guru membuka dashboard', !doc.getElementById('viewDash').hidden, 'dashboard masih tersembunyi');
  doc.getElementById('btnRekap').click();
  await new Promise(r => setTimeout(r, 250));
  const out = doc.getElementById('rekapOut').textContent;
  const warns = doc.querySelectorAll('.warn');
  ok('halaman guru merender saran tindakan', /Saran tindakan/.test(out), out.slice(0, 70));
  ok('ambang 30% memunculkan materi Mulut saja', warns.length === 2 && /Mulut/.test(warns[0].textContent) && ![...warns].map(w => w.textContent).join(' ').includes('Anus'), [...warns].map(w => w.textContent).join(' | '));
  ok('siswa rata<250 & sesi>=2 disorot, sesi 1 tidak', /Budi/.test(out) && warns[1]?.textContent.includes('Budi'), warns[1]?.textContent);
  ok('nama berisi HTML di-escape', !doc.querySelector('#rekapOut img'), 'ada elemen img');
  ok('tabel peringkat/materi/soal ada', /Peringkat siswa/.test(out) && /Per materi/.test(out) && /Soal tersulit/.test(out));
  ok('kartu ringkasan terisi dari data', /Total sesi main/.test(out) && /Sesi terakhir \(WITA\)/.test(out) && /283/.test(out), out.slice(0, 90));

  const rank = () => [...doc.querySelectorAll('#rekapOut table')[0].querySelectorAll('tbody tr')].map(r => [...r.cells].map(c => c.textContent.trim()));
  const r0 = rank();
  ok('peringkat urut skor terbaik (600 → 300 → 150)', r0.length === 3 && r0[0][5] === '600' && r0[1][1] === 'Budi' && r0[2][5] === '150', JSON.stringify(r0.map(r => r[1] + ':' + r[5])));

  const f = doc.getElementById('rekapKelas');
  f.value = 'X-2'; f.dispatchEvent(new w.Event('change'));
  const r1 = rank();
  ok('filter kelas menyaring peringkat', r1.length === 1 && r1[0][2] === 'X-2', JSON.stringify(r1));
  f.value = ''; f.dispatchEvent(new w.Event('change'));
  ok('filter "semua kelas" mengembalikan 3 siswa', rank().length === 3, JSON.stringify(rank().map(r => r[1])));

  let blob = null;
  w.URL.createObjectURL = b => { blob = b; return 'blob:x'; };
  w.HTMLAnchorElement.prototype.click = function () { };
  doc.getElementById('btnCsv').click();
  const txt = blob && blob.text ? await blob.text() : '';
  const baris = (txt.match(/\r\n/g) || []).length;
  ok('CSV: header + 3 baris siswa', /Peringkat","Nama","Kelas/.test(txt) && baris === 3, JSON.stringify(txt.slice(0, 80)));
  ok('CSV: nama aneh tetap aman dalam tanda kutip', txt.includes('"<img src=x onerror=alert(1)>"'), txt.split('\r\n')[1]?.slice(0, 40));
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

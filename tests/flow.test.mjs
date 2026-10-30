// Uji alur lengkap dengan SQLite in-memory (D1 palsu).
// Jalankan: node tests/flow.test.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';

const hasil = [];
const ok = (nama, lulus, info = '') => hasil.push({ nama, lulus, info });

function buatDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  return {
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async run() {
          const r = db.prepare(sql).run(...args);
          return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
        },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) || null; }
      };
      return st;
    },
    async batch(stmts) {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    }
  };
}

const env = { DB: buatDB(), ADMIN_KEY: 'rahasia', ALLOWED_ORIGIN: '*', PAPAN_PUBLIK: '1' };
const call = (path, init = {}) => worker.fetch(new Request('https://api.test' + path, init), env);
const json = async (path, init) => {
  const r = await call(path, init);
  let d = {};
  try { d = await r.json(); } catch (e) {}
  return { status: r.status, d };
};
const post = (path, body, token) => json(path, {
  method: 'POST',
  headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
  body: JSON.stringify(body)
});
const get = (path, token) => json(path, token ? { headers: { Authorization: 'Bearer ' + token } } : {});
const del = (path, token) => json(path, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });

// 1) Daftar guru tanpa kode = coba gratis 3 hari
let guruA;
{
  const r = await post('/api/auth/register', { nama: 'Guru A', pin: '1234', role: 'guru' });
  guruA = r.d;
  ok('daftar guru tanpa kode berhasil', r.status === 200 && guruA.ok === 1, JSON.stringify(r.d));
  ok('akun guru baru langsung aktif (masa coba)', guruA.user?.active === 1 && !!guruA.user?.paid_until, JSON.stringify(guruA.user));
  ok('tenant guru terbentuk dari id', /^g\d+$/.test(guruA.user?.tenant || ''), guruA.user?.tenant);
  const me = await get('/api/auth/me', guruA.token);
  ok('token guru valid untuk /api/auth/me', me.status === 200 && me.d.user?.nama === 'Guru A', JSON.stringify(me.d));
}

// 2) Murid, soal, token, login siswa
let muridId, soalId, tokenSiswa;
{
  const m = await post('/api/murid', { nama: 'Budi', kelas: '5A', pin: '1111' }, guruA.token);
  muridId = m.d.id;
  ok('tambah murid', m.status === 200 && m.d.ok === 1, JSON.stringify(m.d));

  const s = await post('/api/soal', {
    organ: 'Mulut', level: 1, pertanyaan: 'Soal buatan guru?',
    opsi: ['A', 'B', 'C'], jawaban: 1, pembahasan: 'Karena B.'
  }, guruA.token);
  soalId = s.d.id;
  ok('tambah soal', s.status === 200 && s.d.ok === 1, JSON.stringify(s.d));

  const daftarSoal = await get('/api/soal', guruA.token);
  ok('guru melihat soal miliknya', daftarSoal.d.list?.some(x => x.id === soalId), JSON.stringify(daftarSoal.d.list));

  const t = await post('/api/token/create', {}, guruA.token);
  tokenSiswa = t.d.kode;
  ok('buat token siswa', t.status === 200 && /^[A-Z0-9]{6}$/.test(tokenSiswa || ''), JSON.stringify(t.d));

  const t2 = await post('/api/token/create', {}, guruA.token);
  ok('token hari ini tidak dobel', t2.d.kode === tokenSiswa && t2.d.lama === 1, JSON.stringify(t2.d));

  const v = await post('/api/token/validate', { kode: tokenSiswa });
  ok('validasi token mengembalikan tenant guru', v.status === 200 && v.d.tenant === guruA.user.tenant, JSON.stringify(v.d));

  const siswa = await get('/api/siswa?token=' + tokenSiswa);
  ok('daftar siswa tidak membocorkan PIN', siswa.d.list?.length === 1 && !('pin' in siswa.d.list[0]), JSON.stringify(siswa.d.list));

  const masuk = await post('/api/siswa/login', { token: tokenSiswa, id: muridId, pin: '1111' });
  ok('login siswa dengan PIN benar', masuk.status === 200 && masuk.d.siswa?.tenant === guruA.user.tenant, JSON.stringify(masuk.d));

  const salah = await post('/api/siswa/login', { token: tokenSiswa, id: muridId, pin: '9999' });
  ok('login siswa dengan PIN salah ditolak', salah.status === 401 && salah.d.e === 'pin', JSON.stringify(salah.d));

  const soalSiswa = await get('/api/soal?token=' + tokenSiswa);
  ok('siswa menerima soal guru lewat token', soalSiswa.d.list?.some(x => x.id === soalId), JSON.stringify(soalSiswa.d.list));

  const soalMentah = await get('/api/soal?tenant=' + guruA.user.tenant);
  ok('soal tidak bisa diambil dengan kode tenant mentah', (soalMentah.d.list || []).length === 0, JSON.stringify(soalMentah.d.list));
}

// 3) Log permainan masuk ke tenant guru, bukan kode token
{
  const r = await post('/api/log', {
    nama: 'Budi', kelas: '5A', tenant: tokenSiswa, token: tokenSiswa,
    mode: 'solo', level: 1, makanan: 'Nasi', skor: 300,
    jawaban: [{ o: 'Mulut', p: '', s: 0, h: 0, pt: 100, q: 'Soal buatan guru?' }]
  });
  ok('log permainan tersimpan', r.status === 200 && r.d.ok === 1, JSON.stringify(r.d));
  const rekap = await get('/api/rekap', guruA.token);
  ok('rekap guru memuat sesi siswa', rekap.d.ringkasan?.[0]?.sesi === 1, JSON.stringify(rekap.d.ringkasan));
  ok('rekap guru memuat nama siswa', rekap.d.siswa?.some(x => x.nama === 'Budi'), JSON.stringify(rekap.d.siswa));
}

// 3b) Tenant mentah dari klien tidak dipercaya
{
  const r = await post('/api/log', {
    nama: 'Penyusup', kelas: 'X', tenant: guruA.user.tenant,
    mode: 'solo', level: 1, makanan: 'Nasi', skor: 9999,
    jawaban: []
  });
  ok('log tanpa token tetap diterima', r.status === 200 && r.d.ok === 1, JSON.stringify(r.d));
  const rekap = await get('/api/rekap', guruA.token);
  ok('tenant mentah tidak bisa menyisipkan data ke rekap guru', !rekap.d.siswa?.some(x => x.nama === 'Penyusup'), JSON.stringify(rekap.d.siswa));
  ok('jumlah sesi guru tidak bertambah oleh penyusup', rekap.d.ringkasan?.[0]?.sesi === 1, JSON.stringify(rekap.d.ringkasan));
}

// 3c) Token yang kedaluwarsa saat sesi berjalan tetap dikenali untuk log
{
  await env.DB.prepare("UPDATE token SET expires_at=datetime('now','-1 day') WHERE kode=?").bind(tokenSiswa).run();
  const r = await post('/api/log', {
    nama: 'Budi', kelas: '5A', token: tokenSiswa,
    mode: 'solo', level: 1, makanan: 'Nasi', skor: 200,
    jawaban: []
  });
  ok('log dengan token kedaluwarsa tetap tersimpan', r.status === 200 && r.d.ok === 1, JSON.stringify(r.d));
  const rekap = await get('/api/rekap', guruA.token);
  ok('log token kedaluwarsa tetap masuk ke tenant guru', rekap.d.ringkasan?.[0]?.sesi === 2, JSON.stringify(rekap.d.ringkasan));
}

// 4) Isolasi antar guru
{
  const b = await post('/api/auth/register', { nama: 'Guru B', pin: '5678', role: 'guru' });
  const guruB = b.d;
  ok('guru kedua bisa daftar', b.status === 200 && guruB.ok === 1, JSON.stringify(b.d));

  const muridB = await get('/api/murid', guruB.token);
  ok('guru B tidak melihat murid guru A', (muridB.d.list || []).length === 0, JSON.stringify(muridB.d.list));

  const soalB = await get('/api/soal', guruB.token);
  ok('guru B tidak melihat soal guru A', (soalB.d.list || []).length === 0, JSON.stringify(soalB.d.list));

  const hapus = await del('/api/soal?id=' + soalId, guruB.token);
  ok('guru B tidak bisa menghapus soal guru A', hapus.status === 200 && (await get('/api/soal', guruA.token)).d.list?.some(x => x.id === soalId), JSON.stringify(hapus.d));

  const hapusMurid = await del('/api/murid?id=' + muridId, guruB.token);
  ok('guru B tidak bisa menghapus murid guru A', hapusMurid.status === 200 && (await get('/api/murid', guruA.token)).d.list?.some(x => x.id === muridId), JSON.stringify(hapusMurid.d));
}

// 5) Kode aktivasi dan perpanjangan
{
  const kode = await post('/api/owner/kode', { jumlah: 2, hari: 30 }, 'rahasia');
  ok('pemilik bisa membuat kode aktivasi', kode.status === 200 && kode.d.list?.length === 2, JSON.stringify(kode.d));
  const k1 = kode.d.list[0].kode;

  const cek = await post('/api/pay/verify', { kode: k1 });
  ok('verifikasi kode aktivasi', cek.status === 200 && cek.d.hari === 30, JSON.stringify(cek.d));

  const c = await post('/api/auth/register', { nama: 'Guru C', pin: '4321', role: 'guru', kode: k1 });
  ok('daftar dengan kode aktivasi berhasil', c.status === 200 && c.d.user?.trial === 0, JSON.stringify(c.d));

  const pakaiLagi = await post('/api/auth/register', { nama: 'Guru D', pin: '4321', role: 'guru', kode: k1 });
  ok('kode aktivasi tidak bisa dipakai dua kali', pakaiLagi.status === 400 && pakaiLagi.d.e === 'kode', JSON.stringify(pakaiLagi.d));

  const k2 = kode.d.list[1].kode;
  const sebelum = await get('/api/auth/me', guruA.token);
  const perpanjang = await post('/api/pay/redeem', { kode: k2 }, guruA.token);
  ok('perpanjang langganan guru', perpanjang.status === 200 && perpanjang.d.paid_until > sebelum.d.user.paid_until, JSON.stringify(perpanjang.d));
}

// 6) Masa aktif habis memblokir perubahan data
{
  const db = env.DB;
  const st = db.prepare("UPDATE users SET paid_until=datetime('now','-1 day') WHERE id=?");
  await st.bind(guruA.user.id).run();
  const t = await post('/api/token/create', {}, guruA.token);
  ok('guru kedaluwarsa tidak bisa membuat token', t.status === 403 && t.d.e === 'expired', JSON.stringify(t.d));
  const m = await post('/api/murid', { nama: 'Baru' }, guruA.token);
  ok('guru kedaluwarsa tidak bisa menambah murid', m.status === 403 && m.d.e === 'expired', JSON.stringify(m.d));
  const baca = await get('/api/murid', guruA.token);
  ok('guru kedaluwarsa masih bisa membaca data', baca.status === 200, JSON.stringify(baca.d));
}

const lulus = hasil.filter(x => x.lulus).length;
for (const x of hasil) console.log((x.lulus ? 'PASS ' : 'FAIL ') + x.nama + (x.info && !x.lulus ? '  -> ' + x.info : ''));
console.log(`\n${lulus}/${hasil.length} lulus`);
process.exit(lulus === hasil.length ? 0 : 1);

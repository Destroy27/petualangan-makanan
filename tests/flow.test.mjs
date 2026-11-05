// Uji alur lengkap dengan SQLite in-memory (D1 palsu).
// Jalankan: node tests/flow.test.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { PEMBAYARAN_AKTIF } from '../worker.js';

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

// 1) Daftar guru tanpa kode. Jika pembayaran aktif: menunggu pembayaran. Jika nonaktif: langsung aktif.
let guruA;
{
  const r = await post('/api/auth/register', { nama: 'Guru A', pin: '1234', role: 'guru' });
  guruA = r.d;
  ok('daftar guru tanpa kode berhasil', r.status === 200 && guruA.ok === 1, JSON.stringify(r.d));
  ok('tenant guru terbentuk dari id', /^g\d+$/.test(guruA.user?.tenant || ''), guruA.user?.tenant);
  if (PEMBAYARAN_AKTIF) {
    ok('akun baru tanpa kode belum aktif (mencegah penyalahgunaan trial)', guruA.user?.active === 0 && !guruA.user?.paid_until, JSON.stringify(guruA.user));
    const blokToken = await post('/api/token/create', {}, guruA.token);
    ok('akun belum bayar tidak bisa membuat token', blokToken.status === 403 && blokToken.d.e === 'expired', JSON.stringify(blokToken.d));
    const kodeAwal = await post('/api/owner/kode', { jumlah: 1, hari: 3 }, 'rahasia');
    const aktifkan = await post('/api/pay/redeem', { kode: kodeAwal.d.list[0].kode }, guruA.token);
    ok('akun aktif setelah redeem kode', aktifkan.status === 200 && !!aktifkan.d.paid_until, JSON.stringify(aktifkan.d));
  } else {
    ok('pembayaran nonaktif: akun baru langsung aktif', guruA.user?.active === 1, JSON.stringify(guruA.user));
  }
  const me = await get('/api/auth/me', guruA.token);
  ok('token guru valid untuk /api/auth/me dan aktif', me.status === 200 && me.d.user?.nama === 'Guru A' && !!me.d.user?.active, JSON.stringify(me.d));
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

  const regMandiri = await post('/api/siswa/register', { token: tokenSiswa, nama: 'Citra Mandiri', kelas: '5A', pin: '2222' });
  ok('siswa bisa input nama sendiri lewat token', regMandiri.status === 200 && regMandiri.d.siswa?.nama === 'Citra Mandiri', JSON.stringify(regMandiri.d));

  const bulk = await post('/api/murid', { list: [{ nama: 'Dodi', kelas: '5B' }, { nama: 'Eka', kelas: '5B' }] }, guruA.token);
  ok('guru bisa tambah banyak murid sekaligus', bulk.status === 200 && bulk.d.added === 2, JSON.stringify(bulk.d));

  const editM = await json('/api/murid', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + guruA.token },
    body: JSON.stringify({ id: muridId, nama: 'Budi', kelas: '5A', pin: '1111' })
  });
  ok('guru bisa edit data murid (PUT /api/murid)', editM.status === 200 && editM.d.ok === 1, JSON.stringify(editM.d));

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

  const papan5A = await get('/api/papan?tenant=' + guruA.user.tenant + '&kelas=5A');
  const papan5B = await get('/api/papan?tenant=' + guruA.user.tenant + '&kelas=5B');
  ok('papan peringkat terfilter per kelas murid', papan5A.d.top?.length === 1 && (papan5B.d.top || []).length === 0, JSON.stringify({ a: papan5A.d.top, b: papan5B.d.top }));

  const tambahHasil = await post('/api/rekap', { nama: 'Fajar Manual', kelas: '5B', skor: 450 }, guruA.token);
  ok('guru bisa tambah nilai manual (POST /api/rekap)', tambahHasil.status === 200 && tambahHasil.d.ok === 1, JSON.stringify(tambahHasil.d));

  const editHasil = await json('/api/rekap', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + guruA.token },
    body: JSON.stringify({ old_nama: 'Fajar Manual', old_kelas: '5B', nama: 'Fajar Edit', kelas: '5B', skor: 550 })
  });
  ok('guru bisa edit data hasil (PUT /api/rekap)', editHasil.status === 200 && editHasil.d.ok === 1, JSON.stringify(editHasil.d));

  const hapusHasil = await del('/api/rekap?nama=' + encodeURIComponent('Fajar Edit') + '&kelas=5B', guruA.token);
  ok('guru bisa hapus data hasil (DELETE /api/rekap)', hapusHasil.status === 200 && hapusHasil.d.ok === 1, JSON.stringify(hapusHasil.d));
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
  ok('guru B tidak bisa menghapus soal guru A', (hapus.status === 200 || hapus.status === 403) && (await get('/api/soal', guruA.token)).d.list?.some(x => x.id === soalId), JSON.stringify(hapus.d));

  const hapusMurid = await del('/api/murid?id=' + muridId, guruB.token);
  ok('guru B tidak bisa menghapus murid guru A', (hapusMurid.status === 200 || hapusMurid.status === 403) && (await get('/api/murid', guruA.token)).d.list?.some(x => x.id === muridId), JSON.stringify(hapusMurid.d));
}

// 5) Kode aktivasi (tetap berfungsi saat pembayaran nonaktif)
{
  const kode = await post('/api/owner/kode', { jumlah: 2, hari: 30 }, 'rahasia');
  ok('pemilik bisa membuat kode aktivasi', kode.status === 200 && kode.d.list?.length === 2, JSON.stringify(kode.d));
  const k1 = kode.d.list[0].kode;

  if (PEMBAYARAN_AKTIF) {
    const cek = await post('/api/pay/verify', { kode: k1 });
    ok('verifikasi kode aktivasi', cek.status === 200 && cek.d.hari === 30, JSON.stringify(cek.d));
  }

  const c = await post('/api/auth/register', { nama: 'Guru C', pin: '4321', role: 'guru', kode: k1 });
  ok('daftar dengan kode aktivasi berhasil', c.status === 200 && c.d.user?.trial === 0 && c.d.user?.active === 1, JSON.stringify(c.d));

  const pakaiLagi = await post('/api/auth/register', { nama: 'Guru D', pin: '4321', role: 'guru', kode: k1 });
  ok('kode aktivasi tidak bisa dipakai dua kali', pakaiLagi.status === 400 && pakaiLagi.d.e === 'kode', JSON.stringify(pakaiLagi.d));

  if (PEMBAYARAN_AKTIF) {
    const k2 = kode.d.list[1].kode;
    const sebelum = await get('/api/auth/me', guruA.token);
    const perpanjang = await post('/api/pay/redeem', { kode: k2 }, guruA.token);
    ok('perpanjang langganan guru', perpanjang.status === 200 && perpanjang.d.paid_until > sebelum.d.user.paid_until, JSON.stringify(perpanjang.d));
  }
}

// 6) Masa aktif habis memblokir perubahan data (hanya saat pembayaran aktif)
if (PEMBAYARAN_AKTIF) {
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

// 7) Webhook pembayaran otomatis Midtrans (dengan verifikasi SHA-512, hanya saat pembayaran aktif)
if (PEMBAYARAN_AKTIF) {
  env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-test123';
  const orderId = 'PCN-' + guruA.user.id + '-TEST1';
  await env.DB.prepare(
    "INSERT INTO pesanan(order_id,user_id,paket,hari,harga,status,snap_token,snap_url) VALUES(?,?,'mingguan',7,20000,'pending','tok1','https://snap.test')"
  ).bind(orderId, guruA.user.id).run();

  const buruk = await post('/api/pay/webhook', {
    order_id: orderId, status_code: '200', gross_amount: '20000.00',
    transaction_status: 'settlement', signature_key: 'palsu'
  });
  ok('webhook Midtrans signature salah ditolak 403', buruk.status === 403, JSON.stringify(buruk.d));

  const raw = new TextEncoder().encode(orderId + '200' + '20000.00' + env.MIDTRANS_SERVER_KEY);
  const buf = await crypto.subtle.digest('SHA-512', raw);
  const sig = [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');

  const sah = await post('/api/pay/webhook', {
    order_id: orderId, status_code: '200', gross_amount: '20000.00',
    transaction_status: 'settlement', signature_key: sig
  });
  ok('webhook Midtrans sah mengaktifkan langganan guru', sah.status === 200 && sah.d.status === 'paid', JSON.stringify(sah.d));

  const me = await get('/api/auth/me', guruA.token);
  ok('guru kembali aktif setelah pembayaran Midtrans', !!me.d.user?.active, JSON.stringify(me.d.user));
}

// 8) Pembayaran dimatikan sementara: endpoint pembayaran harus menolak
if (!PEMBAYARAN_AKTIF) {
  const bayar = await post('/api/pay/create', { paket: 'harian' }, guruA.token);
  ok('pembayaran nonaktif: /api/pay/create ditolak 503', bayar.status === 503 && bayar.d.e === 'nonaktif', JSON.stringify(bayar.d));
  const hook = await post('/api/pay/webhook', { order_id: 'X' });
  ok('pembayaran nonaktif: webhook ditolak 503', hook.status === 503, JSON.stringify(hook.d));
  const tok = await post('/api/token/create', {}, guruA.token);
  ok('pembayaran nonaktif: guru tetap bisa membuat token', tok.status === 200 && /^[A-Z0-9]{6}$/.test(tok.d.kode || ''), JSON.stringify(tok.d));
}

const lulus = hasil.filter(x => x.lulus).length;
for (const x of hasil) console.log((x.lulus ? 'PASS ' : 'FAIL ') + x.nama + (x.info && !x.lulus ? '  -> ' + x.info : ''));
console.log(`\n${lulus}/${hasil.length} lulus`);
process.exit(lulus === hasil.length ? 0 : 1);

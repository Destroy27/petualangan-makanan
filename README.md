# 🍽️ Petualangan Makanan — Sistem Pencernaan

Game edukasi IPA (sistem pencernaan) satu halaman HTML + Cloudflare Worker & D1 untuk merekap hasil
belajar siswa. Tanpa framework, tanpa build step: buka filenya, langsung jalan.

- **Game**: `game-pencernaan.html` (HTML + CSS + JS jadi satu berkas, peta tubuh berupa gambar embedded)
- **Backend rekap**: `worker.js` (Cloudflare Worker) + `schema.sql` (D1)
- **Rekap guru**: halaman `/admin` yang dilayani Worker, dilindungi kunci admin

## Isi repo

| Berkas | Keterangan |
|---|---|
| `game-pencernaan.html` | Game lengkap. Satu-satunya berkas yang perlu di-hosting untuk siswa. |
| `worker.js` | API penerima hasil (`POST /api/log`), rekap (`GET /api/rekap`), halaman guru (`/admin`). |
| `schema.sql` | Skema tabel `sesi` & `jawaban` + indeks. |
| `wrangler.toml` | Konfigurasi Worker, binding D1, dan `ALLOWED_ORIGIN`. |
| `tests/` | Uji otomatis (lihat bagian *Uji*). |

## Pemasangan

Butuh Node.js dan akun Cloudflare.

```bash
# 1. alat & login
npm i -g wrangler
wrangler login

# 2. database
wrangler d1 create pencernaan
#    salin database_id dari output ke wrangler.toml

# 3. tabel
wrangler d1 execute pencernaan --remote --file=schema.sql

# 4. kunci halaman guru (buat sendiri, jangan dibagikan ke siswa)
wrangler secret put ADMIN_KEY

# 5. deploy
wrangler deploy
#    → https://pencernaan-api.<subdomain>.workers.dev
```

Lalu di `game-pencernaan.html` isi satu baris ini dengan URL Worker:

```js
const API_URL='https://pencernaan-api.<subdomain>.workers.dev';
```

Terakhir hosting game-nya. Paling mudah: unggah `game-pencernaan.html` ke repo GitHub dan aktifkan
GitHub Pages (Settings → Pages → Deploy from branch → root). Alamatnya menjadi
`https://<akun>.github.io/<repo>/game-pencernaan.html`.

> **Penting:** `ALLOWED_ORIGIN` di `wrangler.toml` harus sama dengan origin halaman game
> (contoh `https://destroy27.github.io`, tanpa garis miring di akhir dan tanpa nama repo).
> Kalau tidak cocok, Worker menolak kiriman dengan 403 dan game hanya menumpuk data di antrean browser.

Rekap guru: buka `https://pencernaan-api.<subdomain>.workers.dev/admin`, isi kunci admin.

## Konfigurasi

| Yang diubah | Di mana | Arti |
|---|---|---|
| `API_URL` | `game-pencernaan.html` (baris awal `<script>`) | Kosong = data tidak dikirim ke mana pun. |
| `ALLOWED_ORIGIN` | `wrangler.toml` | Origin yang boleh mengirim data. `*` = semua (jangan dipakai untuk data siswa). |
| `ADMIN_KEY` | `wrangler secret put ADMIN_KEY` | Kunci halaman `/admin` dan `/api/rekap`. |
| `AMBANG_GAGAL` | `worker.js` (baris 3) | % jawaban bernilai 0 per organ yang memicu saran "ulas ulang di kelas". Default 30. |
| `AMBANG_RATA` | `worker.js` | Rata-rata skor di bawah ini memicu saran pendampingan. Default 250. |
| `MIN_SESI` | `worker.js` | Minimal jumlah sesi sebelum siswa disorot. Default 2. |

## Data yang dikirim

Setiap sesi selesai, game mengirim satu objek:

```json
{
  "nama": "Budi", "kelas": "X-1", "mode": "solo", "tim": "",
  "level": 1, "makanan": "Ayam Goreng", "skor": 480,
  "jawaban": [
    { "o": "Mulut", "p": "", "s": 1, "h": 0, "pt": 70, "q": "Enzim dalam air liur ..." }
  ]
}
```

`o` organ, `p` pemain (mode tim), `s` berapa kali salah, `h` memakai petunjuk (0/1), `pt` poin soal.
**PIN tidak pernah dikirim** dan tidak pernah keluar dari `localStorage` perangkat.

Kalau jaringan gagal, kiriman disimpan di `localStorage` (`pcn_q`, maksimal 20 sesi) dan dikirim ulang
otomatis saat game dibuka lagi.

Tabel `sesi` menyimpan satu baris per permainan; `jawaban` menyimpan detail per soal (maksimal 12 baris
per sesi, teks soal dipotong 160 karakter). Waktu memakai jam WITA (`datetime('now','+8 hours')` —
ubah di `schema.sql` kalau perlu).

## Rekap untuk guru

`/admin` menampilkan:

- **Saran tindakan otomatis** — materi dengan ≥ `AMBANG_GAGAL`% jawaban gagal total, dan siswa dengan
  rata-rata < `AMBANG_RATA` dari minimal `MIN_SESI` sesi.
- **Tabel per organ** — jumlah jawaban, rata-rata salah, % gagal, % memakai petunjuk.
- **Tabel per siswa** — sesi, rata-rata, skor terbaik, waktu terakhir.
- **Soal tersulit** — 5 soal dengan rata-rata salah tertinggi (minimal 3 jawaban).

## Uji

```bash
npm install
npm test            # 51 pemeriksaan game (jsdom) + 34 pemeriksaan worker (D1 palsu)
npm run test:layout # 21 pemeriksaan tata letak & satu putaran penuh di Chrome/Edge
npm run test:all
```

`npm run test:layout` memakai Chrome atau Edge yang terpasang (lewat `playwright-core`, tanpa unduh
browser) dan menyimpan screenshot ke `tests/shots/`.

## Batasan yang perlu diketahui

- **Akun berbasis browser.** Nama, PIN (hash lokal), dan rekor tersimpan di `localStorage`. Siswa yang
  ganti perangkat harus mendaftar lagi; datanya tetap tergabung di rekap lewat nama + kelas.
- **PIN bukan autentikasi.** Ia hanya memisahkan beberapa siswa di satu perangkat.
- **Nama + kelas adalah kunci pengelompokan.** Dua siswa bernama sama di kelas sama akan tergabung.
- **Suara** memakai `speechSynthesis` perangkat. Game hanya bisa memakai suara bahasa Indonesia yang
  sudah ada; kalau belum ada, muncul petunjuk cara memasangnya. Di Windows, Edge biasanya punya suara
  Indonesia "Natural" yang lebih halus.
- **Privasi.** Nama, kelas, dan skor siswa tersimpan di database Cloudflare. Beri tahu siswa (dan orang
  tua bila perlu) serta ikuti aturan sekolah sebelum dipakai di kelas.

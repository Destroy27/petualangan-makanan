# Petualangan Makanan

Game edukasi sistem pencernaan untuk siswa, lengkap dengan panel guru untuk mengelola murid, soal, token akses harian, dan rekap nilai.

## Link penting

- Game siswa: https://destroy27.github.io/petualangan-makanan/
- Panel guru: https://destroy27.github.io/petualangan-makanan/admin.html
- API Worker: https://pencernaan-api.jejak7-api.workers.dev

Catatan: halaman `https://github.com/Destroy27/petualangan-makanan` adalah halaman repo GitHub, bukan game. Bagikan link GitHub Pages di atas ke siswa dan guru.

## Alur guru

1. Buka panel guru.
2. Pilih **Daftar Baru**.
3. Isi nama dan PIN. Kolom kode aktivasi boleh dikosongkan untuk mencoba gratis 3 hari.
4. Setelah masuk, buat **token akses siswa** untuk hari ini.
5. Tambah murid, maksimal 50 per akun.
6. Tambah soal tambahan bila perlu. Soal otomatis masuk ke game sesuai organ dan level.
7. Bagikan token ke siswa.
8. Buka **Rekap nilai** untuk melihat hasil dan mengunduh CSV.
9. Perpanjang masa aktif dengan kode aktivasi dari pemilik.

## Alur siswa

1. Buka game siswa.
2. Masukkan token dari guru.
3. Pilih nama, lalu masukkan PIN bila guru memasang PIN.
4. Main dan selesaikan 6 organ pencernaan.

## Kode aktivasi

Kode aktivasi dipakai untuk membuka masa aktif guru selama 30 hari. Satu kode hanya bisa dipakai satu kali.

Cara membuat kode:

1. Buka panel guru.
2. Klik **Panel pemilik** di bagian bawah halaman.
3. Masukkan `ADMIN_KEY`.
4. Tentukan jumlah kode dan masa aktif, lalu klik **Buat kode**.
5. Kirim kode ke guru setelah pembayaran diterima.

Harga langganan tidak diatur di aplikasi. Pemilik bebas menentukan harga dan mengirim kode secara manual setelah pembayaran. Model ini dipakai agar tidak bergantung pada payment gateway pada tahap awal.

## Isi repo

| Berkas | Keterangan |
|---|---|
| `index.html` | Halaman awal untuk memilih peran siswa atau guru. |
| `game-pencernaan.html` | Game lengkap dalam satu berkas. |
| `ui.css`, `ui.js` | Gaya bersama: tombol imut, suara tombol, makanan berbentuk asli berwajah, tombol suara. Dipakai semua halaman. |
| `admin.html` | Panel guru dan panel pemilik. |
| `worker.js` | API Cloudflare Worker untuk akun, token, murid, soal, pembayaran, dan rekap. |
| `schema.sql` | Skema D1: `users`, `murid`, `soal`, `token`, `kode_bayar`, `sesi`, `jawaban`. |
| `wrangler.toml` | Konfigurasi Worker, binding D1, dan `ALLOWED_ORIGIN`. |
| `tests/` | Uji otomatis worker, alur, game, dan tata letak. |

## Pemasangan

Butuh Node.js dan akun Cloudflare.

```bash
# 1. alat dan login
npm i -g wrangler
wrangler login

# 2. database
wrangler d1 create pencernaan
# salin database_id dari output ke wrangler.toml

# 3. tabel
wrangler d1 execute pencernaan --remote --file=schema.sql

# 4. kunci panel pemilik
wrangler secret put ADMIN_KEY

# 5. deploy worker
wrangler deploy
```

Untuk GitHub Pages, unggah repo ke GitHub lalu aktifkan Pages dari branch `main` folder root. Alamatnya menjadi `https://<akun>.github.io/<repo>/`.

Penting: `ALLOWED_ORIGIN` di `wrangler.toml` harus sama dengan origin GitHub Pages, misalnya `https://destroy27.github.io` tanpa garis miring di akhir.

## Konfigurasi

| Yang diubah | Di mana | Arti |
|---|---|---|
| `API_URL` | `game-pencernaan.html` dan `admin.html` | Alamat Worker. |
| `ALLOWED_ORIGIN` | `wrangler.toml` | Origin yang boleh mengakses API. |
| `ADMIN_KEY` | `wrangler secret put ADMIN_KEY` | Kunci panel pemilik dan pembuatan kode aktivasi. |
| `TRIAL_DAYS` | `worker.js` | Lama masa coba gratis. Default 3 hari. |
| `DEFAULT_DAYS` | `worker.js` | Lama masa aktif per kode aktivasi. Default 30 hari. |
| `AMBANG_GAGAL` | `worker.js` | Persentase jawaban gagal per organ yang memicu saran ulang. |
| `AMBANG_RATA` | `worker.js` | Rata-rata skor minimum sebelum siswa disorot. |
| `MIN_SESI` | `worker.js` | Jumlah sesi minimum sebelum siswa disorot. |
| `PAPAN_PUBLIK` | `wrangler.toml` | `"1"` menampilkan papan skor global, `"0"` menyembunyikannya. |

## Keamanan data

- Setiap guru punya tenant sendiri, misalnya `g1`, `g2`. Murid, soal, token, dan rekap difilter per tenant.
- Guru tidak bisa menghapus atau melihat data guru lain.
- Daftar murid untuk siswa tidak mengirim PIN.
- PIN murid diperiksa di server saat siswa masuk.
- `ADMIN_KEY` hanya dipakai di panel pemilik dan tidak disimpan di browser.

## Uji

```bash
npm install
npm test            # worker + alur database + game
npm run test:layout # tata letak di Chrome/Edge
npm run test:all
```

`npm run test:layout` memakai Chrome atau Edge yang terpasang dan menyimpan screenshot ke `tests/shots/`.

## Catatan

- Game memakai suara `speechSynthesis` perangkat. Bila suara bahasa Indonesia belum terpasang, game menampilkan petunjuk.
- Papan skor publik menampilkan nama, kelas, dan skor terbaik 10 siswa. Set `PAPAN_PUBLIK = "0"` bila nama siswa tidak boleh tampil.
- Data siswa tersimpan di Cloudflare D1. Beri tahu siswa dan orang tua sesuai aturan sekolah.

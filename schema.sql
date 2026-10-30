-- Skema D1 untuk Petualangan Makanan.
-- Jalankan: wrangler d1 execute pencernaan --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS sesi(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- jam WITA (UTC+8). Ganti '+8 hours' kalau sekolahmu di zona waktu lain.
  waktu TEXT DEFAULT (datetime('now','+8 hours')),
  tenant TEXT DEFAULT '',
  nama TEXT, kelas TEXT, mode TEXT, tim TEXT,
  level INTEGER, makanan TEXT, skor INTEGER
);

CREATE TABLE IF NOT EXISTS jawaban(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesi_id INTEGER, organ TEXT, pemain TEXT,
  salah INTEGER, petunjuk INTEGER, poin INTEGER, soal TEXT
);

CREATE INDEX IF NOT EXISTS idx_sesi_nama ON sesi(nama, kelas);
CREATE INDEX IF NOT EXISTS idx_jawaban_sesi ON jawaban(sesi_id);
CREATE INDEX IF NOT EXISTS idx_jawaban_organ ON jawaban(organ);

CREATE TABLE IF NOT EXISTS soal(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT DEFAULT '',
  organ TEXT, level INTEGER DEFAULT 1,
  pertanyaan TEXT, opsi TEXT, jawaban INTEGER, pembahasan TEXT
);

CREATE TABLE IF NOT EXISTS murid(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT DEFAULT '',
  nama TEXT, kelas TEXT, pin TEXT
);

CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT DEFAULT 'siswa',
  tenant TEXT DEFAULT '',
  nama TEXT, kelas TEXT, email TEXT,
  pin_hash TEXT, token TEXT,
  created_at TEXT DEFAULT (datetime('now','+8 hours'))
);

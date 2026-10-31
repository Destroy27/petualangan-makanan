// Uji otomatis game-pencernaan.html (tanpa browser, pakai jsdom).
// Alur baru: token dari guru -> pilih murid -> PIN -> main.
// Jalankan: node tests/game.test.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const raw = readFileSync(join(ROOT, 'game-pencernaan.html'), 'utf8');
const INJECT = 'window.__t={getG:()=>G,getST:()=>ST,getTEAM:()=>TEAM,getLVL:()=>LVL,getMODEG:()=>MODEG};';
const html = raw.replace(/const API_URL='[^']*';/, "const API_URL='https://api.test';")
  .replace(/<\/script>(?![\s\S]*<\/script>)/, INJECT + '\n</script>');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, label, ms = 9000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(40); }
  throw new Error('timeout: ' + label);
};

const STUDENTS = [
  { id: 1, nama: 'A&B', kelas: 'X-1', pin: '1234' },
  { id: 2, nama: 'Budi', kelas: 'X-1', pin: '1234' },
  { id: 3, nama: 'Sari', kelas: 'IX-2', pin: '4321' },
  { id: 4, nama: 'Rani', kelas: 'X-2', pin: '1111' },
  { id: 5, nama: 'Tono', kelas: 'X-3', pin: '9999' },
  { id: 6, nama: 'Uji', kelas: '', pin: '0000' },
  { id: 7, nama: 'Dewi', kelas: 'XI-5', pin: '5555' },
  { id: 8, nama: 'Nia', kelas: 'XI-1', pin: '2222' }
];

function json(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

function mk(opts = {}) {
  const calls = [];
  const students = opts.students || STUDENTS;
  const fetchImpl = opts.fetch || (async (url, o = {}) => {
    const u = String(url);
    if (/\/api\/papan/.test(u)) {
      calls.push({ url, papan: true });
      return json({ top: opts.papan || [] });
    }
    if (/\/api\/token\/validate/.test(u)) {
      const body = JSON.parse(o.body);
      calls.push({ url, body });
      if (opts.tokenSalah) return json({ e: 'token' }, 404);
      return json({ ok: 1, tenant: 'g1', expires_at: '2026-10-31 10:00:00' });
    }
    if (/\/api\/siswa\?/.test(u)) {
      calls.push({ url });
      return json({ list: students.map(s => ({ id: s.id, nama: s.nama, kelas: s.kelas })) });
    }
    if (/\/api\/siswa\/login/.test(u)) {
      const body = JSON.parse(o.body);
      calls.push({ url, body });
      const s = students.find(x => x.id === body.id);
      if (!s) return json({ e: 'siswa' }, 404);
      if (s.pin && s.pin !== body.pin) return json({ e: 'pin' }, 401);
      return json({ ok: 1, siswa: { id: s.id, nama: s.nama, kelas: s.kelas, tenant: 'g1' } });
    }
    if (/\/api\/soal/.test(u)) {
      calls.push({ url });
      return json({ list: opts.soal || [] });
    }
    calls.push({ url, body: o.body ? JSON.parse(o.body) : null });
    return json({ ok: 1 });
  });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://siswa.github.io/game/',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = fetchImpl;
      w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = () => {};
      for (const [k, v] of Object.entries(opts.storage || {})) w.localStorage.setItem(k, v);
    }
  });
  return { dom, w: dom.window, d: dom.window.document, calls };
}

async function login(env, name, pin, { expectFail = false } = {}) {
  const { d } = env;
  d.getElementById('tk').value = 'ABC123';
  d.getElementById('vtoken').click();
  await until(() => d.getElementById('studentPick').style.display === 'block', 'pilih siswa');
  const sel = d.getElementById('st');
  const opt = [...sel.options].find(o => o.textContent.startsWith(name));
  if (!opt) throw new Error('siswa tidak ada: ' + name);
  sel.value = opt.value;
  d.getElementById('sp').value = pin;
  d.getElementById('lg').click();
  if (expectFail) { await sleep(120); return; }
  await until(() => d.getElementById('s-start').classList.contains('on'), 'layar awal');
}

async function answer(env, { hint = false, wrongFirst = 0 } = {}) {
  const { d } = env;
  await until(() => d.querySelectorAll('#qbody .opt').length, 'opsi muncul');
  const G = env.w.__t.getG();
  const correct = G.q[2];
  const btns = [...d.querySelectorAll('#qbody .opt')];
  const rec = { q: G.q[0], correctText: G.q[1][correct], wrong: 0, hint: false, pts: null };
  if (hint) {
    d.getElementById('hint').click();
    rec.hint = d.getElementById('hint').disabled === true;
    const dis = [...d.querySelectorAll('#qbody .opt')].filter(b => b.disabled);
    rec.disabledOpts = dis.length;
    rec.hintTargetsWrong = dis.every(b => +b.dataset.i !== correct);
  }
  const wrongOnes = btns.filter(b => +b.dataset.i !== correct).slice(0, wrongFirst);
  for (const b of wrongOnes) { b.click(); rec.wrong++; await sleep(30); }
  d.querySelector(`#qbody .opt[data-i="${correct}"]`).click();
  const fb = d.getElementById('fb').textContent;
  const m = fb.match(/\+(\d+)/);
  rec.pts = m ? +m[1] : 0;
  rec.fb = fb;
  return rec;
}

async function nextOrFinish(env, last) {
  const { d } = env;
  const btn = await until(() => d.getElementById('next'), 'tombol lanjut');
  btn.click();
  if (!last) await sleep(50);
}

const results = [];
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); };

async function scenarioSolo() {
  const env = mk();
  const { w, d } = env;
  await login(env, 'A&B', '1234');
  ok('login token masuk ke layar awal', true, d.getElementById('who').textContent);
  ok('nama ditampilkan apa adanya', d.getElementById('who').textContent.includes('A&B'), d.getElementById('who').textContent);

  d.querySelector('#foods .food[data-i="2"]').click();
  ok('pilih makanan mengaktifkan tombol mulai', d.getElementById('go').disabled === false);
  d.getElementById('go').click();
  await until(() => d.getElementById('s-game').classList.contains('on'), 'layar game');

  for (let i = 0; i < 6; i++) {
    await answer(env, {});
    if (i === 3) ok('pembahasan khusus makanan muncul di organ ke-4', /Khusus Ayam Goreng/.test(d.getElementById('qbody').textContent));
    await nextOrFinish(env, i === 5);
  }
  await until(() => d.getElementById('s-end').classList.contains('on'), 'layar hasil');
  const end = d.getElementById('end').textContent;
  ok('skor 6 jawaban benar pertama = 600', /600/.test(end), end.slice(0, 60));

  const pengiriman = env.calls.filter(c => /\/api\/log$/.test(c.url));
  ok('satu kiriman ke worker', pengiriman.length === 1, String(pengiriman.length));
  const p = pengiriman[0]?.body || {};
  ok('payload lengkap', ['nama', 'kelas', 'mode', 'level', 'makanan', 'skor', 'jawaban'].every(k => k in p), Object.keys(p).join(','));
  ok('nama mentah (bukan HTML-escape) & kelas terkirim', p.nama === 'A&B' && p.kelas === 'X-1', p.nama + ' / ' + p.kelas);
  ok('tenant dan token ikut terkirim', p.tenant === 'g1' && p.token === 'ABC123', p.tenant + ' / ' + p.token);
  ok('mode solo', p.mode === 'solo', p.mode);
  ok('skor 600', p.skor === 600, String(p.skor));
  ok('6 baris detail soal', Array.isArray(p.jawaban) && p.jawaban.length === 6, String(p.jawaban?.length));
  ok('detail soal berisi organ/salah/petunjuk/poin', p.jawaban?.every(j => j.o && j.s === 0 && j.h === 0 && j.pt === 100 && j.q), JSON.stringify(p.jawaban?.[0]));
  ok('PIN tidak ikut terkirim', !JSON.stringify(p).includes('1234'));
  ok('semua organ terwakili', new Set(p.jawaban?.map(j => j.o)).size === 6, [...new Set(p.jawaban?.map(j => j.o))].join('|'));

  const st = [...d.querySelectorAll('#stepsTop .stp')].map(x => x.textContent);
  ok('daftar organ memakai penanda benar/aktif/netral', st.filter(t => t.startsWith('✅')).length === 5 && /📍 Anus/.test(st.join(' ')), st.join(' '));
  ok('daftar organ dirender di panel & di samping peta', d.querySelectorAll('#stepsTop .stp').length === 6 && d.querySelectorAll('#steps .stp').length === 6);
  d.getElementById('out').click();
  ok('papan skor meng-escape nama', /A&amp;B/.test(d.getElementById('lb').innerHTML), d.getElementById('lb').innerHTML.slice(0, 80));

  const log = JSON.parse(w.localStorage.getItem('pcn_users'))['s1'];
  ok('rekor lokal tersimpan', log.best === 600 && log.plays === 1, JSON.stringify({ best: log.best, plays: log.plays }));
  ok('kelas dan tenant tersimpan di akun lokal', log.kelas === 'X-1' && log.tenant === 'g1', log.kelas + ' / ' + log.tenant);
  env.dom.window.close();
}

async function scenarioSalahDanPetunjuk() {
  const env = mk();
  const { d } = env;
  await login(env, 'Sari', '4321');
  d.querySelector('#foods .food[data-i="0"]').click();
  d.getElementById('go').click();
  await until(() => d.getElementById('s-game').classList.contains('on'), 'layar game');

  const a = await answer(env, { wrongFirst: 2 });
  ok('2 kali salah lalu benar = 40 poin', a.pts === 40, a.fb);
  ok('nyawa berkurang terlihat di HUD', /❤️|🖤/.test(d.getElementById('hl').textContent), d.getElementById('hl').textContent);
  await nextOrFinish(env, false);

  const b = await answer(env, { hint: true });
  ok('petunjuk menonaktifkan tepat 1 opsi salah', b.disabledOpts === 1 && b.hint && b.hintTargetsWrong, JSON.stringify(b));
  ok('petunjuk memotong 20 poin (80)', b.pts === 80, b.fb);
  await nextOrFinish(env, false);

  for (let i = 2; i < 6; i++) { await answer(env, {}); await nextOrFinish(env, i === 5); }
  await until(() => d.getElementById('s-end').classList.contains('on'), 'layar hasil');
  const p = env.calls.find(c => /\/api\/log$/.test(c.url))?.body;
  ok('detail salah tercatat (s=2)', p.jawaban[0].s === 2, JSON.stringify(p.jawaban[0]));
  ok('detail petunjuk tercatat (h=1)', p.jawaban[1].h === 1, JSON.stringify(p.jawaban[1]));
  ok('poin per soal sesuai', p.jawaban.map(j => j.pt).join(',') === '40,80,100,100,100,100', p.jawaban.map(j => j.pt).join(','));
  env.dom.window.close();
}

async function scenarioTim() {
  const env = mk();
  const { d } = env;
  await login(env, 'Rani', '1111');
  d.querySelector('#gm .chip[data-v="tim"]').click();
  ok('kolom nama tim muncul', d.getElementById('tm').style.display === 'block', d.getElementById('tm').style.display);
  d.getElementById('tn').value = 'Ani, Dodi';
  d.querySelector('#foods .food[data-i="1"]').click();
  d.getElementById('go').click();
  await until(() => d.getElementById('s-game').classList.contains('on'), 'layar game');
  await until(() => d.querySelectorAll('#qbody .opt').length, 'opsi');
  ok('giliran pemain tampil di panel', /Giliran:/.test(d.getElementById('panel').textContent), d.querySelector('#qbody .intro').textContent.slice(0, 60));
  for (let i = 0; i < 6; i++) { await answer(env, {}); await nextOrFinish(env, i === 5); }
  await until(() => d.getElementById('s-end').classList.contains('on'), 'layar hasil');
  ok('skor anggota tim tampil', /Ani/.test(d.getElementById('end').textContent) && /Dodi/.test(d.getElementById('end').textContent));
  const p = env.calls.find(c => /\/api\/log$/.test(c.url))?.body;
  ok('mode tim terkirim', p.mode === 'tim', p.mode);
  ok('nama tim terkirim', p.tim === 'Ani, Dodi', p.tim);
  ok('pemain bergantian per soal', p.jawaban.map(j => j.p).join(',') === 'Ani,Dodi,Ani,Dodi,Ani,Dodi', p.jawaban.map(j => j.p).join(','));
  env.dom.window.close();
}

async function scenarioTokenSalah() {
  const env = mk({ tokenSalah: true });
  const { d } = env;
  d.getElementById('tk').value = 'SALAH1';
  d.getElementById('vtoken').click();
  await sleep(120);
  ok('token salah ditolak dengan pesan jelas', /tidak valid|kedaluwarsa/i.test(d.getElementById('lm').textContent), d.getElementById('lm').textContent);
  ok('pilihan siswa tidak muncul saat token salah', d.getElementById('studentPick').style.display !== 'block', d.getElementById('studentPick').style.display);
  env.dom.window.close();
}

async function scenarioLevelDanSuara() {
  const env = mk();
  const { d } = env;
  await login(env, 'Uji', '0000');
  ok('tanpa suara Indonesia muncul peringatan', /belum terpasang|tidak mendukung/i.test(d.getElementById('vs').textContent), d.getElementById('vs').textContent);
  ok('dropdown suara disembunyikan saat tidak ada suara id', d.getElementById('vsel').style.display === 'none', d.getElementById('vsel').style.display);

  d.querySelector('#lv .chip[data-v="0"]').click();
  ok('level Pemula tersimpan', env.w.__t.getLVL() === 0, String(env.w.__t.getLVL()));
  d.querySelector('#md .chip[data-v="1"]').click();
  d.querySelector('#foods .food[data-i="4"]').click();
  d.getElementById('go').click();
  await until(() => d.querySelectorAll('#qbody .opt').length, 'opsi');
  const G = env.w.__t.getG();
  ok('level 0 memakai bank soal mudah + kartu materi', /💡 Materi:/.test(d.getElementById('qbody').textContent));
  ok('soal level 0 berasal dari bank mudah', G.q[1].length === 4 && G.q[0].length > 0, G.q[0]);
  env.dom.window.close();
}

async function scenarioLoginUlang() {
  const env = mk();
  const { d } = env;
  await login(env, 'Budi', '9999', { expectFail: true });
  ok('PIN salah ditolak', d.getElementById('s-login').classList.contains('on') && /PIN salah/.test(d.getElementById('lm').textContent), d.getElementById('lm').textContent);
  d.getElementById('sp').value = '1234';
  d.getElementById('lg').click();
  await until(() => d.getElementById('s-start').classList.contains('on'), 'layar awal');
  ok('PIN benar diterima', true);
  env.dom.window.close();
}

async function scenarioKelas() {
  const env = mk();
  const { w } = env;
  await login(env, 'Dewi', '5555');
  const u = JSON.parse(w.localStorage.getItem('pcn_users'))['s7'];
  ok('kelas dari data guru tersimpan', u.kelas === 'XI-5', u.kelas);
  ok('tenant dari token tersimpan', u.tenant === 'g1', u.tenant);
  ok('token disimpan untuk kiriman berikutnya', u.token === 'ABC123', u.token);
  env.dom.window.close();
}

async function scenarioMainLagi() {
  const env = mk();
  const { w, d } = env;
  await login(env, 'Nia', '2222');
  d.querySelector('#foods .food[data-i="1"]').click();
  d.getElementById('go').click();
  await until(() => d.getElementById('s-game').classList.contains('on'), 'layar game');
  for (let i = 0; i < 6; i++) { await answer(env, {}); await nextOrFinish(env, i === 5); }
  await until(() => d.getElementById('s-end').classList.contains('on'), 'layar hasil');
  d.getElementById('again').click();
  ok('Main Lagi kembali ke layar awal dan memilih makanan lagi', d.getElementById('s-start').classList.contains('on') && d.getElementById('go').disabled === true);
  d.querySelector('#foods .food[data-i="2"]').click();
  d.getElementById('go').click();
  await until(() => d.getElementById('s-game').classList.contains('on'), 'game putaran 2');
  for (let i = 0; i < 6; i++) { await answer(env, {}); await nextOrFinish(env, i === 5); }
  await until(() => d.getElementById('s-end').classList.contains('on'), 'hasil putaran 2');
  const p = env.calls.filter(c => /\/api\/log$/.test(c.url)).map(c => c.body);
  ok('putaran 2 mengirim sesi terpisah (bukan menumpuk)', p.length === 2 && p[1].skor === 600 && p[1].jawaban.length === 6, JSON.stringify(p.map(x => ({ s: x.skor, n: x.jawaban.length, m: x.makanan }))));
  const u = JSON.parse(w.localStorage.getItem('pcn_users'))['s8'];
  ok('rekor lokal: main 2x', u.plays === 2 && u.best === 600, JSON.stringify({ plays: u.plays, best: u.best }));
  env.dom.window.close();
}

async function scenarioPapan() {
  const env = mk({ papan: [{ nama: 'Sari', kelas: 'X-2', maks: 600, sesi: 3 }, { nama: 'Budi', kelas: 'X-1', maks: 450, sesi: 2 }, { nama: '<b>Nakal</b>', kelas: 'X-1', maks: 10, sesi: 1 }] });
  const { d } = env;
  await login(env, 'Budi', '1234');
  await until(() => /semua perangkat/.test(d.getElementById('lb').textContent), 'papan global');
  const lb = d.getElementById('lb');
  ok('papan skor global tampil (bukan hanya perangkat ini)', /semua perangkat/.test(lb.textContent), lb.textContent.slice(0, 60));
  ok('papan global urut dari skor tertinggi', lb.querySelectorAll('.row')[0].textContent.includes('Sari'), lb.querySelector('.row').textContent);
  ok('baris siswa sendiri ditandai', !!lb.querySelector('.row.me') && /Budi/.test(lb.querySelector('.row.me').textContent), lb.querySelector('.row.me')?.textContent || 'tidak ada');
  ok('nama di papan global di-escape', lb.textContent.includes('<b>Nakal</b>') && !lb.querySelector('.row img'), [...lb.querySelectorAll('.row')].map(x => x.textContent).join('|'));
  env.dom.window.close();

  const env2 = mk({ papan: [] });
  await login(env2, 'Tono', '9999');
  await sleep(250);
  ok('server kosong -> papan lokal tetap dipakai', /perangkat ini/.test(env2.d.getElementById('lb').textContent), env2.d.getElementById('lb').textContent.slice(0, 60));
  env2.dom.window.close();
}

async function scenarioSoalGuru() {
  const env = mk({ soal: [{ id: 1, organ: 'Mulut', level: 1, pertanyaan: 'Soal buatan guru?', opsi: '["A","B","C"]', jawaban: 1, pembahasan: 'Karena B.' }] });
  await login(env, 'A&B', '1234');
  const ST = env.w.__t.getST();
  const item = ST[0].q.find(q => q[0] === 'Soal buatan guru?');
  ok('soal tambahan guru masuk ke bank soal', !!item, JSON.stringify(ST[0].q));
  ok('pembahasan soal guru ikut tersimpan', item && item[3] === 'Karena B.', JSON.stringify(item));
  env.dom.window.close();
}

const scenarios = [scenarioSolo, scenarioSalahDanPetunjuk, scenarioTim, scenarioTokenSalah, scenarioLevelDanSuara, scenarioLoginUlang, scenarioKelas, scenarioMainLagi, scenarioPapan, scenarioSoalGuru];
for (const s of scenarios) {
  try { await s(); } catch (e) { ok(s.name + ' (crash)', false, e.message); }
}

const pass = results.filter(r => r.pass).length;
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.info ? '  -> ' + r.info : ''));
console.log(`\n${pass}/${results.length} lulus`);
process.exit(pass === results.length ? 0 : 1);

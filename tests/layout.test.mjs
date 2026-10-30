// Uji tata letak + satu putaran penuh di Chrome/Edge sungguhan (headless).
// Jalankan: npm run test:layout   (butuh Chrome atau Edge terpasang)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const OUT = join(ROOT, 'tests', 'shots');
mkdirSync(OUT, { recursive: true });

const INJECT = 'window.__G=()=>G;';
const html = readFileSync(join(ROOT, 'game-pencernaan.html'), 'utf8').replace('</script>', INJECT + '\n</script>');
const posts = [];
const STUDENTS = [
  { id: 1, nama: 'Budi', kelas: 'X-1' },
  { id: 2, nama: 'Sari', kelas: 'X-2' },
  { id: 3, nama: 'TabLand', kelas: 'X-3' },
  { id: 4, nama: 'TabPotret', kelas: 'X-4' }
];
const kirimJSON = (res, data) => {
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(data));
};

const server = createServer((req, res) => {
  if (req.url === '/manifest.json') {
    res.writeHead(200, { 'content-type': 'application/manifest+json' });
    return res.end(readFileSync(join(ROOT, 'manifest.json')));
  }
  if (req.url === '/sw.js') {
    res.writeHead(200, { 'content-type': 'application/javascript' });
    return res.end(readFileSync(join(ROOT, 'sw.js')));
  }
  if (req.url.startsWith('/api/papan')) return kirimJSON(res, { top: [] });
  if (req.url === '/api/token/validate') return kirimJSON(res, { ok: 1, tenant: 'g1' });
  if (req.url.startsWith('/api/siswa?')) return kirimJSON(res, { list: STUDENTS });
  if (req.url.startsWith('/api/soal')) return kirimJSON(res, { list: [] });
  if (req.url === '/api/siswa/login') {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => {
      let d = {};
      try { d = JSON.parse(b); } catch (e) {}
      const s = STUDENTS.find(x => x.id === +d.id) || STUDENTS[0];
      kirimJSON(res, { ok: 1, siswa: Object.assign({ tenant: 'g1' }, s) });
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/api/log') {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => {
      posts.push(JSON.parse(b));
      kirimJSON(res, { ok: 1 });
    });
    return;
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/html;charset=utf-8' });
  res.end(html.replace(/const API_URL='[^']*';/, `const API_URL='http://localhost:${server.address().port}';`));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://localhost:${server.address().port}/`;

const results = [];
const ok = (n, p, i = '') => results.push({ n, p, i });

let browser;
for (const channel of ['chrome', 'msedge']) {
  try { browser = await chromium.launch({ channel, headless: true }); break; } catch { }
}
if (!browser) { console.log('Chrome/Edge tidak ditemukan — lewati uji tata letak.'); process.exit(0); }

async function newPage(w = 1280, h = 800) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => ok('tanpa error JS di console', false, e.message));
  page.on('console', m => { if (m.type() === 'error') ok('tanpa error console', false, m.text().slice(0, 120)); });
  await page.goto(URL_);
  return page;
}

async function login(page, nama) {
  await page.fill('#tk', 'ABC123');
  await page.click('#vtoken');
  await page.waitForSelector('#studentPick', { state: 'visible' });
  const nilai = await page.evaluate((n) => {
    const sel = document.getElementById('st');
    const opt = [...sel.options].find(x => x.textContent.startsWith(n));
    return opt ? opt.value : '';
  }, nama);
  await page.selectOption('#st', nilai);
  await page.fill('#sp', '1234');
  await page.click('#lg');
  await page.waitForSelector('#s-start.on');
}

async function playAll(page, { wrongFirst = 0, hintAt = -1 } = {}) {
  for (let i = 0; i < 6; i++) {
    await page.waitForSelector('#qbody .opt', { timeout: 12000 });
    const correct = await page.evaluate(() => window.__G().q[2]);
    if (i === hintAt) await page.click('#hint');
    for (let k = 0; k < wrongFirst; k++) {
      const wrong = await page.evaluate(c => [...document.querySelectorAll('#qbody .opt')].find(b => +b.dataset.i !== c && !b.disabled)?.dataset.i, correct);
      if (wrong != null) { await page.click(`#qbody .opt[data-i="${wrong}"]`); await page.waitForTimeout(120); }
    }
    await page.click(`#qbody .opt[data-i="${correct}"]`);
    await page.waitForTimeout(150);
    await page.click('#next');
    if (i < 5) await page.waitForTimeout(120);
  }
}

// ---------- Desktop ----------
{
  const page = await newPage(1280, 800);
  await login(page, 'Budi');
  await page.screenshot({ path: join(OUT, '1-desktop-awal.png'), fullPage: true });

  const setCols = await page.evaluate(() => getComputedStyle(document.querySelector('.set')).gridTemplateColumns);
  ok('layar awal: pengaturan tepat dua kolom di layar lebar', setCols.trim().split(/\s+/).length === 2, setCols);

  await page.click('#foods .food[data-i="2"]');
  await page.click('#go');
  await page.waitForSelector('#qbody .opt', { timeout: 15000 });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: join(OUT, '2-desktop-soal.png') });

  const box = await page.evaluate(() => {
    const r = el => el.getBoundingClientRect();
    const map = r(document.getElementById('map')), panel = r(document.getElementById('panel')), p = document.getElementById('panel');
    return {
      mapH: Math.round(map.height), panelH: Math.round(panel.height), mapW: Math.round(map.width),
      mapRight: Math.round(map.right), panelLeft: Math.round(panel.left),
      scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
      optFont: getComputedStyle(document.querySelector('.opt')).fontSize,
      center: getComputedStyle(document.getElementById('qin')).justifyContent,
      stepsTop: getComputedStyle(document.getElementById('stepsTop')).display,
      stepsSide: getComputedStyle(document.getElementById('steps')).display,
      here: !!document.getElementById('here'),
      pageH: document.documentElement.scrollHeight, vh: innerHeight
    };
  });
  ok('desktop: peta & panel sama tinggi', Math.abs(box.mapH - box.panelH) <= 2, `map ${box.mapH} vs panel ${box.panelH}`);
  ok('desktop: peta di kiri panel di kanan', box.mapW > 300 && box.panelLeft >= box.mapRight, `map w=${box.mapW} panelLeft=${box.panelLeft}`);
  ok('desktop: isi panel di tengah', box.center === 'center', box.center);
  ok('desktop: huruf jawaban >= 16px', parseFloat(box.optFont) >= 16, box.optFont);
  ok('desktop: tanpa geser horizontal', box.scrollW <= box.clientW, `${box.scrollW}/${box.clientW}`);
  ok('desktop: daftar organ di dalam panel, salinan samping peta disembunyikan', box.stepsTop !== 'none' && box.stepsSide === 'none', `${box.stepsTop} / ${box.stepsSide}`);
  ok('desktop: halaman tidak perlu digeser', box.pageH <= box.vh + 2, `${box.pageH}/${box.vh}`);
  ok('label posisi lama sudah hilang', box.here === false);

  const steps = await page.evaluate(() => [...document.querySelectorAll('#stepsTop .stp')].map(s => s.textContent.trim()));
  ok('daftar organ tampil dengan penanda', steps.length === 6 && steps.some(s => s.startsWith('📍')), steps.join(' '));

  await playAll(page, {});
  await page.waitForSelector('#s-end.on', { timeout: 15000 });
  await page.screenshot({ path: join(OUT, '3-desktop-hasil.png'), fullPage: true });
  ok('desktop: skor akhir 600', (await page.textContent('.big')).trim() === '600');
  await page.waitForTimeout(400);
  ok('desktop: data terkirim ke worker', posts.length === 1 && posts[0].skor === 600, JSON.stringify(posts.map(p => p.skor)));
  await page.context().close();
}

// ---------- HP ----------
{
  const page = await newPage(390, 844);
  await login(page, 'Sari');
  await page.screenshot({ path: join(OUT, '4-hp-awal.png'), fullPage: true });
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.set')).gridTemplateColumns);
  ok('HP: pengaturan satu kolom', cols.trim().split(/\s+/).length === 1, cols);

  await page.click('#foods .food[data-i="0"]');
  await page.click('#go');
  await page.waitForSelector('#qbody .opt', { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, '5-hp-soal.png'), fullPage: true });
  const m = await page.evaluate(() => {
    const r = el => el.getBoundingClientRect();
    const map = r(document.getElementById('map')), panel = r(document.getElementById('panel')), steps = r(document.getElementById('steps'));
    return {
      mapW: Math.round(map.width), stepsX: Math.round(steps.left), mapRight: Math.round(map.right),
      panelTop: Math.round(panel.top), mapBottom: Math.round(map.bottom),
      scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, panelW: Math.round(panel.width),
      stepsSide: getComputedStyle(document.getElementById('steps')).display,
      stepsTop: getComputedStyle(document.getElementById('stepsTop')).display
    };
  });
  ok('HP: daftar organ di samping peta', m.stepsSide !== 'none' && m.stepsX >= m.mapRight - 4, `steps x=${m.stepsX} mapRight=${m.mapRight}`);
  ok('HP: salinan daftar di dalam panel disembunyikan', m.stepsTop === 'none', m.stepsTop);
  ok('HP: panel soal di bawah peta', m.panelTop >= m.mapBottom - 2, `panelTop=${m.panelTop} mapBottom=${m.mapBottom}`);
  ok('HP: tanpa geser horizontal', m.scrollW <= m.clientW, `${m.scrollW}/${m.clientW}`);
  ok('HP: panel selebar layar', m.panelW > 330, String(m.panelW));

  await playAll(page, { wrongFirst: 1, hintAt: 2 });
  await page.waitForSelector('#s-end.on', { timeout: 15000 });
  await page.screenshot({ path: join(OUT, '6-hp-hasil.png'), fullPage: true });
  await page.waitForTimeout(400);
  const last = posts[posts.length - 1];
  ok('HP: kiriman kedua masuk', posts.length === 2, String(posts.length));
  ok('HP: detail salah & petunjuk tercatat', last.jawaban[0].s === 1 && last.jawaban[2].h === 1, JSON.stringify([last.jawaban[0], last.jawaban[2]]));
  await page.context().close();
}

// ---------- Tablet ----------
{
  const page = await newPage(1024, 600);
  await login(page, 'TabLand');
  await page.click('#foods .food[data-i="0"]');
  await page.click('#go');
  await page.waitForSelector('#qbody .opt', { timeout: 15000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, '7-tablet-1024x600.png') });
  const t = await page.evaluate(() => {
    const r = el => el.getBoundingClientRect();
    const map = r(document.getElementById('map')), panel = r(document.getElementById('panel')), qb = document.getElementById('qbody');
    return {
      mapH: Math.round(map.height), mapW: Math.round(map.width), panelH: Math.round(panel.height), panelW: Math.round(panel.width),
      qbBottom: Math.round(qb.getBoundingClientRect().bottom), panelBottom: Math.round(panel.bottom),
      scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
      pageH: document.documentElement.scrollHeight, vh: innerHeight, dapatScroll: qb.scrollHeight > qb.clientHeight + 1
    };
  });
  ok('tablet 1024x600: peta & panel sama tinggi', Math.abs(t.mapH - t.panelH) <= 2, `map ${t.mapH} vs panel ${t.panelH}`);
  ok('tablet 1024x600: isi panel tidak keluar dari kartu', t.qbBottom <= t.panelBottom + 1, `${t.qbBottom}/${t.panelBottom}`);
  ok('tablet 1024x600: panel tetap lebar (>=360px)', t.panelW >= 360, `${t.panelW}px`);
  ok('tablet 1024x600: tanpa geser horizontal', t.scrollW <= t.clientW, `${t.scrollW}/${t.clientW}`);
  ok('tablet 1024x600: halaman tidak melebar ke bawah', t.pageH <= t.vh + 2, `${t.pageH}/${t.vh}`);
  await page.context().close();
}
{
  const page = await newPage(800, 1280);
  await login(page, 'TabPotret');
  await page.click('#foods .food[data-i="0"]');
  await page.click('#go');
  await page.waitForSelector('#qbody .opt', { timeout: 15000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, '8-tablet-800x1280.png') });
  const t = await page.evaluate(() => {
    const r = el => el.getBoundingClientRect();
    return {
      panelW: Math.round(r(document.getElementById('panel')).width), mapH: Math.round(r(document.getElementById('map')).height),
      stepsSide: getComputedStyle(document.getElementById('steps')).display,
      scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth
    };
  });
  ok('tablet potret 800px: panel selebar layar (tata letak HP)', t.panelW > 700 && t.stepsSide !== 'none', `panel ${t.panelW}px, steps ${t.stepsSide}`);
  ok('tablet potret 800px: peta tidak memakan seluruh tinggi', t.mapH <= 420, `${t.mapH}px`);
  ok('tablet potret 800px: tanpa geser horizontal', t.scrollW <= t.clientW, `${t.scrollW}/${t.clientW}`);
  await page.context().close();
}

await browser.close();
server.close();

const pass = results.filter(r => r.p).length;
for (const r of results) console.log((r.p ? 'PASS ' : 'FAIL ') + r.n + (r.i ? '  → ' + r.i : ''));
console.log(`\n${pass}/${results.length} lulus`);
console.log('Screenshot: ' + OUT);
process.exit(pass === results.length ? 0 : 1);

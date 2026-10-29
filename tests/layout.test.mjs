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

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/log') {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => {
      posts.push(JSON.parse(b));
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end('{"ok":1}');
    });
    return;
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/html;charset=utf-8' });
  res.end(html.replace("const API_URL='';", `const API_URL='http://localhost:${server.address().port}';`));
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
  await page.fill('#un', 'Budi');
  await page.fill('#pw', '1234');
  await page.fill('#kl', 'X-1');
  await page.click('#lg');
  await page.waitForSelector('#s-start.on');
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
      center: getComputedStyle(document.getElementById('qbody')).justifyContent,
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
  await page.fill('#un', 'Sari'); await page.fill('#pw', '1234'); await page.fill('#kl', 'X-2');
  await page.click('#lg');
  await page.waitForSelector('#s-start.on');
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
  const page = await newPage(820, 1180);
  await page.fill('#un', 'Tablet'); await page.fill('#pw', '1234'); await page.click('#lg');
  await page.waitForSelector('#s-start.on');
  await page.click('#foods .food[data-i="0"]');
  await page.click('#go');
  await page.waitForSelector('#qbody .opt', { timeout: 15000 });
  await page.waitForTimeout(1200);
  const t = await page.evaluate(() => {
    const r = el => el.getBoundingClientRect();
    return { panelW: Math.round(r(document.getElementById('panel')).width), stepsSide: getComputedStyle(document.getElementById('steps')).display };
  });
  ok('tablet 820px: panel tidak sempit (pakai tata letak HP)', t.panelW > 700 && t.stepsSide !== 'none', `panel ${t.panelW}px, steps ${t.stepsSide}`);
  await page.context().close();
}

await browser.close();
server.close();

const pass = results.filter(r => r.p).length;
for (const r of results) console.log((r.p ? 'PASS ' : 'FAIL ') + r.n + (r.i ? '  → ' + r.i : ''));
console.log(`\n${pass}/${results.length} lulus`);
console.log('Screenshot: ' + OUT);
process.exit(pass === results.length ? 0 : 1);

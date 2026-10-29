// Cloudflare Worker + D1: menerima hasil game dan menampilkan rekap untuk guru.
// --- Ambang saran tindakan (ubah di sini) ---
const AMBANG_GAGAL = 30;   // % jawaban 0 poin per organ → materi perlu diulas
const AMBANG_RATA = 250;   // rata-rata skor per siswa di bawah ini → perlu pendampingan
const MIN_SESI = 2;        // minimal sesi sebelum siswa disorot
const PAGE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Rekap Siswa</title>
<style>body{font-family:system-ui;margin:12px;max-width:1000px}table{border-collapse:collapse;width:100%;margin:8px 0 20px;font-size:14px}td,th{border:1px solid #ccc;padding:6px;text-align:left}.w{background:#fff3cd;padding:8px;border-radius:8px;margin:4px 0}.t{overflow-x:auto}</style>
<h2>Rekap Petualangan Makanan</h2><input id=k type=password placeholder="Kunci admin"> <button onclick=go()>Muat</button><div id=o></div>
<script>
const E=s=>String(s??'').replace(/</g,'&lt;');
const T=r=>'<div class=t><table><tr>'+Object.keys(r[0]||{}).map(k=>'<th>'+k+'</th>').join('')+'</tr>'+r.map(x=>'<tr>'+Object.values(x).map(v=>'<td>'+E(v)+'</td>').join('')+'</tr>').join('')+'</table></div>';
async function go(){
 const r=await fetch('/api/rekap',{headers:{Authorization:'Bearer '+k.value}});
 if(!r.ok){o.textContent='Kunci salah';return}
 const d=await r.json();
 const a=d.organ.filter(x=>x.pct_gagal>=${AMBANG_GAGAL}).map(x=>'<div class=w>Materi <b>'+E(x.organ)+'</b>: '+x.pct_gagal+'% jawaban gagal total. Ulas ulang di kelas.</div>').join('');
 const b=d.siswa.filter(x=>x.rata<${AMBANG_RATA}&&x.sesi>=${MIN_SESI}).map(x=>'<div class=w><b>'+E(x.nama)+'</b> ('+E(x.kelas)+') rata-rata skor '+x.rata+'. Perlu pendampingan.</div>').join('');
 o.innerHTML='<h3>Saran tindakan</h3>'+(a+b||'<p>Belum ada yang menonjol.</p>')+'<h3>Per materi (organ)</h3>'+T(d.organ)+'<h3>Per siswa</h3>'+T(d.siswa)+'<h3>Soal tersulit</h3>'+T(d.soal);
}
</script>`;

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const origin = env.ALLOWED_ORIGIN || '*';
    const h = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Max-Age': '86400',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json'
    };
    const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: h });
    const cut = (s, n) => String(s ?? '').slice(0, n);
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    // Cek origin: browser dari domain lain ditolak (CORS saja tidak cukup).
    const reqOrigin = req.headers.get('Origin');
    if (origin !== '*' && reqOrigin && reqOrigin !== origin) return J({ e: 'origin' }, 403);

    if (u.pathname === '/api/log' && req.method === 'POST') {
      let d; try { d = await req.json(); } catch { return J({ e: 'json' }, 400); }
      const nama = cut(d.nama, 30).trim();
      if (!nama) return J({ e: 'nama' }, 400);
      try {
        const r = await env.DB.prepare('INSERT INTO sesi(nama,kelas,mode,tim,level,makanan,skor) VALUES(?,?,?,?,?,?,?)')
          .bind(nama, cut(d.kelas, 12), d.mode === 'tim' ? 'tim' : 'solo', cut(d.tim, 80), +d.level || 0, cut(d.makanan, 20), +d.skor || 0).run();
        const id = r.meta.last_row_id;
        const st = (Array.isArray(d.jawaban) ? d.jawaban : []).slice(0, 12).map(j =>
          env.DB.prepare('INSERT INTO jawaban(sesi_id,organ,pemain,salah,petunjuk,poin,soal) VALUES(?,?,?,?,?,?,?)')
            .bind(id, cut(j.o, 20), cut(j.p, 30), +j.s || 0, +j.h || 0, +j.pt || 0, cut(j.q, 160)));
        if (st.length) await env.DB.batch(st);
        return J({ ok: 1 });
      } catch (e) {
        return J({ e: 'db' }, 500);
      }
    }

    if (u.pathname === '/api/rekap') {
      if (!env.ADMIN_KEY || req.headers.get('Authorization') !== 'Bearer ' + env.ADMIN_KEY) return J({ e: 'unauthorized' }, 401);
      const q = s => env.DB.prepare(s).all().then(r => r.results);
      try {
        return J({
          organ: await q('SELECT organ,COUNT(*) n,ROUND(AVG(salah),2) rata_salah,ROUND(100.0*SUM(poin=0)/COUNT(*)) pct_gagal,ROUND(100.0*AVG(petunjuk)) pct_petunjuk FROM jawaban GROUP BY organ'),
          siswa: await q('SELECT nama,kelas,COUNT(*) sesi,ROUND(AVG(skor)) rata,MAX(skor) maks,MAX(waktu) terakhir FROM sesi GROUP BY nama,kelas ORDER BY rata ASC'),
          soal: await q('SELECT soal,COUNT(*) n,ROUND(AVG(salah),2) rata_salah FROM jawaban GROUP BY soal HAVING n>=3 ORDER BY rata_salah DESC LIMIT 5')
        });
      } catch (e) {
        return J({ e: 'db' }, 500);
      }
    }

    if (u.pathname === '/admin') return new Response(PAGE, { headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' } });
    return J({ ok: 1, info: 'API Petualangan Makanan' });
  }
};

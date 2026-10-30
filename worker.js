// Cloudflare Worker + D1: menerima hasil game dan menampilkan rekap untuk guru.
// --- Ambang saran tindakan (ubah di sini) ---
const AMBANG_GAGAL = 30;   // % jawaban 0 poin per organ → materi perlu diulas
const AMBANG_RATA = 250;   // rata-rata skor per siswa di bawah ini → perlu pendampingan
const MIN_SESI = 2;        // minimal sesi sebelum siswa disorot
const PAGE = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Rekap Petualangan Makanan</title>
<style>
:root{--bg:#fff7f3;--card:#fff;--ink:#3b2422;--mut:#7a5c57;--pri:#ff7a6b;--line:#f0dcd5;--warn:#fff3cd}
*{box-sizing:border-box}
body{margin:0;padding:18px;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1080px;margin:0 auto}
h1{font-size:1.5rem;margin:0 0 4px}
.hint{color:var(--mut);margin:0 0 14px;font-size:.9rem}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px}
input[type=password]{flex:1 1 220px;min-width:0;padding:10px 12px;border:2px solid var(--line);border-radius:12px;font:inherit;background:#fff;color:inherit}
button{padding:10px 16px;border:2px solid var(--line);border-radius:12px;background:#fff;color:inherit;font:inherit;font-weight:600;cursor:pointer}
button.pri{background:var(--pri);border-color:var(--pri);color:#fff}
button:disabled{opacity:.45;cursor:not-allowed}
.msg{margin:6px 0 10px;color:var(--mut);min-height:1.2em;font-size:.88rem}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:6px 0 6px}
.card{background:var(--card);border-radius:16px;padding:12px 14px;box-shadow:0 2px 0 var(--line)}
.card b{display:block;font-size:1.6rem;line-height:1.2;font-weight:700}
.card small{color:var(--mut);font-size:.76rem;text-transform:uppercase;letter-spacing:.04em}
h2{font-size:1.05rem;margin:22px 0 8px}
h2 small{font-weight:400;color:var(--mut)}
.w{background:var(--warn);border-radius:12px;padding:9px 12px;margin:6px 0;font-size:.92rem}
.empty{background:var(--card);border-radius:14px;padding:16px;color:var(--mut);font-size:.9rem}
.t{overflow-x:auto;background:var(--card);border-radius:14px;box-shadow:0 2px 0 var(--line)}
table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--mut);font-size:.74rem;text-transform:uppercase;letter-spacing:.04em;background:#fffaf8}
tbody tr:last-child td{border-bottom:0}
td.num,th.num{text-align:right}
.rk{display:inline-block;min-width:24px;font-weight:700;color:var(--mut)}
tr.top1 .rk,tr.top2 .rk,tr.top3 .rk{color:var(--pri)}
.bar2{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 4px}
.bar2 label{font-size:.88rem;color:var(--mut)}
select{padding:8px 10px;border:2px solid var(--line);border-radius:10px;font:inherit;background:#fff;color:inherit;max-width:100%}
button.rm{margin-top:8px;padding:12px 20px;border-color:var(--pri);color:var(--pri)}
@media print{.bar,.bar2,#csv,#out{display:none}body{background:#fff;padding:0}.t,.card{box-shadow:none;border:1px solid var(--line)}}
</style></head><body><div class="wrap">
<h1>🍽️ Rekap Petualangan Makanan</h1>
<p class="hint">Nilai semua siswa, per kelas, dan per materi. Kunci admin hanya disimpan di tab ini, tidak pernah dikirim ke mana pun selain server ini.</p>
<div class="bar"><input id="k" type="password" placeholder="Kunci admin" autocomplete="current-password" aria-label="Kunci admin"><button class="pri" id="go">Muat</button><button id="csv" disabled>⬇ Unduh CSV</button><button id="out" title="Hapus kunci dari tab ini">Keluar</button></div>
<p class="msg" id="msg"></p>
<div class="bar2" id="bar2" hidden><label>Kelas <select id="f"><option value="">Semua kelas</option></select></label><span class="hint" style="margin:0">Peringkat diurutkan dari skor terbaik.</span></div>
<div id="o"></div>
<div id="manage" hidden>
<h2>Kelola Soal</h2>
<form id="fsoal" style="display:grid;gap:8px;max-width:520px;margin-bottom:10px">
<input id="so_organ" placeholder="Organ (mis. Mulut)" required>
<input id="so_level" type="number" min="0" max="2" placeholder="Level (0=Pemula,1=Jagoan,2=Master)" value="1">
<input id="so_q" placeholder="Pertanyaan" required>
<input id="so_opsi" placeholder="Opsi (pisah | , mis. A|B|C|D)" required>
<input id="so_jaw" type="number" min="0" placeholder="Indeks jawaban benar (0-based)" required>
<input id="so_pemb" placeholder="Pembahasan">
<button class="pri" type="submit">Tambah Soal</button>
</form>
<div id="listSoal"></div>
<h2>Kelola Akun Murid</h2>
<form id="fmurid" style="display:grid;gap:8px;max-width:520px;margin-bottom:10px">
<input id="mu_nama" placeholder="Nama" required>
<input id="mu_kelas" placeholder="Kelas">
<input id="mu_pin" placeholder="PIN" required>
<button class="pri" type="submit">Tambah Murid</button>
</form>
<div id="listMurid"></div>
</div>
</div>
<script>
var SKEY='pcn_admin',D=null;
function el(i){return document.getElementById(i)}
function E(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function N(v){var x=+v||0;return x.toLocaleString('id-ID')}
function tbl(head,rows){return '<div class="t"><table><thead><tr>'+head.map(function(h){return '<th>'+h+'</th>'}).join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>'}
function tr(cells,cls){return '<tr'+(cls?' class="'+cls+'"':'')+'>'+cells.map(function(c){return '<td>'+c+'</td>'}).join('')+'</tr>'}
function key(){return el('k').value.trim()}
function kelasOf(x){return x.kelas||'(tanpa kelas)'}

async function api(path,init){const k=key();return fetch(path,Object.assign({},init,{headers:Object.assign({'Authorization':'Bearer '+k},init&&init.headers||{})}))}
async function loadSoal(){try{const r=await fetch('/api/soal');const d=await r.json();const list=Array.isArray(d.list)?d.list:[];el('listSoal').innerHTML=list.map(s=>'<div class="row"><span>'+E(s.organ)+' L'+s.level+' — '+E(s.pertanyaan)+'</span><button data-id="'+s.id+'" class="rm delSoal">Hapus</button></div>').join('')||'<div class="empty">Belum ada soal.</div>';el('listSoal').querySelectorAll('.delSoal').forEach(b=>b.onclick=async()=>{await api('/api/soal?id='+b.dataset.id,{method:'DELETE'});loadSoal()})}catch(e){}}
async function loadMurid(){try{const r=await api('/api/murid');const d=await r.json();const list=Array.isArray(d.list)?d.list:[];el('listMurid').innerHTML=list.map(m=>'<div class="row"><span>'+E(m.nama)+' · '+E(m.kelas||'-')+'</span><button data-id="'+m.id+'" class="rm delMurid">Hapus</button></div>').join('')||'<div class="empty">Belum ada murid.</div>';el('listMurid').querySelectorAll('.delMurid').forEach(b=>b.onclick=async()=>{await api('/api/murid?id='+b.dataset.id,{method:'DELETE'});loadMurid()})}catch(e){}}
(function(){
  const fs=document.getElementById('fsoal');if(fs)fs.onsubmit=async(e)=>{e.preventDefault();const opsi=document.getElementById('so_opsi').value.split('|').map(x=>x.trim());await api('/api/soal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organ:document.getElementById('so_organ').value,level:+document.getElementById('so_level').value,pertanyaan:document.getElementById('so_q').value,opsi:JSON.stringify(opsi),jawaban:+document.getElementById('so_jaw').value,pembahasan:document.getElementById('so_pemb').value})});fs.reset();loadSoal()};
  const fm=document.getElementById('fmurid');if(fm)fm.onsubmit=async(e)=>{e.preventDefault();await api('/api/murid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nama:document.getElementById('mu_nama').value,kelas:document.getElementById('mu_kelas').value,pin:document.getElementById('mu_pin').value})});fm.reset();loadMurid()};
});
async function load(){
 var k=key();if(!k){el('msg').textContent='Isi kunci admin dulu.';return}
 el('msg').textContent='Memuat…';
 try{
  var r=await fetch('/api/rekap',{headers:{Authorization:'Bearer '+k},cache:'no-store'});
  if(r.status===401){el('msg').textContent='Kunci salah.';return}
  if(!r.ok){el('msg').textContent='Gagal memuat (server '+r.status+').';return}
  D=await r.json();
  try{sessionStorage.setItem(SKEY,k)}catch(e){}
  el('csv').disabled=false;
  fillKelas();
  el('manage').hidden=false;
  el('msg').textContent='Terakhir dimuat '+new Date().toLocaleTimeString('id-ID')+' · '+N((D.siswa||[]).length)+' siswa, '+N((D.ringkasan&&D.ringkasan[0]?D.ringkasan[0].sesi:0))+' sesi';
  render();
  loadSoal();loadMurid();
 }catch(e){el('msg').textContent='Gagal menghubungi server. Cek koneksi lalu coba lagi.'}
}

function fillKelas(){
 var set={};(D.siswa||[]).forEach(function(x){set[kelasOf(x)]=1});
 var opts=[''].concat(Object.keys(set).sort()),s=el('f');
 s.innerHTML=opts.map(function(v){return '<option value="'+E(v)+'">'+(v?E(v):'Semua kelas')+'</option>'}).join('');
 el('bar2').hidden=false;
}
function siswa(){var f=el('f').value;return (D.siswa||[]).filter(function(x){return !f||kelasOf(x)===f})}

function render(){
 if(!D)return;
 var byKelas=siswa(),all=D.siswa||[],R=(D.ringkasan&&D.ringkasan[0])||{},organ=D.organ||[],soal=D.soal||[];
 var urut=byKelas.slice().sort(function(a,b){return (b.maks-a.maks)||(b.rata-a.rata)||String(a.nama).localeCompare(String(b.nama))});
 var h='';

 h+='<div class="cards">'
  +'<div class="card"><b>'+N(R.sesi)+'</b><small>Total sesi main</small></div>'
  +'<div class="card"><b>'+N(R.siswa)+'</b><small>Siswa terdata</small></div>'
  +'<div class="card"><b>'+N(R.rata)+'</b><small>Rata-rata skor</small></div>'
  +'<div class="card"><b style="font-size:1rem">'+E(R.terakhir||'–')+'</b><small>Sesi terakhir (WITA)</small></div>'
  +'</div>';

 var a=organ.filter(function(x){return x.pct_gagal>=${AMBANG_GAGAL}}).map(function(x){
  return '<div class="w">Materi <b>'+E(x.organ)+'</b>: '+N(x.pct_gagal)+'% jawaban gagal total ('+N(x.n)+' jawaban). Ulas ulang di kelas.</div>'});
 var b=all.filter(function(x){return x.rata<${AMBANG_RATA}&&x.sesi>=${MIN_SESI}}).map(function(x){
  return '<div class="w"><b>'+E(x.nama)+'</b> ('+E(x.kelas||'-')+'): rata-rata '+N(x.rata)+' dari '+N(x.sesi)+' sesi. Perlu pendampingan.</div>'});
 h+='<h2>Saran tindakan</h2>'+(a.concat(b).join('')||'<div class="empty">Belum ada yang menonjol: semua materi dan siswa masih di atas ambang.</div>');

 h+='<h2>🏆 Peringkat siswa <small>('+N(urut.length)+' siswa'+(el('f').value?' · '+E(el('f').value):'')+')</small></h2>';
 h+=urut.length?tbl(['#','Nama','Kelas','Sesi','Rata-rata','Terbaik','Terakhir main'],urut.map(function(x,i){
   return tr(['<span class="rk">'+(['🥇','🥈','🥉'][i]||(i+1))+'</span>',E(x.nama),E(x.kelas||'-'),N(x.sesi),N(x.rata),'<b>'+N(x.maks)+'</b>',E(x.terakhir||'-')],i<3?'top'+(i+1):'')
 })):'<div class="empty">Belum ada siswa di kelas ini.</div>';

 var K={};all.forEach(function(x){var k=kelasOf(x),o=K[k]=K[k]||{kelas:k,siswa:0,sesi:0,poin:0,maks:0};o.siswa++;o.sesi+=(+x.sesi||0);o.poin+=(+x.rata||0)*(+x.sesi||0);o.maks=Math.max(o.maks,+x.maks||0)});
 var kr=Object.keys(K).map(function(k){return K[k]}).sort(function(p,q){return (q.poin/Math.max(q.sesi,1))-(p.poin/Math.max(p.sesi,1))});
 h+='<h2>🏫 Per kelas</h2>'+tbl(['Kelas','Siswa','Sesi','Rata-rata','Terbaik'],kr.map(function(x){
  return tr([E(x.kelas),N(x.siswa),N(x.sesi),N(Math.round(x.poin/Math.max(x.sesi,1))),N(x.maks)])}));

 h+='<h2>🫀 Per materi (organ)</h2>'+(organ.length?tbl(['Organ','Jawaban','Rata salah','% gagal (0 poin)','% pakai petunjuk'],organ.map(function(x){
  return tr([E(x.organ),N(x.n),N(x.rata_salah),N(x.pct_gagal)+'%',N(x.pct_petunjuk)+'%'])})):'<div class="empty">Belum ada detail jawaban.</div>');

 h+='<h2>🔎 Soal tersulit</h2>'+(soal.length?tbl(['Soal','Dijawab','Rata salah'],soal.map(function(x){
  return tr([E(x.soal),N(x.n),N(x.rata_salah)])})):'<div class="empty">Belum ada soal yang cukup sering dijawab.</div>');

 el('o').innerHTML=h;
}

function csv(){
 if(!D)return;
 var urut=siswa().slice().sort(function(a,b){return (b.maks-a.maks)||(b.rata-a.rata)});
 var rows=[['Peringkat','Nama','Kelas','Sesi','Rata-rata','Skor terbaik','Terakhir main']];
 urut.forEach(function(x,i){rows.push([i+1,x.nama,x.kelas||'',x.sesi,x.rata,x.maks,x.terakhir||''])});
 var txt='\\uFEFF'+rows.map(function(r){return r.map(function(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'}).join(',')}).join('\\r\\n');
 var a=document.createElement('a');
 a.href=URL.createObjectURL(new Blob([txt],{type:'text/csv;charset=utf-8'}));
 a.download='rekap-pencernaan-'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.appendChild(a);a.click();a.remove();
}

el('go').onclick=load;
el('csv').onclick=csv;
el('f').onchange=render;
el('k').onkeydown=function(e){if(e.key==='Enter')load()};
el('out').onclick=function(){try{sessionStorage.removeItem(SKEY)}catch(e){}el('k').value='';D=null;el('o').innerHTML='';el('bar2').hidden=true;el('csv').disabled=true;el('msg').textContent='Kunci dihapus dari tab ini.'};
try{var saved=sessionStorage.getItem(SKEY);if(saved){el('k').value=saved;load()}}catch(e){}
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

    // Papan skor publik (dipakai game): skor terbaik tiap siswa, 10 teratas.
    // Matikan dengan PAPAN_PUBLIK="0" di wrangler.toml kalau nama siswa tidak boleh tampil.
    if (u.pathname === '/api/papan' && req.method === 'GET') {
      if (env.PAPAN_PUBLIK === '0') return J({ top: [] });
      try {
        const r = await env.DB.prepare(
          'SELECT nama,kelas,MAX(skor) maks,COUNT(*) sesi FROM sesi GROUP BY nama,kelas ORDER BY maks DESC, sesi DESC LIMIT 10'
        ).all();
        return J({ top: r.results || [] });
      } catch (e) {
        return J({ top: [] }); // game tetap jalan dengan papan lokal
      }
    }

    if (u.pathname === '/api/rekap') {
      if (!env.ADMIN_KEY || req.headers.get('Authorization') !== 'Bearer ' + env.ADMIN_KEY) return J({ e: 'unauthorized' }, 401);
      const q = s => env.DB.prepare(s).all().then(r => r.results);
      try {
        return J({
          ringkasan: await q("SELECT COUNT(*) sesi,COUNT(DISTINCT nama||'|'||IFNULL(kelas,'')) siswa,IFNULL(ROUND(AVG(skor)),0) rata,IFNULL(MAX(waktu),'-') terakhir FROM sesi"),
          organ: await q('SELECT organ,COUNT(*) n,ROUND(AVG(salah),2) rata_salah,ROUND(100.0*SUM(poin=0)/COUNT(*)) pct_gagal,ROUND(100.0*AVG(petunjuk)) pct_petunjuk FROM jawaban GROUP BY organ'),
          siswa: await q('SELECT nama,kelas,COUNT(*) sesi,ROUND(AVG(skor)) rata,MAX(skor) maks,MAX(waktu) terakhir FROM sesi GROUP BY nama,kelas ORDER BY rata ASC'),
          soal: await q('SELECT soal,COUNT(*) n,ROUND(AVG(salah),2) rata_salah FROM jawaban GROUP BY soal HAVING n>=3 ORDER BY rata_salah DESC LIMIT 5')
        });
      } catch (e) {
        return J({ e: 'db' }, 500);
      }
    }

    // Kelola soal (guru). GET publik untuk game, POST/DELETE butuh kunci admin.
    if (u.pathname === '/api/soal') {
      if (req.method === 'GET') {
        try {
          const r = await env.DB.prepare('SELECT id,organ,level,pertanyaan,opsi,jawaban,pembahasan FROM soal ORDER BY id DESC').all();
          return J({ list: r.results || [] });
        } catch (e) { return J({ list: [] }); }
      }
      if (req.method === 'POST') {
        if (!env.ADMIN_KEY || req.headers.get('Authorization') !== 'Bearer ' + env.ADMIN_KEY) return J({ e: 'unauthorized' }, 401);
        let d; try { d = await req.json(); } catch { return J({ e: 'json' }, 400); }
        const organ = cut(d.organ, 20).trim();
        const pertanyaan = cut(d.pertanyaan, 300).trim();
        if (!organ || !pertanyaan) return J({ e: 'data' }, 400);
        try {
          const r = await env.DB.prepare('INSERT INTO soal(organ,level,pertanyaan,opsi,jawaban,pembahasan) VALUES(?,?,?,?,?,?)')
            .bind(organ, +d.level || 1, pertanyaan, cut(d.opsi, 500), +d.jawaban || 0, cut(d.pembahasan, 300)).run();
          return J({ ok: 1, id: r.meta.last_row_id });
        } catch (e) { return J({ e: 'db' }, 500); }
      }
      if (req.method === 'DELETE') {
        if (!env.ADMIN_KEY || req.headers.get('Authorization') !== 'Bearer ' + env.ADMIN_KEY) return J({ e: 'unauthorized' }, 401);
        const id = +u.searchParams.get('id');
        if (!id) return J({ e: 'id' }, 400);
        try { await env.DB.prepare('DELETE FROM soal WHERE id=?').bind(id).run(); return J({ ok: 1 }); }
        catch (e) { return J({ e: 'db' }, 500); }
      }
    }
    // Kelola akun murid (guru)
    if (u.pathname === '/api/murid') {
      if (!env.ADMIN_KEY || req.headers.get('Authorization') !== 'Bearer ' + env.ADMIN_KEY) return J({ e: 'unauthorized' }, 401);
      if (req.method === 'GET') {
        try {
          const r = await env.DB.prepare('SELECT id,nama,kelas,pin FROM murid ORDER BY nama').all();
          return J({ list: r.results || [] });
        } catch (e) { return J({ list: [] }); }
      }
      if (req.method === 'POST') {
        let d; try { d = await req.json(); } catch { return J({ e: 'json' }, 400); }
        const nama = cut(d.nama, 30).trim();
        if (!nama) return J({ e: 'nama' }, 400);
        try {
          const r = await env.DB.prepare('INSERT INTO murid(nama,kelas,pin) VALUES(?,?,?)')
            .bind(nama, cut(d.kelas, 12), cut(d.pin, 8)).run();
          return J({ ok: 1, id: r.meta.last_row_id });
        } catch (e) { return J({ e: 'db' }, 500); }
      }
      if (req.method === 'DELETE') {
        const id = +u.searchParams.get('id');
        if (!id) return J({ e: 'id' }, 400);
        try { await env.DB.prepare('DELETE FROM murid WHERE id=?').bind(id).run(); return J({ ok: 1 }); }
        catch (e) { return J({ e: 'db' }, 500); }
      }
    }

    if (u.pathname === '/admin') return new Response(PAGE, { headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' } });
    return J({ ok: 1, info: 'API Petualangan Makanan' });
  }
};

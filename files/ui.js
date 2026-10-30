// Gaya bersama: suara tombol, bentuk makanan berwajah, tombol suara. Dipakai index, game, dan panel guru.
(() => {
  const LS = { g: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, s: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  let mute = LS.g('pcn_mute') === '1', AC;
  function tone(f, d, ty = 'sine', v = .12, s = 0, sl) {
    if (mute) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const t = AC.currentTime + s, o = AC.createOscillator(), g = AC.createGain();
      o.type = ty; o.frequency.setValueAtTime(f, t);
      if (sl) o.frequency.exponentialRampToValueAtTime(sl, t + d);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
      o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d);
    } catch (e) {}
  }
  const S = {
    tick: () => tone(900, .05, 'triangle', .08, 0, 1300),
    pop: () => tone(450, .12, 'sine', .16, 0, 900),
    boing: () => tone(520, .22, 'sine', .14, 0, 170),
    ok: () => [660, 880, 1175].forEach((f, i) => tone(f, .14, 'triangle', .14, i * .08)),
    bad: () => tone(320, .35, 'sawtooth', .07, 0, 110)
  };
  // ----- Makanan berbentuk asli + wajah yang sama -----
  const ST = 'stroke="#5a3a36" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  const fc = (x, y) => `<circle cx="${x - 13}" cy="${y}" r="7" fill="#fff"/><circle cx="${x + 13}" cy="${y}" r="7" fill="#fff"/><circle cx="${x - 12}" cy="${y + 1}" r="4" fill="#3b2321"/><circle cx="${x + 14}" cy="${y + 1}" r="4" fill="#3b2321"/><circle cx="${x - 14}" cy="${y - 1}" r="1.5" fill="#fff"/><circle cx="${x + 12}" cy="${y - 1}" r="1.5" fill="#fff"/><ellipse cx="${x - 24}" cy="${y + 12}" rx="6" ry="3.5" fill="#ff8fa3" opacity=".75"/><ellipse cx="${x + 24}" cy="${y + 12}" rx="6" ry="3.5" fill="#ff8fa3" opacity=".75"/><path d="M${x - 7} ${y + 13}Q${x} ${y + 22} ${x + 7} ${y + 13}" stroke="#3b2321" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  const SH = {
    'Nasi': `<path d="M50 8Q60 8 68 24L90 72Q96 90 78 90H22Q4 90 10 72L32 24Q40 8 50 8Z" fill="#fff" ${ST}/><path d="M20 72H80L86 86Q88 90 80 90H20Q12 90 14 86Z" fill="#2f4a3a" ${ST}/>${fc(50, 46)}`,
    'Pisang': `<g transform="rotate(-12 50 50)"><path d="M44 6H58Q62 6 62 12V20C88 34 92 68 72 86C58 98 30 94 24 78C16 58 28 34 40 20V12Q40 6 44 6Z" fill="#ffd23f" ${ST}/><path d="M33 32C26 52 30 70 42 84" stroke="#e0b020" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M44 94Q50 100 58 93" stroke="#7a5230" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="44" y="3" width="14" height="10" rx="3" fill="#7a5230" ${ST}/>${fc(52, 56)}</g>`,
    'Ayam Goreng': `<path d="M66 62L84 82" stroke="#5a3a36" stroke-width="14" stroke-linecap="round"/><path d="M66 62L84 82" stroke="#fff3e0" stroke-width="7" stroke-linecap="round"/><circle cx="89" cy="82" r="7" fill="#fff3e0" ${ST}/><circle cx="82" cy="93" r="7" fill="#fff3e0" ${ST}/><path d="M14 42C10 18 36 4 58 10C82 16 90 42 74 58C60 70 30 68 18 56C14 52 14 46 14 42Z" fill="#e8923f" ${ST}/>${fc(42, 36)}`,
    'Apel': `<path d="M50 26C30 12 6 28 10 56C13 80 32 94 44 90Q50 88 56 90C68 94 87 80 90 56C94 28 70 12 50 26Z" fill="#ff6b6b" ${ST}/><path d="M50 26Q50 14 58 6" stroke="#7a5230" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M56 16Q72 2 84 14Q70 26 56 16Z" fill="#6bbf6b" ${ST}/>${fc(50, 58)}`,
    'Roti': `<path d="M18 34C2 30 2 6 28 8C40 2 60 2 72 8C98 6 98 30 82 34V84Q82 92 74 92H26Q18 92 18 84Z" fill="#d9a05b" ${ST}/><path d="M26 40C14 36 12 18 30 18C42 14 58 14 70 18C88 18 86 36 74 40V82H26Z" fill="#f6d9a4" stroke="#b9803f" stroke-width="2"/>${fc(50, 56)}`,
    'Es Krim': `<path d="M26 56H74L50 98Z" fill="#e8b878" ${ST}/><path d="M36 66L56 82M52 60L66 72M66 58L46 88" stroke="#b9803f" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M18 54C10 30 26 8 50 8C74 8 90 30 82 54C76 60 70 54 63 60C57 66 52 56 46 60C40 64 34 58 28 60C22 62 20 58 18 54Z" fill="#ffb3d9" ${ST}/><circle cx="50" cy="9" r="6" fill="#e0334c" ${ST}/>${fc(50, 34)}`
  };
  const food = n => `<svg viewBox="0 0 100 100" aria-hidden="true">${SH[n] || SH['Nasi']}</svg>`;
  function setMute(v) {
    mute = !!v; LS.s('pcn_mute', mute ? '1' : '0');
    const b = document.getElementById('uiMute'); if (b) b.textContent = mute ? '🔇' : '🔊';
  }
  window.UI = { sfx: S, food, names: Object.keys(SH), mute: setMute, muted: () => mute };
  // ----- Pasang saat halaman siap -----
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-mascots]').forEach(el => { el.innerHTML = Object.keys(SH).map((n, i) => `<span style="animation-delay:${i * .25}s">${food(n)}</span>`).join(''); });
    if (!document.getElementById('snd')) {
      const b = document.createElement('button');
      b.id = 'uiMute'; b.type = 'button'; b.className = 'uimute'; b.title = 'Suara'; b.setAttribute('aria-label', 'Nyalakan atau matikan suara');
      b.textContent = mute ? '🔇' : '🔊'; b.onclick = () => setMute(!mute);
      document.body.appendChild(b);
    }
  });
  // ----- Suara untuk semua tombol -----
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('button,a.btn,.chip,.food,select');
    if (!b || b.disabled || b.classList.contains('opt') || b.id === 'uiMute') return;
    const t = b.textContent || '';
    if (b.classList.contains('del') || /hapus|keluar|batal|reset/i.test(t)) S.boing();
    else if (b.classList.contains('pri') || b.classList.contains('btn')) S.pop();
    else S.tick();
  }, true);
})();

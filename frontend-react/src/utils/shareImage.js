// Obrazek z wynikami portfela do wysłania znajomym (PNG 1080×1350) — z danych
// publicznego widoku (/api/shared): same procenty i wskaźniki, bez kwot.
const W = 1080, H = 1350;
const C = { bg: '#0f1420', panel: '#171d2b', line: '#273044', fg: '#f1f4f9', dim: '#9aa6bd', faint: '#6b778f', up: '#34d399', down: '#f87171', accent: '#6d6af0' };

const sign = v => (v > 0 ? '+' : '');
const pct = (v, d = 1, locale = 'pl-PL') => `${sign(v)}${v.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

export function drawShareImage(canvas, data, { title, labels, locale = 'pl-PL', date = new Date() }) {
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const font = (w, s) => `${w} ${s}px Inter, system-ui, -apple-system, Segoe UI, sans-serif`;
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  const m = data.metrics || {};

  // Nagłówek
  g.fillStyle = C.accent; g.beginPath(); g.roundRect(72, 72, 64, 64, 16); g.fill();
  g.fillStyle = '#fff'; g.font = font(800, 34); g.fillText('↗', 88, 116);
  g.fillStyle = C.fg; g.font = font(800, 40); g.fillText('myfund.', 156, 116);
  g.fillStyle = C.faint; g.font = font(500, 28); g.textAlign = 'right';
  g.fillText(date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }), W - 72, 116);
  g.textAlign = 'left';
  g.fillStyle = C.dim; g.font = font(600, 34); g.fillText(title, 72, 230);

  // Wynik
  const res = m.plPct;
  g.fillStyle = res == null ? C.fg : res >= 0 ? C.up : C.down;
  g.font = font(800, 150); g.fillText(res == null ? '—' : pct(res, 1, locale), 72, 400);
  g.fillStyle = C.faint; g.font = font(500, 30); g.fillText(labels.result, 72, 450);

  // Wskaźniki
  const stats = [
    [labels.irr, m.irrPct != null ? pct(m.irrPct, 1, locale) : '—'],
    ['MOIC', m.moic != null ? `${m.moic.toLocaleString(locale, { maximumFractionDigits: 2 })}x` : '—'],
    [labels.positions, String(m.positionsCount ?? data.positions.length)],
  ];
  stats.forEach(([k, v], i) => {
    const x = 72 + i * 320;
    g.fillStyle = C.panel; g.beginPath(); g.roundRect(x, 500, 296, 130, 20); g.fill();
    g.fillStyle = C.faint; g.font = font(600, 24); g.fillText(k.toUpperCase(), x + 28, 548);
    g.fillStyle = C.fg; g.font = font(800, 44); g.fillText(v, x + 28, 604);
  });

  // Największe pozycje: udział i wynik
  g.fillStyle = C.dim; g.font = font(700, 28); g.fillText(labels.top, 72, 706);
  const top = data.positions.slice(0, 6);
  const maxPct = Math.max(...top.map(p => p.pct), 1);
  top.forEach((p, i) => {
    const y = 750 + i * 78;
    g.fillStyle = C.fg; g.font = font(700, 32); g.fillText(String(p.symbol).replace(/\.WA$/, ''), 72, y + 30);
    g.fillStyle = C.panel; g.beginPath(); g.roundRect(330, y + 6, 430, 30, 15); g.fill();
    g.fillStyle = C.accent; g.beginPath(); g.roundRect(330, y + 6, Math.max(30, 430 * p.pct / maxPct), 30, 15); g.fill();
    g.fillStyle = C.dim; g.font = font(600, 28); g.fillText(`${p.pct.toLocaleString(locale, { maximumFractionDigits: 1 })}%`, 780, y + 31);
    if (p.plPct != null) {
      g.textAlign = 'right'; g.fillStyle = p.plPct >= 0 ? C.up : C.down; g.font = font(700, 30);
      g.fillText(pct(p.plPct, 1, locale), W - 72, y + 31); g.textAlign = 'left';
    }
  });

  // Najlepsza / najsłabsza
  const y0 = 1240;
  g.strokeStyle = C.line; g.lineWidth = 2; g.beginPath(); g.moveTo(72, y0 - 50); g.lineTo(W - 72, y0 - 50); g.stroke();
  g.font = font(600, 28);
  if (m.best) { g.fillStyle = C.faint; g.fillText(`${labels.best}: `, 72, y0); g.fillStyle = C.up; g.fillText(`${m.best.symbol} ${pct(m.best.plPct, 1, locale)}`, 72 + g.measureText(`${labels.best}: `).width, y0); }
  if (m.worst) {
    const txt = `${m.worst.symbol} ${pct(m.worst.plPct, 1, locale)}`;
    g.textAlign = 'right'; g.fillStyle = m.worst.plPct >= 0 ? C.up : C.down; g.fillText(txt, W - 72, y0);
    g.fillStyle = C.faint; g.fillText(`${labels.worst}: `, W - 72 - g.measureText(txt).width, y0); g.textAlign = 'left';
  }
  g.fillStyle = C.faint; g.font = font(500, 22); g.fillText(labels.footer, 72, H - 40);
}

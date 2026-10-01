// Mapa portfela: układ „squarified treemap" (Bruls, Huizing, van Wijk 2000).
// Pole kafelka proporcjonalne do wartości, kafelki możliwie kwadratowe —
// czytelniejsze niż cienkie paski przy prostym dzieleniu na przemian.
//
// squarify(values, { x, y, w, h }) → [{ x, y, w, h }] w kolejności `values`
// (wartości ≤ 0 dostają prostokąt o zerowym polu).

function worst(row, side) {
  const s = row.reduce((a, it) => a + it.a, 0);
  let max = 0, min = Infinity;
  for (const it of row) { if (it.a > max) max = it.a; if (it.a < min) min = it.a; }
  return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
}

function layoutRow(row, r, out) {
  const s = row.reduce((a, it) => a + it.a, 0);
  if (r.w >= r.h) {
    const cw = s / r.h;
    let yy = r.y;
    for (const it of row) { const h = it.a / cw; out[it.i] = { x: r.x, y: yy, w: cw, h }; yy += h; }
    return { x: r.x + cw, y: r.y, w: r.w - cw, h: r.h };
  }
  const rh = s / r.w;
  let xx = r.x;
  for (const it of row) { const w = it.a / rh; out[it.i] = { x: xx, y: r.y, w, h: rh }; xx += w; }
  return { x: r.x, y: r.y + rh, w: r.w, h: r.h - rh };
}

export function squarify(values, rect) {
  const out = values.map(() => ({ x: rect.x, y: rect.y, w: 0, h: 0 }));
  const total = values.reduce((a, v) => a + (v > 0 ? v : 0), 0);
  if (!(total > 0) || !(rect.w > 0) || !(rect.h > 0)) return out;
  const area = rect.w * rect.h;
  const items = values
    .map((v, i) => ({ i, a: v > 0 ? (v / total) * area : 0 }))
    .filter(it => it.a > 0)
    .sort((p, q) => q.a - p.a);
  let r = { ...rect };
  let row = [];
  let k = 0;
  while (k < items.length) {
    const side = Math.min(r.w, r.h);
    const it = items[k];
    if (!row.length || worst([...row, it], side) <= worst(row, side)) { row.push(it); k++; }
    else { r = layoutRow(row, r, out); row = []; }
  }
  if (row.length) layoutRow(row, r, out);
  return out;
}

// Kolor kafelka: zmiana dnia w % → nasycenie zieleni/czerwieni, pełne od
// ±3%. Brak danych → neutralny. Zwraca udział koloru 0–100 i ton.
export function heatTone(pct, full = 3) {
  if (pct == null || Number.isNaN(pct)) return { tone: 'none', strength: 0 };
  const strength = Math.round(Math.min(1, Math.abs(pct) / full) * 100);
  return { tone: pct > 0 ? 'up' : pct < 0 ? 'down' : 'none', strength };
}

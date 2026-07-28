// Prosty limiter dla funkcji serverless. Plik zaczyna się od podkreślnika,
// więc Vercel nie wystawia go jako endpointu.
//
// Zakres: te funkcje to publiczne, nieuwierzytelnione proxy do Yahoo i NBP.
// Chodzi o to, żeby ktoś nie używał ich jako darmowego scrapera pod Twoją
// domeną — realny koszt to zablokowanie adresów IP Vercela przez Yahoo, czyli
// awaria dla prawdziwych użytkowników. To nie jest zabezpieczenie danych.
//
// Ograniczenie: licznik siedzi w pamięci instancji, a Vercel trzyma ich wiele
// równolegle, więc faktyczny limit to N_instancji × LIMIT. To wystarcza na
// ukrócenie jednego natrętnego klienta i celowo nie próbuje być twardą kwotą —
// ta wymagałaby współdzielonego magazynu (KV/Redis), którego projekt nie ma.

const WINDOW_MS = 60_000;
const LIMIT     = 120;
const MAX_KEYS  = 5000;   // zapora przed puchnięciem pamięci przy wielu IP

const hits = new Map();   // ip → [timestamp, ...]

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Zwraca true, jeśli żądanie zostało odrzucone (odpowiedź już wysłana).
 * Wywołujący ma wtedy tylko wrócić.
 */
export function rateLimited(req, res) {
  try {
    const ip  = clientIp(req);
    const now = Date.now();

    if (hits.size > MAX_KEYS) hits.clear();

    const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
    if (recent.length >= LIMIT) {
      res.setHeader('Retry-After', Math.ceil(WINDOW_MS / 1000));
      res.status(429).json({ error: 'rate limited' });
      return true;
    }
    recent.push(now);
    hits.set(ip, recent);
    return false;
  } catch {
    // Limiter nigdy nie może być powodem awarii endpointu — przepuszczamy.
    return false;
  }
}

// Market notification text generator.
//
// Buckets:
//   bigDrop    changePct <= -5
//   smallDrop  -5 <  changePct <= -0.5
//   flat       -0.5 < changePct < 0.5
//   smallGain  0.5 <= changePct < 5
//   bigGain    changePct >= 5
//
// Only bigDrop / bigGain are surfaced by the tray — the others exist so the
// same generator can be reused for inline UI later.
//
// Teksty bigDrop/bigGain leżą w bigMoveTexts.json, nie w słownikach i18n,
// bo czyta je również server.py przy wysyłce pusha. Wcześniej obie strony
// miały własne listy: klient 8 wariantów, serwer 3 — ten sam ruch dawał
// inny tekst w karcie i w powiadomieniu systemowym. Jedno źródło plus ten
// sam hash i ten sam seed po obu stronach = zawsze ten sam wariant.
import BIG_MOVE_TEXTS from '../translations/bigMoveTexts.json';

export const NOTIFY_THRESHOLD = 5;

// Kierunek ruchu — klucz w bigMoveTexts.json po stronie klienta i serwera.
export function moveDirection(changePct) {
  return Number(changePct) >= 0 ? 'up' : 'down';
}

export function getPriceChangeBucket(changePct) {
  if (changePct == null || Number.isNaN(changePct)) return 'flat';
  if (changePct <= -NOTIFY_THRESHOLD) return 'bigDrop';
  if (changePct <= -0.5)              return 'smallDrop';
  if (changePct <  0.5)               return 'flat';
  if (changePct <  NOTIFY_THRESHOLD)  return 'smallGain';
  return 'bigGain';
}

export function shouldNotify(changePct) {
  const b = getPriceChangeBucket(changePct);
  return b === 'bigDrop' || b === 'bigGain';
}

// FNV-1a — deterministic hash so the same ticker on the same day picks the
// same variant across renders and page reloads. Eksportowany, bo server.py
// ma bliźniaczą implementację i testy po obu stronach pilnują zgodności na
// tych samych wektorach.
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// Liczba wariantów per kubełek — tylko dla kubełków trzymanych w słownikach
// i18n. bigDrop/bigGain tu nie ma, bo ich teksty idą z bigMoveTexts.json
// (współdzielonego z serwerem), a nie z kluczy tłumaczeń.
// Klucze muszą istnieć w obu tonach i obu językach, bo indeks jest wspólny.
const VARIANT_COUNTS = {
  smallDrop: 3,
  flat:      3,
  smallGain: 3,
};

export function variantCount(bucket) {
  return VARIANT_COUNTS[bucket] ?? 3;
}

// Returns a i18n key that the caller resolves via useT(). Keys look like
// `notif_pro_bigDrop_2` or `notif_fun_bigGain_1`.
export function pickVariantKey({ ticker, tone, bucket, dateKey }) {
  const seed = `${ticker}|${tone}|${bucket}|${dateKey}`;
  const idx = hashStr(seed) % variantCount(bucket);
  const toneKey = tone === 'funny' ? 'fun' : 'pro';
  return `notif_${toneKey}_${bucket}_${idx + 1}`;
}

export function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Lista wariantów dla dużego ruchu, z fallbackiem na 'professional'/'pl',
// żeby nieznany ton albo język nie zwrócił pustej karty.
export function bigMoveVariants(tone, lang, direction) {
  const byTone = BIG_MOVE_TEXTS[tone] ? BIG_MOVE_TEXTS[tone] : BIG_MOVE_TEXTS.professional;
  const byLang = byTone[lang] ? byTone[lang] : byTone.pl;
  return byLang[direction] || [];
}

// Seed musi być identyczny co do znaku z tym w server.py — inaczej karta w
// aplikacji i push systemowy wylosowałyby różne zdania o tym samym ruchu.
export function bigMoveSeed({ ticker, tone, lang, direction, dateKey }) {
  return `${ticker}|${tone}|${lang}|${direction}|${dateKey}`;
}

export function pickBigMoveText({ ticker, tone, lang, changePct, dateKey }) {
  const direction = moveDirection(changePct);
  const variants = bigMoveVariants(tone, lang, direction);
  if (!variants.length) return '';
  const idx = hashStr(bigMoveSeed({ ticker, tone, lang, direction, dateKey })) % variants.length;
  return variants[idx];
}

// t: function from useT(). Returns the resolved notification body string.
export function getNotificationText({ ticker, changePct, tone, t, lang = 'pl', now }) {
  const bucket = getPriceChangeBucket(changePct);
  const safeTone = tone === 'funny' ? 'funny' : 'professional';
  const dateKey = todayKey(now);
  if (bucket === 'bigDrop' || bucket === 'bigGain') {
    return pickBigMoveText({ ticker, tone: safeTone, lang, changePct, dateKey });
  }
  return t(pickVariantKey({ ticker, tone: safeTone, bucket, dateKey }));
}

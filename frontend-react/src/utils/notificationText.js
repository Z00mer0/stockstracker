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

export const NOTIFY_THRESHOLD = 5;

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
// same variant across renders and page reloads.
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// Liczba wariantów per kubełek. bigDrop/bigGain to jedyne, które trafiają do
// dzwonka, więc tam siedzi cała różnorodność — reszta istnieje na zapas dla
// przyszłego UI i trzymanie tam ośmiu nieoglądanych tekstów byłoby balastem.
// Klucze muszą istnieć w obu tonach i obu językach, bo indeks jest wspólny.
const VARIANT_COUNTS = {
  bigDrop:   8,
  smallDrop: 3,
  flat:      3,
  smallGain: 3,
  bigGain:   8,
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

// t: function from useT(). Returns the resolved notification body string.
export function getNotificationText({ ticker, changePct, tone, t, now }) {
  const bucket = getPriceChangeBucket(changePct);
  const key = pickVariantKey({
    ticker,
    tone: tone === 'funny' ? 'funny' : 'professional',
    bucket,
    dateKey: todayKey(now),
  });
  return t(key);
}

import { describe, it, expect } from 'vitest';
import {
  getPriceChangeBucket,
  shouldNotify,
  pickVariantKey,
  variantCount,
  hashStr,
  bigMoveVariants,
  pickBigMoveText,
  getNotificationText,
} from './notificationText.js';
import bigMoveTexts from '../translations/bigMoveTexts.json';
import pl from '../translations/pl.js';
import en from '../translations/en.js';

describe('getPriceChangeBucket', () => {
  it('classifies boundaries', () => {
    expect(getPriceChangeBucket(-7.87)).toBe('bigDrop');
    expect(getPriceChangeBucket(-5)).toBe('bigDrop');
    expect(getPriceChangeBucket(-4.99)).toBe('smallDrop');
    expect(getPriceChangeBucket(-0.5)).toBe('smallDrop');
    expect(getPriceChangeBucket(0)).toBe('flat');
    expect(getPriceChangeBucket(0.49)).toBe('flat');
    expect(getPriceChangeBucket(0.5)).toBe('smallGain');
    expect(getPriceChangeBucket(4.99)).toBe('smallGain');
    expect(getPriceChangeBucket(5)).toBe('bigGain');
    expect(getPriceChangeBucket(12)).toBe('bigGain');
  });
  it('handles missing values', () => {
    expect(getPriceChangeBucket(null)).toBe('flat');
    expect(getPriceChangeBucket(NaN)).toBe('flat');
  });
});

describe('shouldNotify', () => {
  it('fires only past ±5%', () => {
    expect(shouldNotify(-7.87)).toBe(true);
    expect(shouldNotify(-4.9)).toBe(false);
    expect(shouldNotify(0)).toBe(false);
    expect(shouldNotify(4.9)).toBe(false);
    expect(shouldNotify(5.01)).toBe(true);
  });
});

describe('pickVariantKey', () => {
  it('is deterministic per ticker/day/tone/bucket', () => {
    const a = pickVariantKey({ ticker: 'AMD', tone: 'funny', bucket: 'bigDrop', dateKey: '2026-07-28' });
    const b = pickVariantKey({ ticker: 'AMD', tone: 'funny', bucket: 'bigDrop', dateKey: '2026-07-28' });
    expect(a).toBe(b);
  });
  it('emits keys within variant range', () => {
    for (const ticker of ['AMD', 'NVDA', 'TSLA', 'AAPL', 'MSFT']) {
      const key = pickVariantKey({ ticker, tone: 'professional', bucket: 'smallGain', dateKey: '2026-07-28' });
      const idx = Number(key.split('_').pop());
      expect(idx).toBeGreaterThanOrEqual(1);
      expect(idx).toBeLessThanOrEqual(variantCount('smallGain'));
    }
  });
});

// Licznik wariantów i teksty leżą w osobnych plikach, więc podniesienie
// VARIANT_COUNTS bez dopisania tłumaczeń wyświetliłoby użytkownikowi goły
// klucz ("notif_fun_bigGain_7") zamiast zdania. Ten test to łapie.
describe('warianty maja pokrycie w tlumaczeniach', () => {
  // bigDrop/bigGain nie sa juz kluczami i18n — ich teksty siedza w
  // bigMoveTexts.json wspoldzielonym z serwerem i maja wlasny opis nizej.
  const BUCKETS = ['smallDrop', 'flat', 'smallGain'];

  for (const [langName, dict] of [['pl', pl], ['en', en]]) {
    it(`${langName}: kazdy klucz wariantu istnieje i nie jest pusty`, () => {
      const missing = [];
      for (const bucket of BUCKETS) {
        for (const tone of ['pro', 'fun']) {
          for (let i = 1; i <= variantCount(bucket); i++) {
            const key = `notif_${tone}_${bucket}_${i}`;
            if (!dict[key] || !String(dict[key]).trim()) missing.push(key);
          }
        }
      }
      expect(missing).toEqual([]);
    });
  }

  it('pl i en maja identyczny zestaw kluczy wariantow', () => {
    const variantKeys = d => Object.keys(d).filter(k => /^notif_(pro|fun)_/.test(k)).sort();
    expect(variantKeys(pl)).toEqual(variantKeys(en));
  });
});

// Karta w aplikacji i push systemowy musza mowic to samo o tym samym ruchu.
// Wczesniej klient mial 8 wariantow na kubelek, a server.py trzy wlasne, wiec
// ten sam skok kursu dawal inne zdanie w dzwonku i w powiadomieniu systemowym.
// Teraz obie strony czytaja bigMoveTexts.json i licza ten sam FNV-1a z tego
// samego seeda. Blizniaczy test siedzi w test_big_move_text.py.
describe('teksty duzego ruchu wspoldzielone z serwerem', () => {
  const TONES = ['professional', 'funny'];
  const LANGS = ['pl', 'en'];
  const DIRECTIONS = ['up', 'down'];

  it('kazdy ton x jezyk x kierunek ma niepuste warianty', () => {
    for (const tone of TONES) {
      for (const lang of LANGS) {
        for (const direction of DIRECTIONS) {
          const variants = bigMoveTexts[tone][lang][direction];
          expect(variants.length).toBeGreaterThan(0);
          expect(variants.every(v => v && v.trim())).toBe(true);
        }
      }
    }
  });

  it('pl i en maja tyle samo wariantow — indeks jest wspolny', () => {
    for (const tone of TONES) {
      for (const direction of DIRECTIONS) {
        expect(bigMoveTexts[tone].pl[direction].length)
          .toBe(bigMoveTexts[tone].en[direction].length);
      }
    }
  });

  // Te same pary seed -> hash sa zapisane w test_big_move_text.py. Rozjazd
  // ktorejkolwiek implementacji wywala jedna ze stron.
  it('hashStr zgadza sie z _fnv1a z server.py', () => {
    expect(hashStr('AMD|funny|pl|down|2026-08-01')).toBe(2267734212);
    expect(hashStr('NVDA|professional|en|up|2026-08-01')).toBe(3356723192);
    expect(hashStr('TSLA|funny|en|down|2026-01-15')).toBe(4079090469);
    expect(hashStr('PKN.WA|professional|pl|up|2026-12-31')).toBe(4026176043);
  });

  it('pickBigMoveText bierze wariant o policzonym indeksie', () => {
    const args = { ticker: 'AMD', tone: 'funny', lang: 'pl', changePct: -7.87, dateKey: '2026-08-01' };
    const variants = bigMoveVariants('funny', 'pl', 'down');
    const idx = hashStr('AMD|funny|pl|down|2026-08-01') % variants.length;
    expect(pickBigMoveText(args)).toBe(variants[idx]);
  });

  it('nieznany ton albo jezyk daje tekst, nie pustke', () => {
    expect(pickBigMoveText({ ticker: 'AMD', tone: 'nope', lang: 'de', changePct: -7, dateKey: '2026-08-01' })).toBeTruthy();
    expect(pickBigMoveText({ ticker: 'AMD', tone: 'nope', lang: 'de', changePct: 7, dateKey: '2026-08-01' })).toBeTruthy();
  });

  // getNotificationText dla duzego ruchu nie moze juz siegac do useT() —
  // gdyby siegnelo, dostaloby goly klucz, bo tych kluczy nie ma w slownikach.
  it('getNotificationText dla duzego ruchu omija slownik i18n', () => {
    const t = () => { throw new Error('nie powinno pytac o klucz i18n'); };
    const text = getNotificationText({
      ticker: 'AMD', changePct: -7.87, tone: 'funny', t, lang: 'pl',
      now: new Date('2026-08-01T12:00:00'),
    });
    expect(text).toBe(pickBigMoveText({
      ticker: 'AMD', tone: 'funny', lang: 'pl', changePct: -7.87, dateKey: '2026-08-01',
    }));
  });
});

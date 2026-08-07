// Godzina dostawy powiadomien liczona w strefie warszawskiej.
//
// server.py bramkuje pushe na `datetime.now(_WARSAW).hour < hour_pref`.
// Gdyby klient patrzyl na godzine urzadzenia, uzytkownik w innej strefie
// (podroz, telefon ustawiony na UTC) zobaczylby karty w dzwonku o innej
// porze niz dostal pusha — a to ma byc jedno ustawienie, nie dwa.
//
// Intl z timeZone zamiast recznego offsetu, bo Polska ma czas letni i zimowy
// i przeliczanie tego z reki to najkrotsza droga do bledu dwa razy w roku.
const WARSAW_TZ = 'Europe/Warsaw';

let hourFormatter = null;
let minuteFormatter = null;

function warsawHourFormatter() {
  if (!hourFormatter) {
    hourFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: WARSAW_TZ,
      hour: 'numeric',
      hour12: false,
    });
  }
  return hourFormatter;
}

function warsawMinuteFormatter() {
  if (!minuteFormatter) {
    minuteFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: WARSAW_TZ,
      minute: 'numeric',
    });
  }
  return minuteFormatter;
}

// 0-23 wedlug zegara w Warszawie, niezaleznie od strefy urzadzenia.
export function warsawHour(now = new Date()) {
  try {
    // 'en-GB' + hour12:false potrafi zwrocic '24' dla polnocy — normalizujemy.
    const hour = Number(warsawHourFormatter().format(now));
    return Number.isFinite(hour) ? hour % 24 : now.getHours();
  } catch {
    // Gdyby srodowisko nie znalo strefy — lepiej pokazac karty wedlug
    // zegara urzadzenia niz nie pokazac ich wcale.
    return now.getHours();
  }
}

export function warsawMinute(now = new Date()) {
  try {
    const m = Number(warsawMinuteFormatter().format(now));
    return Number.isFinite(m) ? m : now.getMinutes();
  } catch {
    return now.getMinutes();
  }
}

// Czy jestesmy przed ustawiona godzina dostawy. Ta sama nierownosc, co
// w server.py: o pelnej godzinie powiadomienia juz ida. Minuta opcjonalna
// (domyslnie 0) — przy 15:30 karty ida od 15:30, nie od 16:00.
export function beforeDeliveryHour(deliveryHour, deliveryMinute = 0, now = new Date()) {
  // Poprzednia sygnatura: beforeDeliveryHour(hour, now) — zeby stare wywolania
  // nie eksplodowaly, gdy zamiast liczby dostaniemy Date, traktujemy je jak
  // now bez minuty.
  if (deliveryMinute instanceof Date) { now = deliveryMinute; deliveryMinute = 0; }
  if (!Number.isFinite(deliveryHour)) return false;
  const nowMin = warsawHour(now) * 60 + warsawMinute(now);
  const dhMin = deliveryHour * 60 + (Number.isFinite(deliveryMinute) ? deliveryMinute : 0);
  return nowMin < dhMin;
}

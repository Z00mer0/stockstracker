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

let formatter = null;

function warsawFormatter() {
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: WARSAW_TZ,
      hour: 'numeric',
      hour12: false,
    });
  }
  return formatter;
}

// 0-23 wedlug zegara w Warszawie, niezaleznie od strefy urzadzenia.
export function warsawHour(now = new Date()) {
  try {
    // 'en-GB' + hour12:false potrafi zwrocic '24' dla polnocy — normalizujemy.
    const hour = Number(warsawFormatter().format(now));
    return Number.isFinite(hour) ? hour % 24 : now.getHours();
  } catch {
    // Gdyby srodowisko nie znalo strefy — lepiej pokazac karty wedlug
    // zegara urzadzenia niz nie pokazac ich wcale.
    return now.getHours();
  }
}

// Czy jestesmy przed ustawiona godzina dostawy. Ta sama nierownosc, co
// w server.py: o pelnej godzinie powiadomienia juz ida.
export function beforeDeliveryHour(deliveryHour, now = new Date()) {
  if (!Number.isFinite(deliveryHour)) return false;
  return warsawHour(now) < deliveryHour;
}

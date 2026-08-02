// Wiek powiadomienia, slownie.
//
// Karta pokazywala na sztywno „1 minutę temu" niezaleznie od tego, kiedy ruch
// faktycznie wykryto — po godzinie w dzwonku dalej wisialo „1 minutę temu".
//
// Intl.RelativeTimeFormat zamiast recznego sklejania, bo polska odmiana
// liczebnikow jest nieregularna (1 minutę / 2 minuty / 5 minut temu) i recznie
// robilo by sie z tego male i18n. Przegladarka ma to wbudowane.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// t: funkcja z useT() — tylko dla „przed chwilą", ktorego RelativeTimeFormat
// nie wyrazi (format(0, 'minute') daje „za 0 minut").
export function formatRelative(timestamp, locale, t, now = Date.now()) {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  const diff = now - timestamp;
  // Zegar urzadzenia moze sie cofnac (synchronizacja, strefa) — wtedy lepiej
  // powiedziec „przed chwilą" niz „za 3 minuty".
  if (diff < MINUTE) return t('notif_just_now');

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diff < HOUR) return rtf.format(-Math.floor(diff / MINUTE), 'minute');
  if (diff < DAY) return rtf.format(-Math.floor(diff / HOUR), 'hour');
  return rtf.format(-Math.floor(diff / DAY), 'day');
}

// "Nie kupowałem, nie sprzedawałem, a wartość zainwestowana się zmienia."
//
// Zgłoszone przez użytkownika, potwierdzone na produkcji: invested w USD chodził
// 16 526 → 16 512 → 16 450 przy zerowej liczbie transakcji w tym okresie.
//
// Mechanizm: `invested` jest zapisywany w PLN, przeliczony kursem z dnia zapisu.
// Widok Historii dzielił go przez kurs waluty wyświetlania, ale sięgał po kurs
// DZISIEJSZY, gdy snapshot nie miał własnego (`fx_json` NULL) — a takich wpisów
// jest sporo sprzed PR #15. Wtedy historyczny wiersz zmienia się codziennie
// razem z NBP. Druga dziura: snapshot bez zapisanego `invested` dostawał
// DZISIEJSZY koszt bazowy z kontekstu, wstawiony w historyczną datę.
//
// Kontrakt, którego pilnują te testy:
//   1. portfel jednowalutowy = wartość zainwestowana absolutnie stała,
//   2. portfel wielowalutowy = przeliczenie kursami z DANEGO DNIA (wahania są
//      tu naturalne i akceptowalne — ale muszą wynikać z kursów tego dnia,
//      nie z dzisiejszych),
//   3. wiersz historyczny nigdy nie sięga po dzisiejsze kursy, jeśli w bazie
//      jest jakikolwiek snapshot z kursami z jego epoki.

import { describe, it, expect } from 'vitest';
import { investedPlnAt, investedInDisplayAt, fxForSnapshot } from './investedAtDate.js';

const txsUsdOnly = [
  { type: 'BUY', symbol: 'AAPL', date: '2026-01-10', qty: 10, price: 100, currency: 'USD' },
  { type: 'BUY', symbol: 'MSFT', date: '2026-02-20', qty: 5,  price: 200, currency: 'USD' },
];

// Kursy tak jak w bazie: PLN bazowa, reszta ile złotych za jednostkę.
const fxDay1 = { PLN: 1, USD: 3.7885, GBP: 5.0877, EUR: 4.3268 };
const fxDay2 = { PLN: 1, USD: 3.8062, GBP: 5.0573, EUR: 4.3265 };

describe('stabilność wartości zainwestowanej', () => {
  it('portfel jednowalutowy: invested w tej samej walucie jest identyczny mimo ruchu kursu', () => {
    const d1 = investedInDisplayAt(txsUsdOnly, '2026-03-01', 'USD', fxDay1);
    const d2 = investedInDisplayAt(txsUsdOnly, '2026-03-01', 'USD', fxDay2);

    // 10*100 + 5*200 = 2000 USD, niezależnie od kursu PLN
    expect(d1).toBeCloseTo(2000, 6);
    expect(d2).toBeCloseTo(2000, 6);
    expect(d1).toBe(d2);
  });

  it('portfel wielowalutowy: wahania są, ale wynikają z kursów DANEGO DNIA', () => {
    const txsMixed = [
      ...txsUsdOnly,
      { type: 'BUY', symbol: 'SMSN', date: '2026-01-15', qty: 0.045, price: 4534.22, currency: 'GBP' },
    ];
    const d1 = investedInDisplayAt(txsMixed, '2026-03-01', 'USD', fxDay1);
    const d2 = investedInDisplayAt(txsMixed, '2026-03-01', 'USD', fxDay2);

    // Część GBP przeliczona krzyżowo GBP→PLN→USD, więc dwie różne daty dają
    // różne wyniki — to jest oczekiwane dla portfela wielowalutowego.
    expect(d1).not.toBe(d2);

    // Ale każda wartość musi się dokładnie zgadzać z kursami swojego dnia.
    const gbpCost = 0.045 * 4534.22;
    expect(d1).toBeCloseTo(2000 + gbpCost * (fxDay1.GBP / fxDay1.USD), 6);
    expect(d2).toBeCloseTo(2000 + gbpCost * (fxDay2.GBP / fxDay2.USD), 6);
  });

  it('investedPlnAt zwraca null gdy w tej dacie nie było jeszcze pozycji', () => {
    // Wykres traktuje null jako brak danych; zero narysowałoby fałszywą linię.
    expect(investedPlnAt(txsUsdOnly, '2025-12-31', fxDay1)).toBeNull();
    expect(investedPlnAt(txsUsdOnly, '2026-01-10', fxDay1)).toBeCloseTo(1000 * fxDay1.USD, 6);
  });
});

describe('fxForSnapshot — historyczny wiersz nie sięga po dzisiejsze kursy', () => {
  const snapsAsc = [
    { date: '2026-01-10', fx: fxDay1 },
    { date: '2026-02-10', fx: null },          // stary wpis bez kursów
    { date: '2026-03-10', fx: fxDay2 },
  ];

  it('snapshot z własnymi kursami używa swoich', () => {
    expect(fxForSnapshot(snapsAsc[0], snapsAsc)).toBe(fxDay1);
    expect(fxForSnapshot(snapsAsc[2], snapsAsc)).toBe(fxDay2);
  });

  it('snapshot bez kursów bierze najbliższy WCZEŚNIEJSZY, nie późniejszy i nie dzisiejszy', () => {
    // 2026-02-10 leży między dniem 1 a dniem 2 — ma wziąć kursy z 2026-01-10.
    expect(fxForSnapshot(snapsAsc[1], snapsAsc)).toBe(fxDay1);
  });

  it('snapshot starszy niż wszystkie z kursami bierze najwcześniejsze dostępne', () => {
    const stary = { date: '2025-06-01', fx: null };
    expect(fxForSnapshot(stary, snapsAsc)).toBe(fxDay1);
  });

  it('brak jakichkolwiek kursów w bazie → null, caller decyduje o ostateczności', () => {
    expect(fxForSnapshot({ date: '2026-01-01', fx: null }, [{ date: '2026-01-01', fx: null }]))
      .toBeNull();
    expect(fxForSnapshot({ date: '2026-01-01', fx: null }, [])).toBeNull();
  });

  it('kursy z epoki dają stabilny wiersz — ten sam wynik niezależnie od dzisiejszego kursu', () => {
    // Wiersz bez własnych kursów: liczony kursami z 2026-01-10 i tak zostaje,
    // choćby dzisiejszy kurs poszedł gdziekolwiek.
    // 10 lutego istnieje tylko zakup AAPL (10 stycznia) — MSFT dochodzi 20 lutego,
    // więc invested to 10*100 = 1000 USD, nie 2000. Replay respektuje daty.
    const fx = fxForSnapshot(snapsAsc[1], snapsAsc);
    const wynik = investedInDisplayAt(txsUsdOnly, snapsAsc[1].date, 'USD', fx);
    expect(wynik).toBeCloseTo(1000, 6);

    // Ten sam wiersz liczony kursami z innego dnia dałby identyczny wynik,
    // bo portfel jest jednowalutowy — o to w tej poprawce chodzi.
    expect(investedInDisplayAt(txsUsdOnly, snapsAsc[1].date, 'USD', fxDay2))
      .toBeCloseTo(1000, 6);
  });
});

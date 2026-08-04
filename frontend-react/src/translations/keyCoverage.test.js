import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import pl from './pl.js';
import en from './en.js';

// Klucz uzyty w komponencie, ale nieobecny w slowniku, nie wywala aplikacji —
// useT() zwraca wtedy sam klucz i uzytkownik oglada "ks_pe_tip" zamiast zdania.
// Cichy blad, wiec pilnuje go test, a nie czujnosc przy review.
function jsxFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) jsxFiles(p, out);
    else if (p.endsWith('.jsx')) out.push(p);
  }
  return out;
}

const sources = jsxFiles('src').map(p => readFileSync(p, 'utf8')).join('\n');
// t('klucz') — tylko literaly, bo kluczy budowanych dynamicznie nie da sie
// sprawdzic statycznie i nie ma ich w tym kodzie.
const used = [...new Set([...sources.matchAll(/\bt\(\s*'([a-z][a-z0-9_]*)'\s*\)/g)].map(m => m[1]))];

describe('pokrycie kluczy i18n', () => {
  it('znalazl sensowna liczbe uzyc t()', () => {
    expect(used.length).toBeGreaterThan(100);
  });

  it('kazdy uzyty klucz istnieje w pl', () => {
    expect(used.filter(k => !(k in pl))).toEqual([]);
  });

  it('kazdy uzyty klucz istnieje w en', () => {
    expect(used.filter(k => !(k in en))).toEqual([]);
  });

  // Pusty napis bywa zamierzony (pw_strength_empty renderuje nic dla pustego
  // pola), wiec nie zabraniamy pustki — pilnujemy tylko, zeby byla taka sama
  // w obu jezykach. Inaczej jeden jezyk pokazywalby etykiete, a drugi nie.
  it('pustka jest taka sama w obu jezykach', () => {
    const emptyPl = used.filter(k => !String(pl[k] ?? '').trim()).sort();
    const emptyEn = used.filter(k => !String(en[k] ?? '').trim()).sort();
    expect(emptyPl).toEqual(emptyEn);
  });

  it('pl i en maja identyczny zestaw kluczy', () => {
    expect(Object.keys(pl).sort()).toEqual(Object.keys(en).sort());
  });
});

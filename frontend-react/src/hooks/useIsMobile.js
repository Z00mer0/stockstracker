import { useEffect, useState } from 'react';

// Jedno zrodlo prawdy o tym, czy jestesmy na waskim ekranie.
//
// Strony sa stylowane inline, a stylow inline nie obejmie zadne @media —
// jedyne wyjscie to sprawdzenie szerokosci w JS. Do tej pory taka logika
// siedziala tylko w Layout.jsx i nie dalo sie jej uzyc nizej, wiec siatki
// o stalej liczbie kolumn przelewaly sie na telefonie.
//
// matchMedia zamiast nasluchu na resize: przegladarka sama liczy warunek
// i budzi nas tylko przy przejsciu przez prog, a nie przy kazdym pikselu
// zmiany rozmiaru okna.
export const MOBILE_BP = 768;

const QUERY = `(max-width: ${MOBILE_BP - 1}px)`;

function readMatch() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(readMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(QUERY);
    const onChange = e => setIsMobile(e.matches);
    // Szerokosc mogla sie zmienic miedzy pierwszym renderem a montowaniem.
    setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

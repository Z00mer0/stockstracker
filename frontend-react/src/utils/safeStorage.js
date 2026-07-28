// Zapis do localStorage, który nie wywraca wywołującego.
//
// Safari w trybie prywatnym rzuca na każdym setItem, a przy rosnących danych
// dochodzi QuotaExceededError. Takie wyjątki nie miały gdzie wyladować: leciały
// w środku handlerów i efektów, gasząc akcję, która zwykle była tylko zapisem
// preferencji. localStorage jest tu pamięcią podręczną i wygodą, nigdy
// źródłem prawdy — brak zapisu ma kosztować zapomniane ustawienie, nie akcję.
export function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

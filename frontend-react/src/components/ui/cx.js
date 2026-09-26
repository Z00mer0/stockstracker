// Łączy klasy, pomijając puste — `cx('a', cond && 'b')`.
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

import { describe, it, expect } from 'vitest';
import { isAggregateView, groupIdOf, dataUrlFor } from './portfolioView.js';

describe('portfolioView', () => {
  const groups = [{ id: 'g1', name: 'Emerytura', portfolioIds: ['a'.repeat(24), 'b'.repeat(24)] }];
  it('widok zbiorczy: „Wszystkie” i grupy', () => {
    expect(isAggregateView('all')).toBe(true);
    expect(isAggregateView('group:g1')).toBe(true);
    expect(isAggregateView('a'.repeat(24))).toBe(false);
    expect(groupIdOf('group:g1')).toBe('g1');
  });
  it('adres danych', () => {
    expect(dataUrlFor('all')).toBe('/api/portfolios/all/data');
    expect(dataUrlFor('group:g1', groups)).toBe(`/api/portfolios/all/data?ids=${'a'.repeat(24)},${'b'.repeat(24)}`);
    expect(dataUrlFor('x1')).toBe('/api/portfolios/x1/data');
  });
});

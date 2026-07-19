import { fmtPrice, fmtPriceRange } from '../../lib/appConfig';

describe('fmtPrice', () => {
  it('zero → $0', () => expect(fmtPrice(0)).toBe('$0'));
  it('rounds down: 9.49 → $9', () => expect(fmtPrice(9.49)).toBe('$9'));
  it('rounds up: 9.50 → $10', () => expect(fmtPrice(9.5)).toBe('$10'));
  it('whole number: 100 → $100', () => expect(fmtPrice(100)).toBe('$100'));
  it('thousands separator: 1234 → $1,234', () => expect(fmtPrice(1234)).toBe('$1,234'));
  it('9999 → $9,999 (under k threshold)', () => expect(fmtPrice(9999)).toBe('$9,999'));
  it('10000 → $10.0k', () => expect(fmtPrice(10000)).toBe('$10.0k'));
  it('10500 → $10.5k', () => expect(fmtPrice(10500)).toBe('$10.5k'));
  it('15750 → $15.8k', () => expect(fmtPrice(15750)).toBe('$15.8k'));
  it('100000 → $100.0k', () => expect(fmtPrice(100000)).toBe('$100.0k'));
  it('1780 median price → $1,780', () => expect(fmtPrice(1780)).toBe('$1,780'));
});

describe('fmtPriceRange', () => {
  it('formats low–high range', () => {
    expect(fmtPriceRange({ low: 100, high: 200 })).toBe('$100–$200');
  });
  it('handles k range', () => {
    expect(fmtPriceRange({ low: 10000, high: 15000 })).toBe('$10.0k–$15.0k');
  });
  it('same value range', () => {
    expect(fmtPriceRange({ low: 50, high: 50 })).toBe('$50–$50');
  });
});

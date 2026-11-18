import { describe, it, expect } from 'vitest';
import { addDaysToDateString, isoToLocalDate, toLocalDateString } from '../../src/utils/dates';

describe('local date helpers', () => {
  it('formats a Date using local calendar fields, not UTC', () => {
    expect(toLocalDateString(new Date(2024, 0, 16, 21, 30))).toBe('2024-01-16');
  });

  it('keeps the local day for an evening timestamp that is already the next day in UTC', () => {
    const local = new Date(2024, 0, 16, 21, 30); // 9:30pm local on the 16th
    expect(isoToLocalDate(local.toISOString())).toBe('2024-01-16');
  });

  it('falls back to the date part for unparseable input', () => {
    expect(isoToLocalDate('not-a-dateTxx')).toBe('not-a-date');
  });

  it('adds days across month boundaries', () => {
    expect(addDaysToDateString('2024-01-31', 1)).toBe('2024-02-01');
  });
});

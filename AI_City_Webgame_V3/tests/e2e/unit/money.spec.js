import { test, expect } from '@playwright/test';
import * as Money from '../../../src/core/Money.js';

const { exactNumberLabel, formatCompactNumber, roundCredits, formatCredits } = Money;

test('credits round to cents and display exactly two decimals', () => {
  expect(roundCredits(0.1 + 0.2)).toBe(0.3);
  expect(roundCredits(1.005)).toBe(1.01);
  expect(formatCredits(10)).toBe('10.00 💰');
  expect(formatCredits(2.5)).toBe('2.50 💰');
});

test('credit formatting never exposes negative zero', () => {
  expect(roundCredits(-0.00001)).toBe(0);
  expect(formatCredits(-0.00001)).toBe('0.00 💰');
});

test('compact numbers keep readable K and M boundaries', () => {
  expect(formatCompactNumber(999.99, { fractionDigits: 2 })).toBe('999.99');
  expect(formatCompactNumber(1000)).toBe('1K');
  expect(formatCompactNumber(12500)).toBe('12.5K');
  expect(formatCompactNumber(999900)).toBe('999.9K');
  expect(formatCompactNumber(1250000)).toBe('1.25M');
  expect(formatCompactNumber(-1250000)).toBe('-1.25M');
  expect(formatCredits(1250, { suffix: false, compact: true })).toBe('1.25K');
});

test('exact number labels preserve the unabridged accessible value', () => {
  expect(exactNumberLabel(1250000, 2)).toBe('1,250,000.00');
  expect(exactNumberLabel(-0.00001, 2)).toBe('0.00');
});

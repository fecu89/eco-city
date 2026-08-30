import { test, expect } from '@playwright/test';
import { roundCredits, formatCredits } from '../../../src/core/Money.js';

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

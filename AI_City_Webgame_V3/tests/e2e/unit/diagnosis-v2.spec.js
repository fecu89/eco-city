import { test, expect } from '@playwright/test';
import { gameState } from '../../../src/core/GameState.js';
import {
  diagnosisRiskAt,
  nextDiagnosisTarget,
  problemTileIndices,
  scanTile,
  setDiagnosisScannerActive,
} from '../../../src/systems/DiagnosisSystem.js';

test.beforeEach(() => gameState.reset());

test('quest diagnosis selects three stable carbon, cooling, and transmission risks', () => {
  gameState.questIndex = 6;
  gameState.firstCitySnapshot = Array(25).fill(null);
  gameState.firstCitySnapshot[0] = { type: 'thermal', level: 1 };
  gameState.firstCitySnapshot[6] = { type: 'data', level: 1 };
  gameState.firstCitySnapshot[24] = { type: 'residential', level: 1 };
  gameState.baseline = { routes: [{ from: 0, via: null, to: 24, delivered: 2, efficiency: 0.7 }] };

  expect(problemTileIndices()).toEqual([0, 6, 24]);
  expect(diagnosisRiskAt(0).kind).toBe('carbon');
  expect(diagnosisRiskAt(6).kind).toBe('cooling');
  expect(diagnosisRiskAt(24).kind).toBe('transmission');
});

test('scanner targets the next unresolved risk and refuses scans while toggled off', () => {
  gameState.questIndex = 6;
  gameState.firstCitySnapshot = Array(19).fill(null);
  gameState.firstCitySnapshot[0] = { type: 'thermal', level: 1 };
  gameState.firstCitySnapshot[1] = { type: 'factory', level: 1 };
  gameState.firstCitySnapshot[2] = { type: 'data', level: 1 };
  expect(nextDiagnosisTarget()).toBe(0);
  expect(setDiagnosisScannerActive(false)).toBe(false);
  expect(scanTile(0)).toEqual({ ok: false, reason: 'scanner_off' });
  expect(gameState.diagnosisFound.size).toBe(0);
  setDiagnosisScannerActive(true);
  expect(scanTile(0).ok).toBe(true);
  expect(nextDiagnosisTarget()).toBe(1);
});

test('safe or empty scans do not advance quest 6, while the three targets do', () => {
  gameState.questIndex = 6;
  gameState.firstCitySnapshot = Array(25).fill(null);
  gameState.firstCitySnapshot[0] = { type: 'thermal', level: 1 };
  gameState.firstCitySnapshot[1] = { type: 'factory', level: 1 };
  gameState.firstCitySnapshot[2] = { type: 'data', level: 1 };
  gameState.firstCitySnapshot[3] = { type: 'green', level: 1 };

  expect(scanTile(3)).toMatchObject({ ok: true, isProblem: false });
  expect(gameState.diagnosisFound.size).toBe(0);
  for (const index of problemTileIndices()) expect(scanTile(index).isProblem).toBe(true);
  expect(gameState.diagnosisFound.size).toBe(3);
});

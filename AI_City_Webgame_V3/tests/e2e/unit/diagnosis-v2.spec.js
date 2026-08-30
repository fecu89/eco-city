import { test, expect } from '@playwright/test';
import { gameState } from '../../../src/core/GameState.js';
import {
  diagnosisRiskAt,
  problemTileIndices,
  scanTile,
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

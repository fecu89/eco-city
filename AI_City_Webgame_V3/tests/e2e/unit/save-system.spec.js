import { test, expect } from '@playwright/test';
import { GAME } from '../../../src/core/Constants.js';
import { GameState, SAVE_VERSION, gameState } from '../../../src/core/GameState.js';
import { clearSavedGame, loadSavedGame, stripObsoleteState } from '../../../src/systems/SaveSystem.js';

const NEWER_KEY = `${GAME.AUTOSAVE_KEY}-newer`;

function installFakeStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
  return map;
}

test.afterEach(() => {
  delete globalThis.localStorage;
});

test('폐기된 저장 키는 명시 목록으로만 지운다', () => {
  const clean = stripObsoleteState({
    v: SAVE_VERSION,
    credits: 12,
    evidence: [1],
    badges: ['a'],
    advisorQuestions: 3,
    transcripts: ['t'],
    aiAdvice: 'x',
    aiHistory: ['y'],
    simulationDay: 4,
    simulationHour: 8,
    gridSize: 19,
    diagnosisFound: [1],
    diagnosisHintUsed: true,
    diagnosisScannerActive: false,
  });

  expect(clean).toEqual({ v: SAVE_VERSION, credits: 12 });
});

test('ai로 시작하는 이름이라는 이유만으로 살아 있는 상태를 지우지 않는다', () => {
  const clean = stripObsoleteState({ v: SAVE_VERSION, airQuality: 42, aiAdvice: 'x' });

  expect(clean).toEqual({ v: SAVE_VERSION, airQuality: 42 });
});

test('더 새로운 버전의 저장은 덮어쓰지 않고 따로 보관한 뒤 새로 시작한다', () => {
  const storage = installFakeStorage();
  const newerSave = { ...new GameState().serialize(), v: SAVE_VERSION + 1, credits: 999 };
  const raw = JSON.stringify(newerSave);
  storage.set(GAME.AUTOSAVE_KEY, raw);

  expect(loadSavedGame()).toBe(false);
  expect(storage.get(NEWER_KEY)).toBe(raw);
  expect(gameState.credits).toBe(GAME.INITIAL_CREDITS);
  expect(gameState.questIndex).toBe(1);

  clearSavedGame();
});

test('현재 버전 저장은 그대로 복원된다', () => {
  const storage = installFakeStorage();
  const save = { ...new GameState().serialize(), credits: 7.5 };
  storage.set(GAME.AUTOSAVE_KEY, JSON.stringify(save));

  expect(loadSavedGame()).toBe(true);
  expect(gameState.credits).toBe(7.5);
  expect(storage.has(NEWER_KEY)).toBe(false);

  gameState.reset();
  clearSavedGame();
});

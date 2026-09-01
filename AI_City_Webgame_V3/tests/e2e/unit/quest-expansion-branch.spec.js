import { test, expect } from '@playwright/test';
import { GameState } from '../../../src/core/GameState.js';
import { questForState } from '../../../src/core/QuestDefinitions.js';
import { expandBoard } from '../../../src/systems/BoardSystem.js';
import {
  applySimulationQuestProgress,
  claimCurrentQuest,
  evaluateCurrentQuest,
} from '../../../src/systems/QuestSystem.js';

const delivered = (type) => ({
  routes: [{ from: 0, to: 1, delivered: 1 }],
  facilityPower: {},
  facilityEconomy: {},
  dailyCarbon: 0,
  dailyWater: 0,
  lowCarbonPercent: 100,
  netCredits: 1,
});

test.describe('renewable quest branch follows the first expansion', () => {
  for (const branch of [
    { side: 'east', first: 'solar', second: 'wind' },
    { side: 'west', first: 'wind', second: 'solar' },
  ]) {
    test(`${branch.side} starts with ${branch.first} and later pilots ${branch.second}`, () => {
      const state = new GameState();
      expect(expandBoard(state, branch.side)).toMatchObject({ ok: true, phase: 1 });
      expect(state.unlockedFacilities.has(branch.first)).toBe(true);
      expect(state.unlockedFacilities.has(branch.second)).toBe(false);

      state.questIndex = 7;
      const firstQuest = questForState(state);
      expect(firstQuest.goal).toContain(branch.first === 'solar' ? '고효율 태양전지' : '풍력 예측 제어');
      state.research.completedIds.add(`${branch.first}2`);
      expect(evaluateCurrentQuest(state).ready).toBe(true);

      state.questStatus = 'ready_to_claim';
      expect(claimCurrentQuest(state)).toMatchObject({ ok: true, nextQuest: 8 });
      state.research.completedIds.add('smartGrid');
      state.grid[0] = { type: 'data', level: 2 };
      expect(evaluateCurrentQuest(state).ready).toBe(true);

      const secondExpansion = claimCurrentQuest(state);
      expect(secondExpansion).toMatchObject({
        ok: true,
        nextQuest: 9,
        expandSecondGrid: true,
        secondExpansionSide: branch.side === 'east' ? 'west' : 'east',
      });
      expect(secondExpansion.unlockedFacilities).toEqual([branch.second]);

      expect(expandBoard(state, secondExpansion.secondExpansionSide)).toMatchObject({ ok: true, phase: 2 });
      expect(state.expansion.activeCellIndices).toHaveLength(37);
      expect(state.unlockedFacilities.has(branch.second)).toBe(true);

      const pilotQuest = questForState(state);
      expect(pilotQuest.goal).toContain(branch.second === 'solar' ? '고효율 태양전지' : '풍력 예측 제어');
      state.grid[0] = { type: branch.second, level: 1 };
      state.research.completedIds.add(`${branch.second}2`);
      applySimulationQuestProgress(state, delivered(branch.second));
      applySimulationQuestProgress(state, delivered(branch.second));
      expect(state.questStatus).toBe('ready_to_claim');
    });
  }
});

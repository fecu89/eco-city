import { test, expect } from '@playwright/test';
import { gameState } from '../../../src/core/GameState.js';
import { questForState } from '../../../src/core/QuestDefinitions.js';
import { expandBoard, upgradeCell, validatePlacement } from '../../../src/systems/BoardSystem.js';
import { commitConstructionPlan } from '../../../src/systems/ConstructionPlanSystem.js';
import { advanceConstructionProjects } from '../../../src/systems/ConstructionProjectSystem.js';
import {
  applySimulationQuestProgress,
  claimCurrentQuest,
  evaluateCurrentQuest,
} from '../../../src/systems/QuestSystem.js';

// 분기 퀘스트는 "그 시설을 실제로 지을 수 있는가"까지가 약속이다. state.grid에 직접 쓰면
// 시설 허가 검사를 통째로 건너뛰어, 안내문과 허가표가 어긋나도 테스트가 통과한다.
function build(...placements) {
  gameState.constructionPlan = placements.map(([index, type]) => ({ index, type }));
  placements.forEach(([index, type]) => {
    expect(
      validatePlacement(gameState, type, index, {
        plan: gameState.constructionPlan.filter((item) => item.index !== index),
      }),
      `${type} at ${index}`,
    ).toMatchObject({ ok: true });
  });
  const result = commitConstructionPlan(gameState);
  expect(result.ok, result.errors?.map(({ message }) => message).join(' | ')).toBe(true);
  finishProjects();
  return result;
}

function finishProjects() {
  for (let day = 0; day < 40 && gameState.grid.some((cell) => cell?.project); day += 1) {
    advanceConstructionProjects(gameState);
  }
  expect(gameState.grid.some((cell) => cell?.project)).toBe(false);
}

const delivered = (index) => ({
  routes: [{ from: index, to: 1, delivered: 1 }],
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
      gameState.reset();
      gameState.credits = 200;
      // 7단계에 선 도시는 1~6단계 보상을 이미 받았다. 이 테스트가 보는 것은 그 뒤의 분기다.
      ['factory', 'thermal', 'green', 'data', 'nuclear', 'cooling']
        .forEach((facility) => gameState.unlockedFacilities.add(facility));
      expect(expandBoard(gameState, branch.side)).toMatchObject({ ok: true, phase: 1 });
      expect(gameState.unlockedFacilities.has(branch.first)).toBe(true);
      expect(gameState.unlockedFacilities.has(branch.second)).toBe(false);

      gameState.questIndex = 7;
      const firstQuest = questForState(gameState);
      expect(firstQuest.goal).toContain(branch.first === 'solar' ? '고효율 태양전지' : '풍력 예측 제어');
      // 7단계 안내는 해금된 재생에너지를 실제로 지으라고 말한다. 허가표가 그것을 허용해야 한다.
      const firstSite = gameState.expansion.activeCellIndices.find((index) => !gameState.grid[index]);
      expect(validatePlacement(gameState, branch.first, firstSite)).toMatchObject({ ok: true });
      expect(validatePlacement(gameState, branch.second, firstSite)).toMatchObject({ ok: false, reason: 'locked_quest' });

      gameState.research.completedIds.add(`${branch.first}2`);
      expect(evaluateCurrentQuest(gameState).ready).toBe(true);

      gameState.questStatus = 'ready_to_claim';
      const firstClaim = claimCurrentQuest(gameState);
      expect(firstClaim).toMatchObject({ ok: true, nextQuest: 8, upgradePermitLevel: 2 });

      // 8단계 — 데이터센터 Lv.2와 스마트 전력망. 인력을 먼저 채우고 실제 건설·강화로 만든다.
      build([2, 'residential'], [3, 'residential']);
      build([0, 'data']);
      expect(upgradeCell(0)).toMatchObject({ ok: true, targetLevel: 2 });
      finishProjects();
      expect(gameState.grid[0]).toMatchObject({ type: 'data', level: 2, project: null });
      expect(evaluateCurrentQuest(gameState).ready).toBe(false);
      gameState.research.completedIds.add('smartGrid');
      expect(evaluateCurrentQuest(gameState).ready).toBe(true);

      const secondExpansion = claimCurrentQuest(gameState);
      expect(secondExpansion).toMatchObject({
        ok: true,
        nextQuest: 9,
        expandSecondGrid: true,
        secondExpansionSide: branch.side === 'east' ? 'west' : 'east',
      });
      expect(secondExpansion.unlockedFacilities).toEqual([branch.second]);

      expect(expandBoard(gameState, secondExpansion.secondExpansionSide)).toMatchObject({ ok: true, phase: 2 });
      expect(gameState.expansion.activeCellIndices).toHaveLength(37);
      expect(gameState.unlockedFacilities.has(branch.second)).toBe(true);

      // 9단계 — 반대편 재생에너지 실증. 이번에도 허가를 통과해 실제로 지어야 한다.
      const pilotQuest = questForState(gameState);
      expect(pilotQuest.goal).toContain(branch.second === 'solar' ? '고효율 태양전지' : '풍력 예측 제어');
      const pilotSite = gameState.expansion.activeCellIndices.find((index) => !gameState.grid[index]);
      build([pilotSite, branch.second]);
      expect(gameState.grid[pilotSite]).toMatchObject({ type: branch.second, level: 1, project: null });

      gameState.research.completedIds.add(`${branch.second}2`);
      applySimulationQuestProgress(gameState, delivered(pilotSite));
      applySimulationQuestProgress(gameState, delivered(pilotSite));
      expect(gameState.questStatus).toBe('ready_to_claim');
    });
  }
});

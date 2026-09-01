import { test, expect } from '@playwright/test';
import {
  CLIMATE_EVENT_DEFINITIONS,
  CLIMATE_QUEST_ORDER,
  CLIMATE_QUESTS,
  FINAL_CLIMATE_PHASES,
  climateQuestByIndex,
} from '../../../src/core/ClimateCampaignDefinitions.js';
import { QUESTS, QUEST_COUNT } from '../../../src/core/QuestDefinitions.js';

test('campaign contains six foundations, eight Korean climates, and one final test', () => {
  expect(QUEST_COUNT).toBe(15);
  expect(QUESTS).toHaveLength(15);
  expect(CLIMATE_QUEST_ORDER).toEqual([7, 8, 9, 10, 11, 12, 13, 14]);
  expect(CLIMATE_QUEST_ORDER.map((index) => CLIMATE_QUESTS[index].eventType)).toEqual([
    'heatwave', 'monsoon', 'typhoon', 'coldWave',
    'drought', 'stagnantAir', 'dryWildfire', 'stormSurge',
  ]);
  expect(Object.keys(CLIMATE_EVENT_DEFINITIONS)).toEqual([
    'heatwave', 'monsoon', 'typhoon', 'coldWave',
    'drought', 'stagnantAir', 'dryWildfire', 'stormSurge',
  ]);
  expect(FINAL_CLIMATE_PHASES.reduce((sum, phase) => sum + phase.durationDays, 0)).toBe(41);
});

test('climate quest lookup rejects foundations and returns late campaign definitions', () => {
  expect(climateQuestByIndex(6)).toBeNull();
  expect(climateQuestByIndex(7)).toBe(CLIMATE_QUESTS[7]);
  expect(climateQuestByIndex(14)).toBe(CLIMATE_QUESTS[14]);
  expect(climateQuestByIndex(15)).toBeNull();
});

test('tidal and green unlocks are explicit campaign rewards', () => {
  expect(CLIMATE_QUESTS[7].reward).toMatchObject({
    unlockFacilities: ['battery'],
    unlockResearch: ['green2'],
    upgradePermitLevel: 2,
  });
  expect(CLIMATE_QUESTS[12].reward).toMatchObject({ unlockResearch: ['tidal1'] });
  expect(CLIMATE_QUESTS[13].reward).toMatchObject({ unlockResearch: ['green3'], upgradePermitLevel: 3 });
  expect(CLIMATE_QUESTS[14].entry).toMatchObject({ facility: 'tidal', research: 'tidal1' });
});

test('climate durations and final phase durations match the approved campaign', () => {
  expect(Object.fromEntries(Object.entries(CLIMATE_EVENT_DEFINITIONS)
    .map(([id, definition]) => [id, definition.durationDays]))).toEqual({
    heatwave: 8,
    monsoon: 6,
    typhoon: 6,
    coldWave: 6,
    drought: 6,
    stagnantAir: 6,
    dryWildfire: 5,
    stormSurge: 6,
  });
  expect(FINAL_CLIMATE_PHASES.map(({ id, durationDays }) => [id, durationDays])).toEqual([
    ['baseline', 3],
    ['heatDome', 6],
    ['monsoonFront', 5],
    ['coastalSuperstorm', 6],
    ['winterDisaster', 6],
    ['stagnantAir', 5],
    ['dryEmergency', 5],
    ['recovery', 5],
  ]);
});

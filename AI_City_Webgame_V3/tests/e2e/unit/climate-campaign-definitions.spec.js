import { test, expect } from '@playwright/test';
import {
  CLIMATE_EVENT_DEFINITIONS,
  CLIMATE_QUEST_ORDER,
  CLIMATE_QUESTS,
  FINAL_CLIMATE_PHASES,
  climateQuestByIndex,
} from '../../../src/core/ClimateCampaignDefinitions.js';
import { QUESTS, QUEST_COUNT } from '../../../src/core/QuestDefinitions.js';

test('campaign contains six foundations, four preparation quests, eight Korean climates, and one final test', () => {
  expect(QUEST_COUNT).toBe(19);
  expect(QUESTS).toHaveLength(19);
  expect(QUESTS.slice(6, 10).map(({ index, id }) => [index, id])).toEqual([
    [7, 'solar-research-foundation'],
    [8, 'data-center-modernization'],
    [9, 'wind-pilot-grid'],
    [10, 'tidal-coast-pilot'],
  ]);
  expect(CLIMATE_QUEST_ORDER).toEqual([11, 12, 13, 14, 15, 16, 17, 18]);
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
  expect(climateQuestByIndex(10)).toBeNull();
  expect(climateQuestByIndex(11)).toBe(CLIMATE_QUESTS[11]);
  expect(climateQuestByIndex(18)).toBe(CLIMATE_QUESTS[18]);
  expect(climateQuestByIndex(19)).toBeNull();
});

test('preparation rewards stage level-three permits before monsoon and open every path by quest thirteen', () => {
  expect(QUESTS[6].reward).toMatchObject({
    unlockFacilities: ['battery'],
    upgradePermitLevel: 2,
  });
  expect(QUESTS[7].reward).toMatchObject({ unlockFacilities: ['wind'] });
  expect(QUESTS[8].reward).toMatchObject({ unlockResearch: ['tidal1'] });
  expect(QUESTS[9].reward).toMatchObject({ upgradePermitFacilities: ['thermal', 'nuclear', 'wind'] });
  expect(CLIMATE_QUESTS[11].reward).toMatchObject({
    unlockFacilities: [],
    unlockResearch: ['green2'],
    upgradePermitLevel: null,
    upgradePermitFacilities: ['solar', 'tidal'],
  });
  expect(CLIMATE_QUESTS[12].reward).toMatchObject({
    unlockFacilities: [],
    unlockResearch: ['green3'],
    upgradePermitLevel: 3,
  });
  expect(CLIMATE_QUESTS[16].reward).toMatchObject({ unlockResearch: [] });
  expect(CLIMATE_QUESTS[17].reward).toMatchObject({ unlockResearch: [], upgradePermitLevel: null });
  expect(CLIMATE_QUESTS[18].entry).toMatchObject({ facility: 'tidal', research: 'tidal1' });
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

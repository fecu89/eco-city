import { test, expect } from '@playwright/test';
import { CITY_EVENTS } from '../../../src/core/EventDefinitions.js';
import {
  cityModifierForClimate,
  composeClimateDefinitions,
  facilityModifierForClimate,
} from '../../../src/systems/ClimateModifierSystem.js';

for (const [eventType, facilityType, expected] of [
  ['heatwave', 'residential', { demand: 1.25 }],
  ['monsoon', 'solar', { supply: 0.4 }],
  ['typhoon', 'wind', { supply: 0.2 }],
  ['coldWave', 'residential', { demand: 1.35 }],
  ['stagnantAir', 'thermal', { carbon: 1.25 }],
  ['stormSurge', 'tidal', { supply: 1 }],
]) {
  test(`${eventType} modifies ${facilityType}`, () => {
    expect(facilityModifierForClimate(CITY_EVENTS[eventType], facilityType)).toMatchObject(expected);
  });
}

test('wildfire weakens only lower-level green absorption', () => {
  expect(facilityModifierForClimate(CITY_EVENTS.dryWildfire, 'green', 1)).toMatchObject({ negative: 0.5 });
  expect(facilityModifierForClimate(CITY_EVENTS.dryWildfire, 'green', 2)).toMatchObject({ negative: 0.75 });
  expect(facilityModifierForClimate(CITY_EVENTS.dryWildfire, 'green', 3)).toMatchObject({ negative: 1 });
});

test('city modifiers derive water limits and compose compound phases without mutation', () => {
  expect(cityModifierForClimate(CITY_EVENTS.drought, { baselineWater: 20 })).toMatchObject({
    waterLimit: 14,
    waterLimitRatio: 0.7,
    coolingEffectiveness: 1.25,
  });
  const compound = composeClimateDefinitions([CITY_EVENTS.heatwave, CITY_EVENTS.drought]);
  expect(facilityModifierForClimate(compound, 'data')).toMatchObject({ water: 1.38 });
  expect(cityModifierForClimate(compound, { baselineWater: 20 }).waterLimit).toBe(14);
});

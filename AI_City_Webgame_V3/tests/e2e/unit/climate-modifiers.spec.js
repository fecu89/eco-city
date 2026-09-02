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
  // 가뭄 한도는 "예보 직전 사용량 그대로"(비율 1.0)다. 냉각 부담이 커지므로 유지 자체가 과제다.
  expect(cityModifierForClimate(CITY_EVENTS.drought, { baselineWater: 20 })).toMatchObject({
    waterLimit: 20,
    waterLimitRatio: 1,
    coolingEffectiveness: 1.25,
  });
  // 물 한도를 선언하지 않은 행사는 한도를 만들지 않는다.
  expect(cityModifierForClimate(CITY_EVENTS.heatwave, { baselineWater: 20 }).waterLimit).toBe(null);
  const compound = composeClimateDefinitions([CITY_EVENTS.heatwave, CITY_EVENTS.drought]);
  expect(facilityModifierForClimate(compound, 'data')).toMatchObject({ water: 1.38 });
  expect(cityModifierForClimate(compound, { baselineWater: 20 }).waterLimit).toBe(20);
});

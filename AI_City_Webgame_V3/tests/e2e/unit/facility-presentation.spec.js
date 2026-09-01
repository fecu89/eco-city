import { test, expect } from '@playwright/test';
import { effectiveFacilityStats } from '../../../src/systems/CityModifierSystem.js';
import { facilityPresentation } from '../../../src/ui/DockView.js';

test('build detail presents residential earnings as a clear guaranteed-to-maximum tax range', () => {
  const presentation = facilityPresentation('residential');
  const stats = effectiveFacilityStats({ type: 'residential', level: 1, operationMode: 'normal' });

  expect(presentation).toMatchObject({
    economyLabel: '주거 세금',
    money: '+0.13~+0.50/일',
    power: '정상 -2E/일',
    carbon: '0/일',
    water: '최대 1/일',
    laborText: '인구 +6',
  });
  expect(presentation.reference).toMatchObject({
    income: stats.income,
    upkeep: stats.upkeep,
    demand: stats.demand,
    supply: stats.supply,
    carbon: stats.carbon,
    water: stats.water,
  });
});

test('build detail exposes fixed upkeep instead of pretending power plants have zero credit impact', () => {
  expect(facilityPresentation('thermal')).toMatchObject({
    money: '고정 -0.50/일',
    power: '최대 +13E/일',
    carbon: '최대 8/일',
    water: '최대 2/일',
    laborText: '필요 인력 3명',
  });
});

test('cooling reports its real zero self-water use and contextual adjacent reduction', () => {
  const presentation = facilityPresentation('cooling');

  expect(presentation.reference.water).toBe(0);
  expect(presentation.water).toBe('자체 0 · 인접 절감');
  expect(presentation.power).toBe('정상 -1E/일');
  expect(presentation.money).toBe('고정 -0.20/일');
});

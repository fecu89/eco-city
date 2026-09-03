import { EVENT_FORECAST_DAYS } from './Constants.js';

const freezeModifiers = (modifiers = {}) => Object.freeze(Object.fromEntries(
  Object.entries(modifiers).map(([facilityType, values]) => [facilityType, Object.freeze({ ...values })]),
));

const climateEvent = ({
  id,
  label,
  icon,
  durationDays,
  description,
  preparation,
  facilityModifiers = {},
  cityModifiers = {},
  greenAbsorptionByLevel = null,
}) => Object.freeze({
  id,
  label,
  icon,
  durationDays,
  description,
  preparation,
  facilityModifiers: freezeModifiers(facilityModifiers),
  cityModifiers: Object.freeze({ ...cityModifiers }),
  greenAbsorptionByLevel: greenAbsorptionByLevel
    ? Object.freeze([...greenAbsorptionByLevel])
    : null,
});

export const CLIMATE_EVENT_DEFINITIONS = Object.freeze({
  heatwave: climateEvent({
    id: 'heatwave',
    label: '폭염',
    icon: 'thermometer-sun',
    durationDays: 8,
    description: '주거 전력과 데이터센터 물 부담이 증가하고 태양광 출력이 상승합니다.',
    preparation: '주거·냉각시설의 우선순위를 높이고 배터리 예비력을 확보하세요.',
    facilityModifiers: {
      residential: { demand: 1.25 },
      data: { water: 1.2 },
      solar: { supply: 1.1 },
    },
  }),
  monsoon: climateEvent({
    id: 'monsoon',
    label: '장마·집중호우',
    icon: 'cloud-rain-wind',
    durationDays: 6,
    description: '일조량이 급감하는 대신 풍력 출력은 소폭 상승합니다.',
    preparation: '배터리 예비력 8E를 유지하거나 실제 방전 4E를 확보하고 태양광을 대신할 발전원을 준비하세요.',
    facilityModifiers: {
      solar: { supply: 0.4 },
      wind: { supply: 1.15 },
    },
  }),
  typhoon: climateEvent({
    id: 'typhoon',
    label: '태풍',
    icon: 'tornado',
    durationDays: 6,
    description: '풍력은 안전운전으로 출력이 제한되고 태양광도 크게 감소합니다.',
    preparation: '서로 다른 발전원 두 종류와 저장 전력을 함께 준비하세요.',
    facilityModifiers: {
      wind: { supply: 0.2 },
      solar: { supply: 0.55 },
      tidal: { supply: 1 },
    },
  }),
  coldWave: climateEvent({
    id: 'coldWave',
    label: '폭설·한파',
    icon: 'snowflake',
    durationDays: 6,
    description: '주거 난방 수요가 늘고 태양광·풍력 출력이 감소합니다.',
    preparation: '주거 전력 우선순위와 안정적인 기저발전을 점검하세요.',
    facilityModifiers: {
      residential: { demand: 1.35 },
      solar: { supply: 0.55 },
      wind: { supply: 0.7 },
    },
  }),
  drought: climateEvent({
    id: 'drought',
    label: '가뭄',
    icon: 'droplets',
    durationDays: 6,
    description: '데이터센터와 핵발전의 냉각 부담이 커지는 동안 도시 물 사용량을 예보 직전 수준 이하로 유지해야 합니다.',
    preparation: '순환냉각을 물 소비가 큰 시설 옆에 연결하고 데이터센터를 절전 모드로 돌리세요.',
    facilityModifiers: {
      data: { water: 1.15 },
      nuclear: { water: 1.15 },
      cooling: { effectiveness: 1.25 },
    },
    // 한도는 "예보 직전 사용량 그대로". 냉각 강화로 늘어난 부담을 상쇄해야 지킬 수 있다.
    cityModifiers: { waterLimitRatio: 1.0 },
  }),
  stagnantAir: climateEvent({
    id: 'stagnantAir',
    label: '무풍·미세먼지',
    icon: 'cloud-fog',
    durationDays: 6,
    description: '풍력 출력이 급감하고 화력·공장의 탄소 부담이 커집니다.',
    preparation: '화력과 공장을 절전하고 저탄소 발전과 녹지를 확보하세요.',
    facilityModifiers: {
      wind: { supply: 0.25 },
      solar: { supply: 0.85 },
      thermal: { carbon: 1.25 },
      factory: { carbon: 1.15 },
    },
  }),
  dryWildfire: climateEvent({
    id: 'dryWildfire',
    label: '산불·건조',
    icon: 'flame',
    durationDays: 5,
    description: '도시 탄소가 추가되고 낮은 단계 녹지의 흡수력이 약해집니다.',
    preparation: '녹지를 분산 배치하고 탄소 배출 시설의 가동률을 낮추세요.',
    cityModifiers: { carbonFlat: 2 },
    greenAbsorptionByLevel: [1, 0.5, 0.75, 1],
  }),
  stormSurge: climateEvent({
    id: 'stormSurge',
    label: '폭풍해일',
    icon: 'waves',
    durationDays: 6,
    description: '태양광과 풍력 출력이 동시에 줄어 해안 조력발전의 가치가 커집니다.',
    preparation: '조력 연구와 외곽 조력발전 완공을 먼저 마치세요.',
    facilityModifiers: {
      solar: { supply: 0.5 },
      wind: { supply: 0.4 },
      tidal: { supply: 1 },
    },
  }),
});

const reward = ({
  credits,
  unlockFacilities = [],
  unlockResearch = [],
  upgradePermitLevel = null,
  upgradePermitFacilities = [],
  stressTest = false,
}) => Object.freeze({
  credits,
  unlockFacilities: Object.freeze([...unlockFacilities]),
  unlockResearch: Object.freeze([...unlockResearch]),
  upgradePermitLevel,
  upgradePermitFacilities: Object.freeze([...upgradePermitFacilities]),
  stressTest,
});

const climateQuest = ({
  index,
  id,
  title,
  goal,
  details,
  eventType,
  objective,
  targetDays = 4,
  carbonTarget = null,
  batteryTarget = null,
  batteryReserveTarget = null,
  generationTypeTarget = null,
  tidalEnergyTarget = null,
  entry = null,
  questReward,
}) => Object.freeze({
  index,
  id,
  title,
  goal,
  details: Object.freeze([...details]),
  eventType,
  objective,
  forecastDays: EVENT_FORECAST_DAYS,
  targetDays,
  carbonTarget,
  batteryTarget,
  batteryReserveTarget,
  generationTypeTarget,
  tidalEnergyTarget,
  entry: entry ? Object.freeze({ ...entry }) : null,
  reward: reward(questReward),
});

export const CLIMATE_QUEST_ORDER = Object.freeze([11, 12, 13, 14, 15, 16, 17, 18]);

export const CLIMATE_QUESTS = Object.freeze({
  11: climateQuest({
    index: 11,
    id: 'extreme-heat',
    title: '폭염 경보',
    goal: '폭염 중 필수시설 전력 공급률 90% 이상을 4일 연속 유지하세요.',
    details: [`${EVENT_FORECAST_DAYS}일 예보 동안 배터리와 주거 전력 우선순위를 준비하세요.`, '폭염 활성 기간에만 연속 일수가 누적됩니다.'],
    eventType: 'heatwave',
    objective: 'essential',
    questReward: { credits: 8, unlockResearch: ['green2'], upgradePermitFacilities: ['solar', 'tidal'] },
  }),
  12: climateQuest({
    index: 12,
    id: 'monsoon-response',
    title: '장마와 집중호우',
    goal: '필수시설 전력 90%를 4일 유지하고 배터리 방전 4E 또는 예비전력 8E를 확보하세요.',
    details: ['장마에는 태양광 출력이 크게 감소합니다.', '실제 방전 4E와 장마 기간 최저 예비전력 8E 중 하나를 만족하면 됩니다.'],
    eventType: 'monsoon',
    objective: 'battery',
    batteryTarget: 4,
    batteryReserveTarget: 8,
    questReward: { credits: 8, unlockResearch: ['green3'], upgradePermitLevel: 3 },
  }),
  13: climateQuest({
    index: 13,
    id: 'typhoon-safe-operation',
    title: '태풍 안전운전',
    goal: '필수시설 전력 90%와 실제 공급 발전원 2종을 같은 날 4일 유지하세요.',
    details: ['서로 다른 발전원 두 종류가 각각 0.1E 이상 실제 공급해야 합니다.', '배터리 방전은 발전원 종류로 세지 않습니다.'],
    eventType: 'typhoon',
    objective: 'diversity',
    generationTypeTarget: 2,
    questReward: { credits: 10 },
  }),
  14: climateQuest({
    index: 14,
    id: 'cold-wave-resilience',
    title: '폭설과 한파',
    goal: '주거 전력 90% 이상과 도시 흑자를 4일 연속 유지하세요.',
    details: ['한파에는 주거 전력 수요가 증가합니다.', '주거 공급과 순수익 조건을 같은 날 만족해야 합니다.'],
    eventType: 'coldWave',
    objective: 'winter',
    questReward: { credits: 10 },
  }),
  15: climateQuest({
    index: 15,
    id: 'drought-emergency',
    title: '가뭄 비상운영',
    goal: '물 제한을 지키며 데이터센터와 핵발전 전력 90%를 4일 유지하세요.',
    details: ['가동 중인 데이터센터와 핵발전이 각각 하나 이상 필요합니다.', '모든 해당 시설이 전력 기준을 만족해야 합니다.'],
    eventType: 'drought',
    objective: 'water',
    questReward: { credits: 10 },
  }),
  16: climateQuest({
    index: 16,
    id: 'stagnant-air',
    title: '무풍과 미세먼지',
    goal: 'CO₂ 8/일 이하와 필수시설 전력 90%를 4일 연속 유지하세요.',
    details: ['무풍에는 풍력 출력이 급감합니다.', '화력·공장 절전과 녹지·저탄소 발전을 조합하세요.'],
    eventType: 'stagnantAir',
    objective: 'cleanAir',
    carbonTarget: 8,
    questReward: { credits: 12 },
  }),
  17: climateQuest({
    index: 17,
    id: 'dry-wildfire',
    title: '산불과 건조',
    goal: 'CO₂ 8/일 이하와 양의 순수익을 4일 연속 유지하세요.',
    details: ['산불 기간에는 도시 고정 탄소가 추가됩니다.', '강화된 녹지는 산불 중에도 더 많은 탄소를 흡수합니다.'],
    eventType: 'dryWildfire',
    objective: 'wildfire',
    carbonTarget: 8,
    questReward: { credits: 12 },
  }),
  18: climateQuest({
    index: 18,
    id: 'storm-surge',
    title: '폭풍해일',
    goal: '조력발전으로 누적 8E를 공급하며 필수시설 전력 90%를 4일 유지하세요.',
    details: ['조력 발전 실증 연구와 조력발전 1기 완공이 먼저 필요합니다.', '조력발전이 소비시설에 실제 전달한 전력만 누적됩니다.'],
    eventType: 'stormSurge',
    objective: 'tidal',
    tidalEnergyTarget: 8,
    entry: { research: 'tidal1', facility: 'tidal' },
    questReward: { credits: 14, stressTest: true },
  }),
});

const finalPhase = ({ id, label, icon, durationDays, description = null, preparation = null, facilityModifiers = {}, cityModifiers = {}, greenAbsorptionByLevel = null }) => Object.freeze({
  id,
  label,
  icon,
  durationDays,
  description,
  preparation,
  facilityModifiers: freezeModifiers(facilityModifiers),
  cityModifiers: Object.freeze({ ...cityModifiers }),
  greenAbsorptionByLevel: greenAbsorptionByLevel ? Object.freeze([...greenAbsorptionByLevel]) : null,
});

export const FINAL_CLIMATE_PHASES = Object.freeze([
  finalPhase({ id: 'baseline', label: '기준 측정', icon: 'activity', durationDays: 3 }),
  finalPhase({
    id: 'heatDome', label: '열돔', icon: 'thermometer-sun', durationDays: 6,
    facilityModifiers: { residential: { demand: 1.35 }, data: { water: 1.3 }, nuclear: { water: 1.15 }, solar: { supply: 1.1 } },
  }),
  finalPhase({
    id: 'monsoonFront', label: '장마전선', icon: 'cloud-rain-wind', durationDays: 5,
    facilityModifiers: { solar: { supply: 0.35 }, wind: { supply: 1.1 } },
  }),
  finalPhase({
    id: 'coastalSuperstorm', label: '해안 초강풍', icon: 'waves', durationDays: 6,
    facilityModifiers: { wind: { supply: 0.1 }, solar: { supply: 0.4 }, tidal: { supply: 1 } },
  }),
  finalPhase({
    id: 'winterDisaster', label: '겨울 재난', icon: 'snowflake', durationDays: 6,
    facilityModifiers: { residential: { demand: 1.45 }, solar: { supply: 0.4 }, wind: { supply: 0.6 } },
  }),
  finalPhase({
    id: 'stagnantAir', label: '대기 정체', icon: 'cloud-fog', durationDays: 5,
    facilityModifiers: { wind: { supply: 0.2 }, solar: { supply: 0.75 }, thermal: { carbon: 1.35 }, factory: { carbon: 1.2 } },
  }),
  finalPhase({
    id: 'dryEmergency', label: '건조 위기', icon: 'flame', durationDays: 5,
    description: '도시 고정 탄소가 늘고 냉각 부담이 커지는 동안 물 사용량을 구간 직전 수준 이하로 유지해야 합니다.',
    preparation: '순환냉각을 물 소비가 큰 시설 옆에 연결하고 데이터센터를 절전 모드로 돌리세요.',
    facilityModifiers: { data: { water: 1.15 }, nuclear: { water: 1.15 }, cooling: { effectiveness: 1.25 } },
    cityModifiers: { carbonFlat: 2, waterLimitRatio: 1.0 },
    greenAbsorptionByLevel: [1, 0.5, 0.75, 1],
  }),
  finalPhase({ id: 'recovery', label: '최종 복구', icon: 'heart-pulse', durationDays: 5 }),
]);

export function climateQuestByIndex(index) {
  return CLIMATE_QUESTS[Math.trunc(Number(index))] || null;
}

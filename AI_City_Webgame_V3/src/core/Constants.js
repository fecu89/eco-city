// 모든 게임 밸런스 수치는 실제 실측값이 아니라 교수학습용 상대값이다.
// 예외: ENERGY_COMPARISON 수치는 실제 보도/연구 기반 추정치이며 출처가 명시되어 있다 (docs/gameplan.md 3단계 참고).

export const STAGES = {
  EXECUTION: 1, // 무지성 실행
  CRISIS: 2, // 위기 직면
  CONCEPTS: 3, // 개념 학습
  DIAGNOSIS: 4, // 진단
  REDESIGN: 5, // 재설계
  REPORT: 6, // 성적표 + 보너스 라운드 (선택)
};

export const STAGE_COUNT = 6;

export const STAGE_INFO = {
  [STAGES.EXECUTION]: {
    label: '1단계 · 무지성 실행',
    mission: 'AI 조언으로 5×5 도시를 성장시켜라',
    note: { icon: 'eye-off', text: '1차시: 발전점수만 공개 · 숨은 비용은 완성 후 공개' },
    advanceLabel: '1차 도시 완성',
    advanceIcon: 'arrow-right',
  },
  [STAGES.CRISIS]: {
    label: '2단계 · 위기 직면',
    mission: '성장 뒤에 숨은 비용을 확인하라',
    note: { icon: 'triangle-alert', text: '위기: 전력 · 탄소 · 냉각 비용이 공개됨' },
    advanceLabel: '원인 학습',
    advanceIcon: 'brain',
  },
  [STAGES.CONCEPTS]: {
    label: '3단계 · 개념 학습',
    mission: '위기의 원인이 되는 과학 개념을 확인하라',
    note: { icon: 'brain', text: '퀴즈 + 뇌-AI 에너지 비교 + 성찰 저널' },
    advanceLabel: '진단 시작',
    advanceIcon: 'search',
  },
  [STAGES.DIAGNOSIS]: {
    label: '4단계 · 진단',
    mission: '1차 도시를 스캔해 문제 지점을 찾아라',
    note: { icon: 'scan-search', text: '문제 타일을 클릭해 원인을 확인하세요' },
    advanceLabel: '재설계 시작',
    advanceIcon: 'hammer',
  },
  [STAGES.REDESIGN]: {
    label: '5단계 · 재설계',
    mission: '6×6 영토에서 지식으로 도시를 재설계하라',
    note: { icon: 'map', text: '확장: +11칸 · Lv.3 · 친환경 시설 · 인접 설계 2개 이상' },
    advanceLabel: '재설계 검증',
    advanceIcon: 'badge-check',
  },
  [STAGES.REPORT]: {
    label: '6단계 · 시장 성적표',
    mission: '지속가능하고 주체적인 도시를 완성했는가?',
    note: { icon: 'presentation', text: '결과 확인 · 발표 자료로 활용 가능' },
    advanceLabel: '결과 다시 보기',
    advanceIcon: 'presentation',
  },
};

export const GAME = {
  INITIAL_CREDITS: 36,
  INITIAL_GRID_SIZE: 5,
  EXPANDED_GRID_SIZE: 6,
  EXPANSION_BONUS_CREDITS: 24,
  MIN_CELLS_TO_COMPLETE_STAGE1: 5,
  AUTOSAVE_KEY: 'ai-city-save-v1',
  AUTOSAVE_DEBOUNCE_MS: 600,
};

export const CITY_CAMERA = {
  FOV: 42,
  NEAR: 0.1,
  FAR: 100,
  DISTANCE_PER_GRID: 1.55,
  POSITION_RATIO: [0.62, 0.92, 0.78],
  MIN_DISTANCE_PER_GRID: 0.72,
  MAX_DISTANCE_PER_GRID: 2.8,
  MIN_POLAR_ANGLE: 0.32,
  MAX_POLAR_ANGLE: Math.PI / 2.08,
  DAMPING_FACTOR: 0.075,
  PAN_MARGIN: 0.75,
  DRAG_THRESHOLD_PX: 7,
};

export const CITY_MOTION = {
  PLACE_MS: 480,
  UPGRADE_MS: 520,
  DEMOLISH_MS: 320,
  SELECT_PULSE_MS: 1400,
  AMBIENT_FPS: 30,
  MAX_DELTA_SECONDS: 0.1,
  WIND_RADIANS_PER_SECOND: 1.25,
  INFRA_PARTICLES_PER_CELL: 2,
};

export const CITY_ASSET_ROOT = '/assets/city-kit/';

export const CITY_ASSETS = {
  residential: { model: 'building-a.glb', height: 0.68 },
  factory: { model: 'building-m.glb', height: 0.66 },
  data: { model: 'building-d.glb', height: 0.82 },
  thermal: { model: 'building-l.glb', height: 0.78 },
  nuclear: { model: 'building-b.glb', supplement: 'chimney-large.glb', height: 0.72, supplementHeight: 0.66, supplementFootprint: 0.25 },
  solar: { model: 'building-q.glb', height: 0.55 },
  wind: { model: 'building-g.glb', height: 0.62 },
  battery: { model: 'building-r.glb', height: 0.58 },
  cooling: { model: 'building-c.glb', supplement: 'detail-tank.glb', height: 0.6, supplementHeight: 0.24, supplementFootprint: 0.28 },
  green: { model: 'building-p.glb', height: 0.5 },
};

export const CITY_ASSET_FOOTPRINT = 0.68;

export const LEVEL_VISUALS = [
  null,
  { color: 0xb7bdc9, scale: 0.86, segments: 1, palette: 'variation-c' },
  { color: 0x739fe8, scale: 1, segments: 2, palette: 'colormap' },
  { color: 0xf0a06f, scale: 1.13, segments: 3, palette: 'variation-a' },
];

export const CITY_FALLBACK_PARTS = {
  residential: [
    { shape: 'box', scale: [0.56, 0.32, 0.52], position: [0, 0.16, 0] },
    { shape: 'cone', scale: [0.45, 0.24, 0.45], position: [0, 0.44, 0], rotation: [0, Math.PI / 4, 0] },
  ],
  factory: [
    { shape: 'box', scale: [0.62, 0.3, 0.52], position: [0, 0.15, 0] },
    { shape: 'cylinder', scale: [0.09, 0.42, 0.09], position: [-0.17, 0.51, 0.06] },
    { shape: 'cylinder', scale: [0.08, 0.3, 0.08], position: [0.11, 0.45, 0.06] },
  ],
  data: [
    { shape: 'box', scale: [0.54, 0.52, 0.52], position: [0, 0.26, 0] },
    { shape: 'box', scale: [0.34, 0.05, 0.34], position: [0, 0.55, 0] },
  ],
  thermal: [
    { shape: 'box', scale: [0.55, 0.26, 0.54], position: [0, 0.13, 0] },
    { shape: 'cylinder', scale: [0.13, 0.76, 0.13], position: [0.02, 0.64, 0.02] },
  ],
  nuclear: [
    { shape: 'taper', scale: [0.68, 0.58, 0.68], position: [0, 0.29, 0] },
    { shape: 'sphere', scale: [0.34, 0.22, 0.34], position: [0, 0.6, 0] },
  ],
  solar: [
    { shape: 'cylinder', scale: [0.05, 0.28, 0.05], position: [0, 0.14, 0] },
    { shape: 'box', scale: [0.62, 0.04, 0.42], position: [0, 0.34, 0], rotation: [-0.4, 0, 0] },
  ],
  wind: [
    { shape: 'cylinder', scale: [0.05, 0.72, 0.05], position: [0, 0.36, 0] },
    { shape: 'sphere', scale: [0.08, 0.08, 0.08], position: [0, 0.72, 0] },
    { shape: 'box', scale: [0.04, 0.48, 0.07], position: [0, 0.72, 0] },
    { shape: 'box', scale: [0.04, 0.48, 0.07], position: [0, 0.72, 0], rotation: [0, 0, Math.PI / 3] },
    { shape: 'box', scale: [0.04, 0.48, 0.07], position: [0, 0.72, 0], rotation: [0, 0, -Math.PI / 3] },
  ],
  battery: [
    { shape: 'box', scale: [0.38, 0.48, 0.38], position: [0, 0.24, 0] },
    { shape: 'cylinder', scale: [0.13, 0.08, 0.13], position: [0, 0.52, 0] },
  ],
  cooling: [
    { shape: 'cylinder', scale: [0.52, 0.34, 0.52], position: [0, 0.17, 0] },
    { shape: 'sphere', scale: [0.13, 0.17, 0.13], position: [0, 0.46, 0] },
  ],
  green: [
    { shape: 'cylinder', scale: [0.04, 0.18, 0.04], position: [-0.15, 0.09, -0.05] },
    { shape: 'coneRound', scale: [0.2, 0.3, 0.2], position: [-0.15, 0.34, -0.05] },
    { shape: 'cylinder', scale: [0.035, 0.15, 0.035], position: [0.14, 0.075, 0.08] },
    { shape: 'coneRound', scale: [0.17, 0.26, 0.17], position: [0.14, 0.28, 0.08] },
  ],
};

// 레벨(1~3)별 배율. 인덱스 0은 미사용.
export const LEVEL_MULTIPLIERS = {
  output: [0, 1, 1.48, 1.92], // dev/supply
  demand: [0, 1, 1.24, 1.45],
  impact: [0, 1, 1.16, 1.30], // 양수 carbon/water
  negative: [0, 1, 1.35, 1.65], // 음수 carbon/water (감소 효과 강화)
};

export const FACILITIES = {
  residential: { name: '주거지', icon: '🏢', cost: 2, dev: 5, demand: 2, supply: 0, carbon: 0, water: 1, unlockStage: STAGES.EXECUTION, maxLevel: 3, desc: '🌳 인접 시 생활권 +4' },
  factory: { name: '공장', icon: '🏭', cost: 4, dev: 2, demand: 4, supply: 0, carbon: 2, water: 1, unlockStage: STAGES.EXECUTION, maxLevel: 3, desc: '⚡ 발전소 인접 시 생산 +7' },
  data: { name: '데이터센터', icon: '🖥️', cost: 6, dev: 10, demand: 8, supply: 0, carbon: 0, water: 5, unlockStage: STAGES.EXECUTION, maxLevel: 3, desc: '💧 냉각시설 인접 시 AI산업 +10' },
  thermal: { name: '화력발전', icon: '🔥', cost: 5, dev: 3, demand: 0, supply: 13, carbon: 8, water: 2, unlockStage: STAGES.EXECUTION, maxLevel: 3, desc: '전력↑ · 탄소 부담 큼' },
  nuclear: { name: '핵발전', icon: '⚛️', cost: 8, dev: 3, demand: 0, supply: 19, carbon: 1, water: 5, unlockStage: STAGES.EXECUTION, maxLevel: 3, desc: '💧 냉각시설 인접 시 물부담↓' },
  solar: { name: '태양광', icon: '☀️', cost: 5, dev: 3, demand: 0, supply: 7, carbon: 0, water: 0, unlockStage: STAGES.REDESIGN, maxLevel: 3, desc: '🔋 저장장치 인접 시 안정공급' },
  wind: { name: '풍력', icon: '🌬️', cost: 5, dev: 3, demand: 0, supply: 8, carbon: 0, water: 0, unlockStage: STAGES.REDESIGN, maxLevel: 3, desc: '🔋 저장장치 인접 시 안정공급' },
  battery: { name: '에너지저장', icon: '🔋', cost: 4, dev: 2, demand: 1, supply: 0, carbon: 0, water: 0, unlockStage: STAGES.REDESIGN, maxLevel: 3, desc: '☀️🌬️ 인접 재생에너지 안정화' },
  cooling: { name: '순환냉각', icon: '💧', cost: 4, dev: 1, demand: 1, supply: 0, carbon: 0, water: -5, unlockStage: STAGES.REDESIGN, maxLevel: 3, desc: '🖥️/⚛️ 인접 시 추가 효과' },
  green: { name: '녹지', icon: '🌳', cost: 2, dev: 1, demand: 0, supply: 0, carbon: -1, water: 0, unlockStage: STAGES.REDESIGN, maxLevel: 1, desc: '🏢 주거 인접 시 생활권 +4' },
};

export const BADGES = [
  { id: 'builder', icon: '🏗️', name: '첫 도시' },
  { id: 'crisis', icon: '🚨', name: '위기 발견' },
  { id: 'scholar', icon: '🧠', name: '개념 해금' },
  { id: 'diagnosis', icon: '🔍', name: '완벽 진단' },
  { id: 'expansion', icon: '🗺️', name: '영토 확장' },
  { id: 'synergy', icon: '🔗', name: '인접 설계' },
  { id: 'upgrade', icon: '⬆️', name: 'Lv.2 달성' },
  { id: 'evidence', icon: '📚', name: '근거 3개' },
  { id: 'mayor', icon: '🏅', name: '주체적 시장' },
];

// 3단계: 개념 퀴즈 은행. 매 플레이 QUIZ_SAMPLE_SIZE개를 무작위로 뽑아 출제(암기 방지).
export const QUIZ_SAMPLE_SIZE = 4;
export const QUIZ_PASS_THRESHOLD = 3;

export const QUIZ_BANK = [
  {
    id: 'power-balance',
    title: '전력수지',
    prompt: (ctx) => `신뢰가능 공급 ${ctx.baseline.reliableSupply}, 수요 ${ctx.baseline.demand}. 전력수지는?`,
    options: (ctx) => {
      const b = Math.round((ctx.baseline.reliableSupply - ctx.baseline.demand) * 10) / 10;
      return [
        { text: `${b}; 음수면 공급 부족`, correct: true },
        { text: `${ctx.baseline.demand}; 클수록 안정`, correct: false },
        { text: `${Math.round((ctx.baseline.reliableSupply + ctx.baseline.demand) * 10) / 10}; 0이면 안정`, correct: false },
        { text: `${ctx.baseline.dev}; 발전점수와 동일`, correct: false },
      ];
    },
    explain: '전력수지 = 공급−수요. 시설 업그레이드가 수요를 함께 키울 수 있다는 점도 함께 봅니다.',
  },
  {
    id: 'spatial-design',
    title: '공간 배치',
    prompt: () => '공장이 발전소와 인접할 때 생산 보너스를 주는 규칙의 학습 의미로 가장 적절한 것은?',
    options: () => [
      { text: '시설의 기능은 종류뿐 아니라 공간적 연결과 기반시설에 좌우될 수 있음을 표현한다.', correct: true },
      { text: '실제 모든 공장은 반드시 발전소 바로 옆에 있어야 한다.', correct: false },
      { text: '발전소가 공장의 원료를 직접 생산한다.', correct: false },
      { text: '인접하면 전력 손실이 항상 0이 된다.', correct: false },
    ],
    explain: '게임의 인접 규칙은 실제 거리를 재현한 것이 아니라 기반시설·연결성을 공간적으로 사고하게 하는 모델입니다.',
  },
  {
    id: 'cooling',
    title: '데이터센터 냉각',
    prompt: () => '데이터센터를 순환냉각 시설과 연결했을 때 냉각 부담을 줄이는 이유는?',
    options: () => [
      { text: '서버 연산에서 발생한 열을 제거하는 냉각 과정이 필요하기 때문', correct: true },
      { text: '데이터센터가 전기를 생산하기 때문', correct: false },
      { text: 'AI가 물을 연산 매체로 사용하기 때문', correct: false },
      { text: '냉각은 전력 사용과 무관하기 때문', correct: false },
    ],
    explain: 'AI 사용 → 연산 → 서버 발열 → 냉각이라는 물리적 연결을 모델링합니다.',
  },
  {
    id: 'verification-question',
    title: '검증형 AI 질문',
    prompt: () => '지식으로 도시를 재설계하는 단계에서 가장 좋은 AI 질문은?',
    options: () => [
      { text: '전력수지≥0, 탄소·물 감소, 인접 보너스 2개 이상을 만족하는 재설계안을 장단점과 함께 제시해줘.', correct: true },
      { text: '점수가 제일 높은 도시를 만들어줘.', correct: false },
      { text: '네가 알아서 좋은 도시를 만들어줘.', correct: false },
      { text: '1차시 답을 그대로 반복해줘.', correct: false },
    ],
    explain: '사람이 과학 개념으로 조건을 만들고 AI 답을 검증하는 것이 핵심입니다.',
  },
  {
    id: 're100',
    title: 'RE100',
    prompt: () => '학습 키워드로 제시된 "RE100"에 대한 설명으로 가장 적절한 것은?',
    options: () => [
      { text: '기업이 사용하는 전력 100%를 태양광·풍력 등 재생에너지로 충당하겠다는 국제적 자발적 캠페인이다.', correct: true },
      { text: '정부가 원자력 발전 비중을 100%로 늘리는 정책이다.', correct: false },
      { text: '데이터센터의 냉각 효율을 100%로 만드는 기술 표준이다.', correct: false },
      { text: 'AI 기업이 생성한 기사를 100% 검증하는 절차다.', correct: false },
    ],
    explain: '데이터센터를 많이 쓰는 글로벌 IT 기업들이 RE100에 참여하는 이유도 AI/데이터센터의 막대한 전력 수요와 관련이 있습니다.',
  },
  {
    id: 'renewable-storage',
    title: '재생에너지와 저장장치',
    prompt: () => '태양광·풍력을 에너지저장 시설과 인접시켰을 때 "신뢰가능 공급"이 높아지는 이유는?',
    options: () => [
      { text: '해가 없거나 바람이 없을 때도 저장된 전력을 꺼내 쓸 수 있어 공급 변동성이 줄기 때문', correct: true },
      { text: '저장장치가 태양광 패널의 발전량 자체를 늘려주기 때문', correct: false },
      { text: '저장장치가 탄소를 흡수하기 때문', correct: false },
      { text: '저장장치가 있으면 데이터센터 냉각이 필요 없어지기 때문', correct: false },
    ],
    explain: '재생에너지는 발전량이 들쭉날쭉해 그대로는 "신뢰가능 공급"으로 잡히는 비율이 낮습니다. 저장장치가 그 변동성을 완충합니다.',
  },
];

// 3단계: 뇌 vs AI 에너지 비교(인터랙티브 저울). 뇌 수치는 지도안 원문과 일치, 여러 출처가 합의.
// AI 쪽 수치는 출처마다 자릿수 가까이 차이가 나므로 "출처를 확인하라"는 수업 메시지로 그대로 활용한다.
export const ENERGY_COMPARISON = {
  brainWatts: 20,
  disclaimer: '추정치는 측정 방식·모델에 따라 자료마다 크게 다릅니다. 아래 수치는 수업용 대표값이며, 실제로는 출처를 직접 확인하는 습관이 더 중요합니다.',
  scenarios: [
    {
      id: 'single-query',
      label: '질의 1회',
      brainLabel: '사람이 20W로 같은 시간 생각',
      aiLabel: 'AI 응답 1회 (추정 0.3~3Wh, 출처마다 최대 10배 차이)',
      aiWattHoursLow: 0.3,
      aiWattHoursHigh: 3,
    },
    {
      id: 'training-cluster',
      label: '대형 모델 학습 전체',
      brainLabel: '사람 뇌 20W (지속)',
      aiLabel: '대형 언어모델 학습 1회 ≈ 1,300MWh (사람 뇌 기준 수백만 배)',
      aiMegawattHours: 1300,
    },
  ],
  sources: [
    { title: 'Texas A&M — "AI that uses less energy by mimicking the human brain" (2025)', url: 'https://stories.tamu.edu/news/2025/03/25/artificial-intelligence-that-uses-less-energy-by-mimicking-the-human-brain/' },
    { title: 'John Miedema — "Intelligence on Twenty Watts"', url: 'https://johnmiedema.substack.com/p/intelligence-on-twenty-watts' },
    { title: '"Human Brains Beat AI by 225,000 Times in Energy Efficiency"', url: 'https://medium.com/write-a-catalyst/human-brains-beat-ai-by-225-000-times-in-energy-efficiency-762b9327e8ad' },
  ],
};

export const ADVISOR_ANSWERS = {
  score: [
    '초반에는 데이터센터·공장으로 성장점수를 확보하세요. 같은 시설이라도 Lv.2가 되면 더 강해집니다.',
    '점수만 보면 고성장 시설이 유리합니다. 건물을 다시 눌러 업그레이드할 수 있습니다.',
  ],
  placement: [
    '공장은 발전소 옆, 데이터센터는 순환냉각 옆에서 보너스를 얻습니다. 주거지와 공장·화력은 붙이지 않는 편이 좋습니다.',
    '5단계에서는 태양광·풍력을 저장장치 옆에 두면 신뢰가능 전력이 높아집니다.',
  ],
  power: [
    '전력수지는 공급−수요입니다. 데이터센터·공장 업그레이드는 수요도 함께 키웁니다.',
    '재생에너지는 저장장치와 인접할 때 변동성 패널티가 크게 줄어듭니다.',
  ],
  rethink: [
    "이번에는 점수만 묻지 말고 '전력수지≥0, 탄소·물 감소, 인접 보너스 2개'를 조건으로 대안을 검토하세요.",
    '시설을 없애거나 강화하는 선택도 재설계입니다. 무엇을 왜 바꿨는지 근거를 남기세요.',
  ],
};

export const ADVISOR_PROMPT_LABELS = {
  score: '점수 전략?',
  placement: '배치 전략?',
  power: '전력 전략?',
  rethink: '재설계 전략?',
};

// 1단계: "AI 말대로 짓기" 원클릭 제안 — 항상 성장점수 관점의 정답(데이터센터 > 공장 > 주거지)만 제시해
// "AI는 점수 올리는 법만 알려주고 숨은 비용은 알려주지 않는다"는 지도안의 핵심 함정을 재현한다.
export const AI_BLIND_SUGGESTION_ORDER = ['data', 'factory', 'residential', 'thermal', 'nuclear'];

// 3단계 성찰 저널 최소 글자 수 (지도안: 1~2문장)
export const REFLECTION_MIN_LENGTH = 8;

export const EVIDENCE_MIN_LENGTH = 15;
export const EVIDENCE_MATCHES = {
  solar: ['carbon', 'renewable', 'balance'],
  wind: ['renewable', 'balance', 'carbon'],
  battery: ['balance', 'renewable', 'efficiency'],
  cooling: ['cooling', 'efficiency'],
  green: ['carbon'],
  thermal: ['balance', 'efficiency', 'carbon'],
  nuclear: ['balance', 'cooling'],
  data: ['cooling', 'balance', 'efficiency'],
  factory: ['balance', 'carbon', 'efficiency'],
  residential: ['balance', 'efficiency'],
};

export const EVIDENCE_CONCEPTS = [
  { value: 'balance', label: '전력 공급-수요 균형' },
  { value: 'cooling', label: '데이터센터 발열과 냉각수' },
  { value: 'carbon', label: '화석연료와 탄소 부담' },
  { value: 'renewable', label: '신재생에너지와 지속가능성' },
  { value: 'efficiency', label: '에너지 효율' },
];

// 6단계(선택) 보너스 라운드: 예산을 줄인 상태로 5단계 재설계를 다시 도전.
export const BONUS_ROUND = {
  creditMultiplier: 0.8,
  label: '보너스: 예산 20% 삭감 재도전',
};

export const REPORT_TIERS = [
  { min: 85, icon: '🏆', title: '그린시티 마스터' },
  { min: 70, icon: '🥇', title: '검증형 시장' },
  { min: 0, icon: '🧭', title: '성찰형 시장' },
];

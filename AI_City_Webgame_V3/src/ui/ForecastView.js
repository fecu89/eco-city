import { CITY_EVENTS, STRESS_PHASES } from '../core/EventDefinitions.js';
import { gameState } from '../core/GameState.js';
import { CAMPAIGN_QUEST_INDEXES } from '../core/CampaignProgression.js';
import { refreshIcons } from './Modal.js';

let root = null;

const UNKNOWN_EVENT = Object.freeze({
  label: '기후 이벤트',
  description: '이전 저장에서 불러온 기후 일정입니다.',
  durationDays: 0,
  icon: 'cloud',
});

function eventDefinition(type) {
  return CITY_EVENTS[type] || UNKNOWN_EVENT;
}

export function initForecastView(element) {
  root = element;
}

// 이미 SVG로 치환된 아이콘은 data-lucide만 바꿔도 그림이 그대로다 — 자리표시자 <i>로
// 되돌린 뒤 이 스트립 안에서만 다시 그린다(이름이 바뀔 때만).
function setForecastIcon(name) {
  const current = root.querySelector('svg[data-lucide], i[data-lucide]');
  if (!current || !name || current.getAttribute('data-lucide') === name) return;
  const placeholder = document.createElement('i');
  placeholder.setAttribute('data-lucide', name);
  placeholder.setAttribute('aria-hidden', 'true');
  current.replaceWith(placeholder);
  refreshIcons(root);
}

// 같은 문구를 다시 써도 손해는 없지만, 4배속에서는 매 틱 텍스트 노드가 갈리므로 바뀔 때만 쓴다.
function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

export function renderForecast() {
  if (!root) return;
  const active = gameState.events.schedule.find(({ id }) => id === gameState.events.activeId);
  const stressRunning = gameState.stressTest?.status === 'running';
  root.hidden = !active && !stressRunning;
  root.classList.toggle('active', Boolean(active) || stressRunning);
  const small = root.querySelector('small');
  const label = root.querySelector('b');
  if (stressRunning) {
    const phase = STRESS_PHASES[gameState.stressTest.phaseIndex];
    const remaining = Math.max(0, phase.durationDays - gameState.stressTest.phaseDay);
    setText(small, `최종 테스트 · ${gameState.stressTest.phaseIndex + 1}/${STRESS_PHASES.length}`);
    setText(label, `${phase.label} · ${remaining}일 남음`);
    root.title = '운영 모드·우선순위·배터리 정책을 조정할 수 있습니다.';
    setForecastIcon(phase.icon);
    return;
  }
  if (active) {
    const definition = eventDefinition(active.type);
    const remaining = Math.max(0, active.endAt - gameState.elapsedGameDays);
    setText(small, '현재 이벤트');
    setText(label, `${definition.label} · ${remaining}일 남음`);
    root.title = definition.description;
    setForecastIcon(definition.icon);
    return;
  }
  // 감춰져 있어도 상태를 적어 둔다 — 마크업이 옛 문구("CH.3에서 활성화")를 들고 있으면
  // 해금 시점이 바뀔 때마다 화면과 코드가 갈라진다.
  const climateUnlocked = gameState.questIndex >= CAMPAIGN_QUEST_INDEXES.CLIMATE_START;
  setText(small, '도시 기후 예보');
  setText(label, climateUnlocked
    ? '예보 대기'
    : `${CAMPAIGN_QUEST_INDEXES.CLIMATE_START}번째 퀘스트부터 활성화`);
  root.title = climateUnlocked
    ? '진행 중인 기후 이벤트가 없습니다.'
    : '기후 예보는 기후 대응 퀘스트부터 열립니다.';
  setForecastIcon('cloud-sun');
}

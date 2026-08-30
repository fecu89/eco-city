import { gameState } from '../core/GameState.js';
import { refreshIcons } from './Modal.js';
import { formatCredits } from './format.js';

let els = null;
let onStageUiChanged = () => {};

const QUEST_GUIDANCE = [
  { through: 4, icon: 'building-2', text: '도시 정착: 수익 시설도 전력·탄소 비용과 함께 설계하세요.' },
  { through: 5, icon: 'leaf', text: '탄소 전환: 핵발전으로 CO₂를 낮추고 도시 흑자를 유지하세요.' },
  { through: 6, icon: 'scan-search', text: '도시 진단: 탄소·냉각·송전 위험 지점 3곳을 찾으세요.' },
  { through: 14, icon: 'leaf', text: '저탄소 전환: 저장 허브와 우선순위로 기후 충격을 버티세요.' },
  { through: 15, icon: 'users', text: '시민위원회: 운영 기록을 바탕으로 최종 판단을 내리세요.' },
];

function guidanceForQuest(questIndex) {
  return QUEST_GUIDANCE.find(({ through }) => questIndex <= through) || QUEST_GUIDANCE.at(-1);
}

export function initHudView(elements, stageUiChanged) {
  els = elements;
  onStageUiChanged = stageUiChanged || (() => {});
}

export function renderHud() {
  const guidance = guidanceForQuest(gameState.questIndex);

  els.credits.textContent = formatCredits(gameState.credits, { suffix: false });
  els.turnCount.textContent = gameState.turn;

  els.phaseText.textContent = `복구 단계 ${gameState.questIndex} / 15`;
  els.missionTitle.textContent = `기후위기 생존 도시 · ${gameState.questIndex}번째 퀘스트`;
  els.teacherNote.innerHTML = `<i data-lucide="${guidance.icon}"></i><p>${guidance.text}</p>`;
  refreshIcons();
  onStageUiChanged();
}

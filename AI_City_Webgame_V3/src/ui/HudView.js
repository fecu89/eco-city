import { gameState } from '../core/GameState.js';
import { refreshIcons } from './Modal.js';
import { escapeHtml, exactNumberLabel, formatCredits } from './format.js';
import { CITY_EVENTS, EVENT_FORECAST_DAYS, STRESS_PHASES, stressTestTotalDays } from '../core/EventDefinitions.js';
import { questForState } from '../core/QuestDefinitions.js';
import { CAMPAIGN_QUEST_INDEXES } from '../core/CampaignProgression.js';

let els = null;
let onStageUiChanged = () => {};

// 각 구간의 마지막 퀘스트 번호는 캠페인 정의에서만 온다 — 숫자를 여기 적으면
// 퀘스트 순서를 바꿀 때 안내 문구만 조용히 어긋난다.
const FOUNDATION_QUEST_COUNT = CAMPAIGN_QUEST_INDEXES.FOUNDATION_END;
const PREPARATION_QUEST_COUNT = CAMPAIGN_QUEST_INDEXES.PREPARATION_END
  - CAMPAIGN_QUEST_INDEXES.PREPARATION_START + 1;
const CLIMATE_QUEST_COUNT = CAMPAIGN_QUEST_INDEXES.CLIMATE_END
  - CAMPAIGN_QUEST_INDEXES.CLIMATE_START + 1;

const QUEST_GUIDANCE = [
  { through: CAMPAIGN_QUEST_INDEXES.BASELINE_CAPTURE_QUEST, icon: 'building-2', text: '도시 정착: 수익 시설도 전력·탄소 비용과 함께 설계하세요.' },
  { through: CAMPAIGN_QUEST_INDEXES.EXECUTION_STAGE_LAST_QUEST, icon: 'leaf', text: '탄소 전환: 핵발전으로 CO₂를 낮추고 도시 흑자를 유지하세요.' },
  { through: CAMPAIGN_QUEST_INDEXES.FOUNDATION_END, icon: 'recycle', text: '물순환 전환: 데이터센터의 폐열을 순환냉각으로 관리하세요.' },
  { through: CAMPAIGN_QUEST_INDEXES.PREPARATION_END, icon: 'flask-conical', text: '전환 준비: 연구와 시설 강화를 마치고 풍력·조력 실증망을 가동하세요.' },
  { through: CAMPAIGN_QUEST_INDEXES.CLIMATE_END, icon: 'shield-check', text: '기후 대응: 저장 허브와 우선순위로 기후 충격을 버티세요.' },
  { through: CAMPAIGN_QUEST_INDEXES.FINAL_TEST, icon: 'users', text: '최종 시험: 운영 기록을 바탕으로 복합기후에 대응하세요.' },
];

function guidanceForQuest(questIndex) {
  return QUEST_GUIDANCE.find(({ through }) => questIndex <= through) || QUEST_GUIDANCE.at(-1);
}

function campaignHeader() {
  if (gameState.campaignComplete || gameState.stressTest?.status === 'passed') {
    return {
      phase: '도시 복구 완료',
      mission: '기후 생존 도시 완성',
      guidance: { icon: 'badge-check', text: '최종 운영 보고서에서 도시의 성과와 운영 프로필을 확인하세요.' },
    };
  }

  const stress = gameState.stressTest;
  if (stress && !['locked', 'legacy_complete'].includes(stress.status)) {
    const phase = stress.status === 'failed'
      ? '최종 기후시험 · 재도전'
      : stress.status === 'running'
        ? `최종 기후시험 · 구간 ${Math.min(stress.phaseIndex + 1, STRESS_PHASES.length)} / ${STRESS_PHASES.length}`
        : '최종 기후시험 · 준비';
    return {
      phase,
      mission: '대한민국 복합기후 시험',
      guidance: {
        icon: stress.status === 'failed' ? 'wrench' : 'shield-check',
        text: stress.status === 'failed'
          ? stress.result?.diagnosis?.label || '진단 결과를 확인하고 도시를 보완한 뒤 재도전하세요.'
          : `${stressTestTotalDays()}일 복합 위기를 버티면 다음 단계는 최종 운영 보고서입니다.`,
      },
    };
  }

  if (gameState.questIndex >= CAMPAIGN_QUEST_INDEXES.CLIMATE_START
    && gameState.questIndex <= CAMPAIGN_QUEST_INDEXES.CLIMATE_END) {
    const quest = questForState(gameState);
    const event = CITY_EVENTS[gameState.climateCampaign?.eventType || quest?.eventType];
    const campaign = gameState.climateCampaign || {};
    const scheduled = gameState.events.schedule.find(({ id }) => id === campaign.scheduledEventId);
    const remaining = scheduled ? Math.max(0, scheduled.startAt - gameState.elapsedGameDays) : EVENT_FORECAST_DAYS;
    const text = campaign.status === 'briefing'
      ? `퀘스트 창에서 예보를 확인하고 ${EVENT_FORECAST_DAYS}일 대비를 시작하세요.`
      : campaign.status === 'preparation'
        ? `${remaining}일 뒤 ${event?.label || quest.title}이 시작됩니다. 건설·연구·운영모드를 준비하세요.`
        : campaign.status === 'active'
          ? `${event?.label || quest.title} 대응 중입니다. 퀘스트 조건을 실시간으로 유지하세요.`
          : campaign.lastResult?.passed
            ? '대응 조건을 달성했습니다. 퀘스트 창에서 보상을 받으세요.'
            : `실패 원인을 확인하고 같은 도시로 ${EVENT_FORECAST_DAYS}일 준비부터 재도전하세요.`;
    return {
      phase: `기후 대응 ${gameState.questIndex - CAMPAIGN_QUEST_INDEXES.CLIMATE_START + 1} / ${CLIMATE_QUEST_COUNT}`,
      mission: quest.title,
      guidance: { icon: event?.icon || 'cloud-sun', text },
    };
  }

  if (gameState.questIndex >= CAMPAIGN_QUEST_INDEXES.PREPARATION_START
    && gameState.questIndex <= CAMPAIGN_QUEST_INDEXES.PREPARATION_END) {
    const quest = questForState(gameState);
    return {
      phase: `전환 준비 ${gameState.questIndex - CAMPAIGN_QUEST_INDEXES.PREPARATION_START + 1} / ${PREPARATION_QUEST_COUNT}`,
      mission: quest.title,
      guidance: guidanceForQuest(gameState.questIndex),
    };
  }

  return {
    phase: `복구 퀘스트 ${gameState.questIndex} / ${FOUNDATION_QUEST_COUNT}`,
    mission: `기초 도시 복구 · ${gameState.questIndex}번째 퀘스트`,
    guidance: guidanceForQuest(gameState.questIndex),
  };
}

export function initHudView(elements, stageUiChanged) {
  els = elements;
  onStageUiChanged = stageUiChanged || (() => {});
}

export function renderHud() {
  const header = campaignHeader();

  els.credits.textContent = formatCredits(gameState.credits, { suffix: false, compact: true });
  const creditMetric = els.credits.closest('[data-metric="credit"]');
  if (creditMetric) creditMetric.title = `보유 크레딧 ${exactNumberLabel(gameState.credits, 2)}`;
  els.turnCount.textContent = gameState.turn;

  els.phaseText.textContent = header.phase;
  els.missionTitle.textContent = header.mission;
  // 안내 문구에는 저장 파일에서 온 진단 문장이 섞일 수 있다. 저장을 손댄 브라우저에서
  // 그 문자열이 마크업으로 실행되지 않도록 반드시 이스케이프한다.
  els.teacherNote.innerHTML = `<i data-lucide="${escapeHtml(header.guidance.icon)}"></i><p>${escapeHtml(header.guidance.text)}</p>`;
  // 방금 다시 그린 노드만 넘긴다 — 문서 전체로 부르면 매 틱 페이지의 모든 아이콘이 새로 만들어진다.
  refreshIcons(els.teacherNote);
  onStageUiChanged();
}

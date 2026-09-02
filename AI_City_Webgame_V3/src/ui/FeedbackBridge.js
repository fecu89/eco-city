import { eventBus, Events } from '../core/EventBus.js';
import { FACILITIES, UI_FEEDBACK } from '../core/Constants.js';
import { QUESTS, QUEST_COUNT, questForState } from '../core/QuestDefinitions.js';
import { gameState } from '../core/GameState.js';
import { RESEARCH } from '../core/ResearchDefinitions.js';
import { rewardText } from './questText.js';

function showQuestRewardAlert(quest, result) {
  const nextQuest = result.nextQuest ? questForState(gameState, result.nextQuest) : null;
  eventBus.emit(Events.TOAST_SHOW, {
    kicker: result.campaignComplete ? '최종 퀘스트 완료' : '퀘스트 완료 · 보상 지급',
    title: `${quest.title} 완료`,
    text: rewardText(quest),
    meta: result.expandGrid
      ? '동부 또는 서부 9칸을 선택해 다음 운영 장을 시작하세요.'
      : result.expandSecondGrid
        ? `반대편 9칸과 ${FACILITIES[result.unlockedFacilities?.[0]]?.name || '재생에너지'} 실증 경로가 열렸습니다.`
      : nextQuest
      ? `LEVEL ${nextQuest.index} / ${QUEST_COUNT} · ${nextQuest.title} — ${nextQuest.goal}`
      : '최종 운영 성적표가 열렸습니다.',
    priority: true,
    kind: 'quest-alert quest-reward-alert',
    action: nextQuest ? 'quest' : null,
    actionLabel: nextQuest ? '새 퀘스트 열기' : '',
    duration: UI_FEEDBACK.QUEST_ALERT_MS,
  });
}

function showQuestAlert(quest, ready = false) {
  eventBus.emit(Events.TOAST_SHOW, {
    kicker: ready ? '퀘스트 완료 조건 달성' : '새 퀘스트 시작',
    title: `LEVEL ${quest.index} / ${QUEST_COUNT} · ${quest.title}`,
    text: quest.goal,
    meta: rewardText(quest),
    priority: true,
    kind: 'quest-alert',
    action: 'quest',
    actionLabel: ready ? '보상 확인' : '퀘스트 열기',
    duration: UI_FEEDBACK.QUEST_ALERT_MS,
  });
}

// 특정 모달에 속하지 않는 범용 이벤트→토스트/효과음 연결.
export function initFeedbackBridge() {
  eventBus.on(Events.CLIMATE_QUEST_RESULT, (result) => {
    if (result.passed) return;
    const quest = QUESTS[result.questIndex - 1];
    eventBus.emit(Events.TOAST_SHOW, {
      kicker: '기후 대응 결과',
      title: `${quest?.title || '기후 재난'} 대응 실패`,
      text: '조건을 달성하지 못했습니다. 24일 준비부터 재도전할 수 있습니다.',
      meta: '도시는 그대로 유지됩니다. 시설 구성과 운영 설정을 보완해 다시 도전하세요.',
      priority: true,
      kind: 'quest-alert climate-quest-result-alert',
      action: 'quest',
      actionLabel: '퀘스트 열기',
      duration: UI_FEEDBACK.QUEST_ALERT_MS,
    });
  });

  eventBus.on(Events.QUEST_READY, ({ quest }) => {
    showQuestAlert(quest, true);
    eventBus.emit(Events.AUDIO_SFX, { name: 'correct' });
  });

  eventBus.on(Events.QUEST_CLAIMED, ({ quest, result }) => {
    showQuestRewardAlert(quest, result);
    eventBus.emit(Events.AUDIO_SFX, { name: 'click' });
  });

  eventBus.on(Events.QUEST_STARTED, ({ quest, silentAlert = false }) => {
    if (silentAlert) return;
    showQuestAlert(quest);
  });

  eventBus.on(Events.BOARD_EXPANDED, ({ settled, addedIndices = [] }) => {
    if (!settled) eventBus.emit(Events.TOAST_SHOW, { title: '도시 부지 확장', text: `새 대지 ${addedIndices.length || 9}칸 확보` });
  });

  eventBus.on(Events.RESEARCH_COMPLETED, ({ researchId }) => {
    const researchName = RESEARCH[researchId]?.name || '도시 기술';
    eventBus.emit(Events.TOAST_SHOW, {
      title: '연구 완료',
      text: `${researchName} 연구가 완료되어 도시 시설에 적용됩니다.`,
      priority: true,
    });
    eventBus.emit(Events.AUDIO_SFX, { name: 'correct' });
  });

  eventBus.on(Events.RESEARCH_PROGRESS, ({ jobs = {} }) => {
    Object.entries(jobs).forEach(([researchId, result]) => {
      if (!result.becameUnderpowered) return;
      eventBus.emit(Events.TOAST_SHOW, {
        title: '연구 전력 부족',
        text: `데이터센터 #${result.dataCenterIndex} · ${RESEARCH[researchId]?.name || researchId} 연구가 일시정지됐습니다.`,
        meta: '전력 공급률을 90% 이상으로 회복하세요.',
        priority: true,
        kind: 'research-power-alert',
      });
    });
  });

  eventBus.on(Events.RESEARCH_ACCELERATED, ({ appliedJobs, days }) => {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '퀴즈 연구 가속',
      text: appliedJobs.length
        ? `${RESEARCH[appliedJobs[0]]?.name || appliedJobs[0]} 연구를 ${days}일 단축했습니다.`
        : '선택한 연구가 이미 완료되었습니다.',
    });
  });
}

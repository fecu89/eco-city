import { eventBus, Events } from '../core/EventBus.js';
import { FACILITIES, UI_FEEDBACK } from '../core/Constants.js';
import { QUESTS, QUEST_COUNT } from '../core/QuestDefinitions.js';
import { formatCredits } from '../core/Money.js';
import { RESEARCH } from '../core/ResearchDefinitions.js';

function questRewardText(quest) {
  const parts = [];
  if (quest.reward.credits) parts.push(formatCredits(quest.reward.credits));
  if (quest.reward.unlockFacilities.length) {
    const names = quest.reward.unlockFacilities
      .map((facility) => FACILITIES[facility]?.name || facility)
      .join('·');
    parts.push(`${names} 해금`);
  }
  return `보상 ${parts.join(' · ') || '최종 성적표'}`;
}

function showQuestRewardAlert(quest, result) {
  const nextQuest = result.nextQuest ? QUESTS[result.nextQuest - 1] : null;
  eventBus.emit(Events.TOAST_SHOW, {
    kicker: result.campaignComplete ? '최종 퀘스트 완료' : '퀘스트 완료 · 보상 지급',
    title: `${quest.title} 완료`,
    text: questRewardText(quest),
    meta: nextQuest
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
    meta: questRewardText(quest),
    priority: true,
    kind: 'quest-alert',
    action: 'quest',
    actionLabel: ready ? '보상 확인' : '퀘스트 열기',
    duration: UI_FEEDBACK.QUEST_ALERT_MS,
  });
}

// 특정 모달에 속하지 않는 범용 이벤트→토스트/효과음 연결.
export function initFeedbackBridge() {
  eventBus.on(Events.QUEST_READY, ({ quest }) => {
    showQuestAlert(quest, true);
    eventBus.emit(Events.AUDIO_SFX, { name: 'correct' });
  });

  eventBus.on(Events.QUEST_CLAIMED, ({ quest, result }) => {
    showQuestRewardAlert(quest, result);
  });

  eventBus.on(Events.QUEST_STARTED, ({ quest, silentAlert = false }) => {
    if (silentAlert) return;
    showQuestAlert(quest);
  });

  eventBus.on(Events.BOARD_EXPANDED, ({ settled }) => {
    if (!settled) eventBus.emit(Events.TOAST_SHOW, { title: '저탄소 부지 확장', text: '육각 반경 2 → 3 · 새 대지 18칸 확보' });
  });

  eventBus.on(Events.RESEARCH_COMPLETED, ({ researchId }) => {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '연구 완료',
      text: `${researchId} 기술을 도시 시설 강화에 사용할 수 있습니다.`,
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

  eventBus.on(Events.RESEARCH_ACCELERATED, ({ appliedJobs, hours }) => {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '퀴즈 연구 가속',
      text: appliedJobs.length
        ? `${RESEARCH[appliedJobs[0]]?.name || appliedJobs[0]} 연구를 ${hours}시간 단축했습니다.`
        : '선택한 연구가 이미 완료되었습니다.',
    });
  });
}
